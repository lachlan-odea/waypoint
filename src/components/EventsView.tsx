import { useMemo, useState } from "react";
import type {
  Campaign,
  Designer,
  EventStatus,
  MarketingEvent,
  Project,
  Workspace,
} from "../types";
import { todayIso } from "../dates";
import {
  EVENT_CHECKLIST,
  EVENT_DIVISIONS,
  EVENT_STATUSES,
  checklistDone,
  eventInYear,
  eventMonthKey,
  eventPhase,
  eventSearchText,
  eventSortKey,
  eventStatusMeta,
  eventsOn,
  fiscalYear,
  followUpMissing,
  formatEventDates,
  formatUsd,
  monthTitle,
} from "../events";
import { EventModal } from "./EventModal";
import { ItineraryModal } from "./ItineraryModal";
import { ExportCsvModal } from "./ExportCsvModal";
import { csvFileName, downloadCsv, eventsCsv, eventsInRange } from "../csvExport";
import { seedEventsIfMissing } from "../firestore";
import { Icon } from "./Icon";
import { eventStatusTone } from "../statusTone";

type Props = {
  events: MarketingEvent[];
  // Waypoint campaigns, for the editor's campaign picker.
  campaigns: Campaign[];
  // The team, for the editor's lead suggestions.
  designers: Designer[];
  // Board projects an event can link as doing work for it.
  projects: Project[];
  workspaces: Workspace[];
  onOpenProject: (projectId: string) => void;
  onOpenCampaign: (campaignId: string) => void;
  // Open an event as its own page (hash route in App.tsx). Editing
  // happens there; this view only creates.
  onOpenEvent: (eventId: string) => void;
  onSave: (event: MarketingEvent) => void;
  onDelete: (id: string) => void;
  // The header's + New → Event and Export CSV, as request numbers that
  // change per click. Acted on once each, then cleared through the callback.
  createRequest?: number;
  onCreateHandled?: () => void;
  exportRequest?: number;
  onExportHandled?: () => void;
};

type Editing = { mode: "create"; initial: Partial<MarketingEvent> };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Filter value for events with no region or no marketing lead set.
const NONE = "__none__";

// Per-browser preference: the year as a table, as cards by month, or one
// month as a day grid.
const VIEW_KEY = "waypoint.events.view";
type View = "list" | "cards" | "calendar";

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Same Monday-first grid as the Social and Campaigns calendars.
function monthGrid(month: string): (string | null)[] {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const daysInMonth = new Date(y, m, 0).getDate();
  const leading = (first.getDay() + 6) % 7;
  const cells: (string | null)[] = Array(leading).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${month}-${String(d).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

// "≈ 46,705" for a converted figure, "380,000" for a US dollar one.
function spendLabel(e: MarketingEvent): string {
  if (e.investmentUsd === undefined) return "—";
  const approx = e.currency && e.currency !== "USD" ? "≈ " : "";
  return `${approx}${formatUsd(e.investmentUsd)}`;
}

// The ten-step checklist as a bar, with what's still owed after the event.
function ChecklistBar({ done, missing }: { done: number; missing: string[] }) {
  const total = EVENT_CHECKLIST.length;
  return (
    <div
      className="ev-check"
      title={
        missing.length
          ? `Needs follow-up: ${missing.join(", ")}`
          : `${done} of ${total} checklist items done`
      }
    >
      <div className="ev-check-bar" aria-hidden>
        <div
          className={`ev-check-fill ${done === total ? "full" : ""}`}
          style={{ width: `${(done / total) * 100}%` }}
        />
      </div>
      <span className="ev-check-n">
        {done}/{total}
        {missing.length > 0 && (
          <>
            {" · "}
            <span className="ev-followup">needs {missing.join(", ")}</span>
          </>
        )}
      </span>
    </div>
  );
}

export function EventsView({
  events,
  campaigns,
  designers,
  projects,
  workspaces,
  onOpenProject,
  onOpenCampaign,
  onOpenEvent,
  onSave,
  createRequest,
  onCreateHandled,
  exportRequest,
  onExportHandled,
}: Props) {
  const today = todayIso();
  const thisYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(thisYear);
  // The month the Calendar tab shows. Kept inside `year`.
  const [calMonth, setCalMonth] = useState(today.slice(0, 7));
  // "" shows every status; otherwise one status, as it stands today.
  const [statusFilter, setStatusFilter] = useState<EventStatus | "">("");
  const [divisionFilter, setDivisionFilter] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [leadFilter, setLeadFilter] = useState("");
  // Only past events still owed a feedback form, a report or results.
  const [followUpOnly, setFollowUpOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [view, setViewState] = useState<View>(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      return saved === "cards" || saved === "calendar" ? saved : "list";
    } catch {
      return "list";
    }
  });
  function setView(next: View) {
    setViewState(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Storage unavailable — the choice still holds for this page load.
    }
  }
  const [editing, setEditing] = useState<Editing | null>(null);
  // The event whose itinerary is open, from a card's or row's button.
  const [itineraryFor, setItineraryFor] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // The header's + New → Event and Export CSV land here. Done at render
  // time (setState-during-render is React's sanctioned way to derive
  // state) so there's no flash of the plain view first.
  const [handledCreate, setHandledCreate] = useState(0);
  if (createRequest && createRequest !== handledCreate) {
    setHandledCreate(createRequest);
    setEditing({ mode: "create", initial: { year, division: divisionFilter || undefined } });
    queueMicrotask(() => onCreateHandled?.());
  }
  const [handledExport, setHandledExport] = useState(0);
  if (exportRequest && exportRequest !== handledExport) {
    setHandledExport(exportRequest);
    setExporting(true);
    queueMicrotask(() => onExportHandled?.());
  }

  const q = query.trim().toLowerCase();

  // Division, region, lead and search: what the status pills and the KPIs
  // count over, so picking a status doesn't zero the others.
  const matchesScope = (e: MarketingEvent) =>
    (!divisionFilter || e.division === divisionFilter) &&
    (!regionFilter || (e.region || NONE) === regionFilter) &&
    (!leadFilter || (e.marketingLead || NONE) === leadFilter) &&
    (!q || eventSearchText(e).includes(q));
  const matchesStatus = (e: MarketingEvent) =>
    (!statusFilter || eventPhase(e, today) === statusFilter) &&
    (!followUpOnly || followUpMissing(e, today).length > 0);

  const yearEvents = useMemo(
    () =>
      events
        .filter((e) => eventInYear(e, year))
        .sort(
          (a, b) =>
            eventSortKey(a).localeCompare(eventSortKey(b)) ||
            a.name.localeCompare(b.name),
        ),
    [events, year],
  );

  const scoped = useMemo(
    () => yearEvents.filter(matchesScope),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [yearEvents, divisionFilter, regionFilter, leadFilter, q],
  );

  const shown = useMemo(
    () => scoped.filter(matchesStatus),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scoped, statusFilter, followUpOnly, today],
  );

  // The Calendar tab can show a month in another year, so it filters the
  // whole list rather than the year's.
  const calEvents = useMemo(
    () => events.filter((e) => matchesScope(e) && matchesStatus(e)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, divisionFilter, regionFilter, leadFilter, q, statusFilter, followUpOnly, today],
  );

  const statusCounts = useMemo(() => {
    const counts = new Map<EventStatus, number>();
    scoped.forEach((e) => {
      const ph = eventPhase(e, today);
      counts.set(ph, (counts.get(ph) ?? 0) + 1);
    });
    return counts;
  }, [scoped, today]);

  // Filter options: the built-in divisions plus anything in use; the
  // regions and leads actually in use.
  const divisions = useMemo(() => {
    const seen = new Set<string>(EVENT_DIVISIONS);
    events.forEach((e) => e.division && seen.add(e.division));
    return Array.from(seen);
  }, [events]);
  const regions = useMemo(() => {
    const seen = new Set<string>();
    events.forEach((e) => e.region && seen.add(e.region));
    return Array.from(seen).sort((a, b) => a.localeCompare(b));
  }, [events]);
  const leads = useMemo(() => {
    const seen = new Set<string>();
    events.forEach((e) => e.marketingLead && seen.add(e.marketingLead));
    return Array.from(seen).sort((a, b) => a.localeCompare(b));
  }, [events]);

  // The year's events by month, TBC ones last.
  const groups = useMemo(() => {
    const map = new Map<string, MarketingEvent[]>();
    shown.forEach((e) => {
      const key = eventMonthKey(e);
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    });
    return Array.from(map.entries()).sort(([a], [b]) =>
      (a || "9999").localeCompare(b || "9999"),
    );
  }, [shown]);

  const stats = useMemo(() => {
    let upcoming = 0;
    let live = 0;
    let done = 0;
    let followUp = 0;
    let spend = 0;
    let spendEvents = 0;
    let comms = 0;
    let opps = 0;
    scoped.forEach((e) => {
      const ph = eventPhase(e, today);
      if (ph === "live") live++;
      else if (ph === "done") done++;
      else if (ph !== "cancelled") upcoming++;
      if (followUpMissing(e, today).length > 0) followUp++;
      if (ph !== "cancelled") {
        if (e.investmentUsd) {
          spend += e.investmentUsd;
          spendEvents++;
        }
        comms += e.comms ?? 0;
        opps += e.opps ?? 0;
      }
    });
    return { upcoming, live, done, followUp, spend, spendEvents, comms, opps };
  }, [scoped, today]);

  const anyFilter =
    !!statusFilter || !!divisionFilter || !!regionFilter || !!leadFilter || followUpOnly || !!q;

  function clearFilters() {
    setStatusFilter("");
    setDivisionFilter("");
    setRegionFilter("");
    setLeadFilter("");
    setFollowUpOnly(false);
    setQuery("");
  }

  function goYear(next: number) {
    setYear(next);
    setCalMonth((m) => `${next}${m.slice(4)}`);
  }

  function goMonth(next: string) {
    setCalMonth(next);
    setYear(Number(next.slice(0, 4)));
  }

  function openCreate(startDate?: string) {
    setEditing({
      mode: "create",
      initial: {
        year,
        startDate,
        endDate: startDate,
        division: divisionFilter || undefined,
        region: regionFilter && regionFilter !== NONE ? regionFilter : undefined,
        marketingLead: leadFilter && leadFilter !== NONE ? leadFilter : undefined,
      },
    });
  }

  function openEdit(e: MarketingEvent) {
    onOpenEvent(e.id);
  }

  // Follow a saved event to its year (and, on the Calendar tab, its month)
  // so it doesn't vanish on save.
  function save(event: MarketingEvent) {
    onSave(event);
    setEditing(null);
    if (!eventInYear(event, year)) {
      goYear(event.startDate ? Number(event.startDate.slice(0, 4)) : event.year);
    }
    if (event.startDate && view === "calendar") setCalMonth(event.startDate.slice(0, 7));
  }

  function openProject(projectId: string) {
    setEditing(null);
    onOpenProject(projectId);
  }

  function openCampaign(campaignId: string) {
    setEditing(null);
    onOpenCampaign(campaignId);
  }

  function importPortalExport() {
    setImporting(true);
    setNotice(null);
    seedEventsIfMissing()
      .then((n) => {
        setNotice(
          n === 0
            ? "Nothing imported — there are already events here."
            : `Imported ${n} events from the portal export.`,
        );
      })
      .catch((err) => {
        console.error("Events import failed", err);
        const message = err instanceof Error ? err.message : String(err);
        setNotice(
          /permission/i.test(message)
            ? "Import failed: Firestore refused the write. The /events rule in firestore.rules hasn't been deployed yet — deploy it, reload, then import again."
            : `Import failed: ${message}`,
        );
      })
      .finally(() => setImporting(false));
  }

  // Every event touching the range, whatever filters are on screen.
  function exportCsv(from: string, to: string) {
    downloadCsv(
      csvFileName("events", from, to),
      eventsCsv(eventsInRange(events, from, to), today),
    );
    setExporting(false);
  }

  const cells = useMemo(() => monthGrid(calMonth), [calMonth]);
  const calTitle = monthTitle(calMonth);
  const tbcThisMonth = calEvents.filter((e) => !e.startDate && e.tbcMonth === calMonth);

  const filterSummary = [
    statusFilter ? eventStatusMeta(statusFilter).label.toLowerCase() : "",
    divisionFilter,
    regionFilter ? (regionFilter === NONE ? "no region" : regionFilter) : "",
    leadFilter ? (leadFilter === NONE ? "no marketing lead" : `led by ${leadFilter}`) : "",
    followUpOnly ? "needing follow-up" : "",
    q ? `matching “${query.trim()}”` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="workspace-section soc events">
      <div className="soc-toolbar">
        <div className="soc-monthnav">
          <button
            className="btn-mini"
            onClick={() => goYear(year - 1)}
            aria-label="Previous year"
          >
            <Icon name="chevron-left" size={16} />
          </button>
          <h2 className="soc-month-title ev-year-title">{year}</h2>
          <button
            className="btn-mini"
            onClick={() => goYear(year + 1)}
            aria-label="Next year"
          >
            <Icon name="chevron-right" size={16} />
          </button>
          {year !== thisYear && (
            <button className="btn-mini" onClick={() => goYear(thisYear)}>
              This year
            </button>
          )}
        </div>

        <div className="filter-quick soc-types" role="group" aria-label="Filter by status">
          <button
            className={statusFilter === "" ? "active" : ""}
            onClick={() => setStatusFilter("")}
          >
            All statuses
          </button>
          {EVENT_STATUSES.map((s) => {
            const count = statusCounts.get(s.value) ?? 0;
            const active = statusFilter === s.value;
            return (
              <button
                key={s.value}
                className={`soc-type-pill ${active ? "active" : ""} ${
                  count === 0 ? "empty" : ""
                }`}
                style={{ ["--category" as string]: s.color } as React.CSSProperties}
                onClick={() => setStatusFilter(active ? "" : s.value)}
                aria-pressed={active}
                title={
                  s.value === "live"
                    ? "On right now"
                    : s.value === "done"
                      ? "Over, as recorded or by its dates"
                      : `${s.label} events`
                }
              >
                {s.label}
                {count > 0 && <span className="soc-type-count">{count}</span>}
              </button>
            );
          })}
        </div>

        <div className="soc-toolbar-right">
          <input
            className="search soc-search"
            placeholder="Search events…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search events"
          />
          <div className="soc-tabs" role="tablist" aria-label="List, cards or calendar">
            <button
              role="tab"
              aria-selected={view === "list"}
              className={view === "list" ? "active" : ""}
              onClick={() => setView("list")}
            >
              List
            </button>
            <button
              role="tab"
              aria-selected={view === "cards"}
              className={view === "cards" ? "active" : ""}
              onClick={() => setView("cards")}
            >
              Cards
            </button>
            <button
              role="tab"
              aria-selected={view === "calendar"}
              className={view === "calendar" ? "active" : ""}
              onClick={() => setView("calendar")}
            >
              Calendar
            </button>
          </div>
        </div>
      </div>

      <div className="soc-filters ev-filters">
        <span className="soc-filters-label">Division</span>
        <div className="filter-quick soc-types" role="group" aria-label="Filter by division">
          <button
            className={divisionFilter === "" ? "active" : ""}
            onClick={() => setDivisionFilter("")}
          >
            All
          </button>
          {divisions.map((d) => (
            <button
              key={d}
              className={divisionFilter === d ? "active" : ""}
              onClick={() => setDivisionFilter(divisionFilter === d ? "" : d)}
              aria-pressed={divisionFilter === d}
            >
              {d}
            </button>
          ))}
        </div>
        <label className="ev-filter-select">
          <span className="soc-filters-label">Region</span>
          <select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)}>
            <option value="">All regions</option>
            {regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
            <option value={NONE}>No region set</option>
          </select>
        </label>
        <label className="ev-filter-select">
          <span className="soc-filters-label">Marketing lead</span>
          <select value={leadFilter} onChange={(e) => setLeadFilter(e.target.value)}>
            <option value="">Everyone</option>
            {leads.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
            <option value={NONE}>Unassigned</option>
          </select>
        </label>
        <div className="filter-quick" role="group" aria-label="Follow-up">
          <button
            className={`soc-type-pill ${followUpOnly ? "active" : ""} ${
              stats.followUp === 0 ? "empty" : ""
            }`}
            style={{ ["--category" as string]: "#b4501f" } as React.CSSProperties}
            onClick={() => setFollowUpOnly((v) => !v)}
            aria-pressed={followUpOnly}
            title="Past events still missing a feedback form, a report or logged results"
          >
            Needs follow-up
            {stats.followUp > 0 && <span className="soc-type-count">{stats.followUp}</span>}
          </button>
        </div>
        {anyFilter && (
          <button type="button" className="link-btn soc-clear-filters" onClick={clearFilters}>
            Clear filters
          </button>
        )}
      </div>

      {events.length > 0 && (
        <div className="kpi-row ev-kpis">
          <div className="kpi planning">
            <p className="kpi-label">Upcoming</p>
            <p className="kpi-value">{stats.upcoming}</p>
            <p className="kpi-note">prospect, planning or confirmed</p>
          </div>
          <button
            type="button"
            className={`kpi live ev-kpi-btn ${statusFilter === "live" ? "selected" : ""}`}
            onClick={() => setStatusFilter(statusFilter === "live" ? "" : "live")}
            aria-pressed={statusFilter === "live"}
            title="Show only what's on right now"
          >
            <span className="kpi-label">Live now</span>
            <span className="kpi-value">{stats.live}</span>
            <span className="kpi-note">on today</span>
          </button>
          <div className="kpi completed">
            <p className="kpi-label">Done</p>
            <p className="kpi-value">{stats.done}</p>
            <p className="kpi-note">over, as recorded or by date</p>
          </div>
          <button
            type="button"
            className={`kpi overdue ev-kpi-btn ${followUpOnly ? "selected" : ""}`}
            onClick={() => setFollowUpOnly((v) => !v)}
            aria-pressed={followUpOnly}
            title="Show only past events still missing a feedback form, a report or logged results"
          >
            <span className="kpi-label">Needs follow-up</span>
            <span className="kpi-value">{stats.followUp}</span>
            <span className="kpi-note">feedback, report or results owed</span>
          </button>
          <div className="kpi">
            <p className="kpi-label">Spend (USD)</p>
            <p className="kpi-value">{formatUsd(stats.spend)}</p>
            <p className="kpi-note">
              {stats.spendEvents} event{stats.spendEvents === 1 ? "" : "s"} with a figure · cancelled excluded
            </p>
          </div>
          <div className="kpi">
            <p className="kpi-label">Comms → Opps</p>
            <p className="kpi-value">
              {stats.comms}
              <span className="kpi-sub"> → {stats.opps}</span>
            </p>
            <p className="kpi-note">
              {stats.opps > 0 && stats.spend > 0
                ? `≈ ${formatUsd(stats.spend / stats.opps)} USD per opp`
                : "logged after each event"}
            </p>
          </div>
        </div>
      )}

      <div className="soc-summary">
        <span className="muted small">
          {events.length === 0
            ? "No events yet"
            : shown.length === yearEvents.length
              ? `${yearEvents.length} event${yearEvents.length === 1 ? "" : "s"} in ${year}`
              : `${shown.length} of ${yearEvents.length} events in ${year}`}
          {filterSummary ? ` · ${filterSummary}` : ""}
          {events.length > 0 && " · open one to edit it, tick its checklist as things get done"}
        </span>
        {notice && events.length > 0 && <span className="muted small">{notice}</span>}
      </div>

      {events.length === 0 ? (
        <div className="ev-empty">
          <p className="muted" style={{ margin: 0 }}>
            Nothing here yet. Bring in the CargoWise Event Portal export — every
            2026 and 2027 trade show, with status, leads, spend and results — or
            start from scratch with + New → Event.
          </p>
          <button
            type="button"
            className="btn-mini primary"
            onClick={importPortalExport}
            disabled={importing}
          >
            {importing ? "Importing…" : "Import the portal export"}
          </button>
          {notice && (
            <p
              className={/failed/i.test(notice) ? "login-error" : "muted small"}
              style={{ margin: 0 }}
              role="status"
            >
              {notice}
            </p>
          )}
        </div>
      ) : view === "calendar" ? (
        <>
          <div className="soc-monthnav ev-cal-nav">
            <button
              className="btn-mini"
              onClick={() => goMonth(shiftMonth(calMonth, -1))}
              aria-label="Previous month"
            >
              <Icon name="chevron-left" size={16} />
            </button>
            <h2 className="soc-month-title">{calTitle}</h2>
            <button
              className="btn-mini"
              onClick={() => goMonth(shiftMonth(calMonth, 1))}
              aria-label="Next month"
            >
              <Icon name="chevron-right" size={16} />
            </button>
            {calMonth !== today.slice(0, 7) && (
              <button className="btn-mini" onClick={() => goMonth(today.slice(0, 7))}>
                Today
              </button>
            )}
            <span className="muted small" style={{ marginLeft: 8 }}>
              Click an event to open it · use + on a day to add one there
            </span>
          </div>
          <div className="soc-grid ev-cal" role="grid" aria-label={calTitle}>
            {WEEKDAYS.map((d) => (
              <div key={d} className="soc-weekday" role="columnheader">
                {d}
              </div>
            ))}
            {cells.map((iso, i) => {
              if (iso === null) {
                return <div key={`pad-${i}`} className="soc-cell pad" aria-hidden />;
              }
              const dayEvents = eventsOn(calEvents, iso);
              const weekend = [0, 6].includes(new Date(`${iso}T00:00:00`).getDay());
              return (
                <div
                  key={iso}
                  role="gridcell"
                  className={`soc-cell ev-cell ${iso === today ? "today" : ""} ${
                    weekend ? "weekend" : ""
                  }`}
                >
                  <div className="soc-cell-head">
                    <span
                      className="soc-day"
                      data-dow={WEEKDAYS[(new Date(`${iso}T00:00:00`).getDay() + 6) % 7]}
                    >
                      {Number(iso.slice(8))}
                    </span>
                    <button
                      className="soc-cell-add"
                      onClick={() => openCreate(iso)}
                      title={`New event on ${iso}`}
                      aria-label={`New event on ${iso}`}
                    >
                      +
                    </button>
                  </div>
                  {dayEvents.length > 0 && (
                    <div className="ev-cell-list">
                      {dayEvents.map((e) => {
                        const ph = eventPhase(e, today);
                        return (
                          <button
                            key={e.id}
                            type="button"
                            className={`ev-chip ${ph} ${iso !== e.startDate ? "cont" : ""}`}
                            style={{ ["--ev" as string]: eventStatusMeta(ph).color } as React.CSSProperties}
                            onClick={() => openEdit(e)}
                            title={`${e.name} · ${formatEventDates(e)}${
                              e.location ? ` · ${e.location}` : ""
                            } · ${eventStatusMeta(ph).label}`}
                          >
                            {e.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {tbcThisMonth.length > 0 && (
            <div className="ev-tbc">
              <span className="soc-filters-label">Pencilled in for {calTitle}, dates TBC</span>
              {tbcThisMonth.map((e) => {
                const ph = eventPhase(e, today);
                return (
                  <button
                    key={e.id}
                    type="button"
                    className={`ev-chip ${ph}`}
                    style={{ ["--ev" as string]: eventStatusMeta(ph).color } as React.CSSProperties}
                    onClick={() => openEdit(e)}
                  >
                    {e.name}
                  </button>
                );
              })}
            </div>
          )}
        </>
      ) : shown.length === 0 ? (
        <p className="muted">
          Nothing in {year}
          {filterSummary ? ` ${filterSummary}` : ""}.{" "}
          {anyFilter ? (
            <button type="button" className="link-btn" onClick={clearFilters}>
              Clear the filters
            </button>
          ) : (
            "Use + New → Event to add one, or step to another year."
          )}
        </p>
      ) : view === "list" ? (
        <div className="ev-table-wrap">
          <table className="campaign-table ev-table">
            <thead>
              <tr>
                <th>Dates</th>
                <th>Event</th>
                <th>Where</th>
                <th>Status</th>
                <th>Marketing lead</th>
                <th>Sales lead</th>
                <th>Campaign</th>
                <th className="num">Spend (USD)</th>
                <th className="num">Comms</th>
                <th className="num">Opps</th>
                <th>Checklist</th>
              </tr>
            </thead>
            {groups.map(([key, list]) => (
              <tbody key={key || "tbc"}>
                <tr className="ev-month-row">
                  <th colSpan={11} scope="rowgroup">
                    {key ? monthTitle(key) : "Dates to be confirmed"}
                    <span className="muted small">
                      {" "}
                      · {list.length} event{list.length === 1 ? "" : "s"}
                    </span>
                  </th>
                </tr>
                {list.map((e) => {
                  const ph = eventPhase(e, today);
                  const meta = eventStatusMeta(ph);
                  const missing = followUpMissing(e, today);
                  const onNow = !!e.startDate && e.startDate <= today && today <= e.endDate;
                  return (
                    <tr
                      key={e.id}
                      className={`ev-row ${ph} ${missing.length ? "followup" : ""}`}
                      onClick={() => openEdit(e)}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault();
                          openEdit(e);
                        }
                      }}
                      tabIndex={0}
                      title="Open the event"
                    >
                      <td className="ev-td-dates">
                        {formatEventDates(e, year)}
                        {onNow && ph !== "cancelled" && <span className="ev-now">now</span>}
                      </td>
                      <td className="ev-td-name">
                        <span className="ev-name">{e.name}</span>
                        {e.location && <span className="ev-sub muted small">{e.location}</span>}
                        <span className="ev-row-actions">
                          <button
                            type="button"
                            className="btn-mini"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setItineraryFor(e.id);
                            }}
                            onKeyDown={(ev) => ev.stopPropagation()}
                            title={
                              e.itinerary
                                ? "Open the attendee itinerary"
                                : "Draft an attendee itinerary from this event"
                            }
                          >
                            {e.itinerary ? "Itinerary" : "Generate itinerary"}
                          </button>
                          {e.itinerarySharePointUrl && (
                            <a
                              className="camp-card-sharepoint"
                              href={e.itinerarySharePointUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(ev) => ev.stopPropagation()}
                            >
                              On SharePoint <Icon name="external-link" size={12} />
                            </a>
                          )}
                        </span>
                      </td>
                      <td>
                        {e.division}
                        {e.region ? ` · ${e.region}` : ""}
                      </td>
                      <td>
                        <span className={`soc-status wp-status ${eventStatusTone(meta.value)}`}>
                          {meta.label}
                        </span>
                      </td>
                      <td>{e.marketingLead ?? <span className="muted">—</span>}</td>
                      <td>{e.salesLead ?? <span className="muted">—</span>}</td>
                      <td className="ev-td-code" title={e.campaignCode}>
                        {e.campaignCode ?? <span className="muted">—</span>}
                      </td>
                      <td className="num">{spendLabel(e)}</td>
                      <td className="num">{e.comms ?? "—"}</td>
                      <td className="num" title={e.oppsBreakdown}>
                        {e.opps ?? "—"}
                      </td>
                      <td className="ev-td-check">
                        <ChecklistBar done={checklistDone(e)} missing={missing} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
      ) : (
        groups.map(([key, list]) => (
          <div key={key || "tbc"}>
            <div className="section-head camps-list-head">
              <h2>{key ? monthTitle(key) : "Dates to be confirmed"}</h2>
              <span className="muted small">
                {list.length} event{list.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="camps-grid ev-cards">
              {list.map((e) => {
                const ph = eventPhase(e, today);
                const meta = eventStatusMeta(ph);
                const missing = followUpMissing(e, today);
                return (
                  <article
                    key={e.id}
                    className={`ev-card ${ph}`}
                    style={{ ["--ev" as string]: meta.color } as React.CSSProperties}
                  >
                    <div className="ev-card-bar" />
                    <div className="ev-card-body">
                      <div className="ev-card-top">
                        <span className={`soc-status wp-status ${eventStatusTone(meta.value)}`}>
                          {meta.label}
                        </span>
                        <span className="muted small">
                          {e.division}
                          {e.region ? ` · ${e.region}` : ""}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="camp-card-title"
                        onClick={() => openEdit(e)}
                        title="Edit event"
                      >
                        {e.name}
                      </button>
                      <p className="camp-card-dates muted small">
                        {formatEventDates(e, year)}
                        {e.location ? ` · ${e.location}` : ""}
                        {e.startDate ? ` · ${fiscalYear(e.startDate)}` : ""}
                      </p>
                      <p className="ev-card-people small">
                        {e.marketingLead ? (
                          <>
                            Marketing <strong>{e.marketingLead}</strong>
                          </>
                        ) : (
                          "No marketing lead"
                        )}
                        {e.salesLead && (
                          <>
                            {" · "}Sales <strong>{e.salesLead}</strong>
                          </>
                        )}
                      </p>
                      {(e.sponsor || e.booth || e.attendAndSell || e.speakingOpportunity) && (
                        <div className="ev-card-tags">
                          {e.sponsor && (
                            <span className="ev-tag" title={e.sponsorNote}>
                              Sponsor{e.sponsorNote ? ` · ${e.sponsorNote}` : ""}
                            </span>
                          )}
                          {e.booth && (
                            <span className="ev-tag" title={e.boothNote}>
                              Booth{e.boothNote ? ` · ${e.boothNote}` : ""}
                            </span>
                          )}
                          {e.attendAndSell && <span className="ev-tag">Attend & sell</span>}
                          {e.speakingOpportunity && (
                            <span className="ev-tag" title={e.speakingOpportunity}>
                              Speaking
                            </span>
                          )}
                        </div>
                      )}
                      <dl className="ev-card-stats">
                        <div>
                          <dt>Spend</dt>
                          <dd title={e.costDetails}>{spendLabel(e)}</dd>
                        </div>
                        <div>
                          <dt>Comms</dt>
                          <dd>{e.comms ?? "—"}</dd>
                        </div>
                        <div>
                          <dt>Opps</dt>
                          <dd title={e.oppsBreakdown}>{e.opps ?? "—"}</dd>
                        </div>
                        <div>
                          <dt>Campaign</dt>
                          <dd title={e.campaignCode}>{e.campaignCode ?? "—"}</dd>
                        </div>
                      </dl>
                      <ChecklistBar done={checklistDone(e)} missing={missing} />
                      <div className="ev-card-actions">
                        <button
                          type="button"
                          className="btn-mini"
                          onClick={() => setItineraryFor(e.id)}
                          title={
                            e.itinerary
                              ? "Open the attendee itinerary"
                              : "Draft an attendee itinerary from this event"
                          }
                        >
                          {e.itinerary ? "Itinerary" : "Generate itinerary"}
                        </button>
                        {e.itinerarySharePointUrl && (
                          <a
                            className="camp-card-sharepoint"
                            href={e.itinerarySharePointUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Itinerary on SharePoint <Icon name="external-link" size={12} />
                          </a>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ))
      )}

      {editing && editing.mode === "create" && (
        <EventModal
          mode="create"
          initial={editing.initial}
          events={events}
          campaigns={campaigns}
          designers={designers}
          projects={projects}
          workspaces={workspaces}
          onOpenProject={openProject}
          onOpenCampaign={openCampaign}
          onCancel={() => setEditing(null)}
          onSave={save}
        />
      )}
      {itineraryFor && (() => {
        const target = events.find((e) => e.id === itineraryFor);
        return target ? (
          <ItineraryModal
            key={target.id}
            event={target}
            onClose={() => setItineraryFor(null)}
            // The live subscription brings the saved itinerary back.
            onSaved={() => {}}
          />
        ) : null;
      })()}
      {exporting && (
        <ExportCsvModal
          title="Export events"
          month={calMonth}
          count={(from, to) => eventsInRange(events, from, to).length}
          noun={(n) => (n === 1 ? "event" : "events")}
          onExport={exportCsv}
          onCancel={() => setExporting(false)}
        >
          <p className="muted small" style={{ margin: 0 }}>
            Every event touching the range comes along, whatever filters are
            on — one row each, with its checklist and results. Events with no
            date yet aren't included.
          </p>
        </ExportCsvModal>
      )}
    </section>
  );
}
