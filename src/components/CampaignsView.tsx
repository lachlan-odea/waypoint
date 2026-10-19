import { useMemo, useState } from "react";
import type {
  Campaign,
  Designer,
  MilestoneType,
  Project,
  SocialCategory,
  SocialPost,
  Workspace,
} from "../types";
import { brandColor, socialCategoryMeta } from "../constants";
import { formatShort, todayIso } from "../dates";
import {
  PHASE_LABEL,
  assignLanes,
  campaignOverlaps,
  campaignPhase,
  campaignsOn,
  milestonesOn,
  monthBounds,
  spanDays,
  weekLaneCount,
  weeksOf,
} from "../campaigns";
import { CampaignBand } from "./CampaignBand";
import { CampaignModal } from "./CampaignModal";
import { MilestonePostLink } from "./MilestonePostLink";
import { ExportCsvModal } from "./ExportCsvModal";
import {
  campaignsCsv,
  campaignsInRange,
  csvFileName,
  downloadCsv,
  milestonesCsv,
  milestonesInRange,
} from "../csvExport";

type Props = {
  campaigns: Campaign[];
  // The Social calendar's category list (Settings → Types & tags).
  // Campaigns use the same types as posts.
  categories: SocialCategory[];
  // The milestone type picker's options, from the same settings window.
  milestoneTypes: MilestoneType[];
  // The team, for the editor's owner picker.
  designers: Designer[];
  // Board projects a campaign can link as contributing to it.
  projects: Project[];
  workspaces: Workspace[];
  onOpenProject: (projectId: string) => void;
  // Every social post, to show the status of the post each social
  // milestone created, and the way to open one.
  socialPosts: SocialPost[];
  onOpenSocialPost: (postId: string) => void;
  // deletePostIds: posts to delete with milestones removed in the editor.
  onSave: (campaign: Campaign, deletePostIds?: string[]) => void;
  onDelete: (id: string) => void;
  // A campaign another view asked us to open (the Social calendar's
  // overlay hands over here). Consumed once the editor is up.
  focusCampaignId?: string | null;
  onFocusHandled?: () => void;
};

type Editing =
  | { mode: "create"; initial: Partial<Campaign> }
  | { mode: "edit"; campaign: Campaign };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Type-filter value for campaigns with no category set.
const NO_TYPE = "__none__";

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthTitle(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

// Same Monday-first grid as the Social calendar, so the two line up.
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

// Whole days from today to `iso` (negative when past).
function daysFromToday(iso: string, today: string): number {
  const a = new Date(`${today}T00:00:00`).getTime();
  const b = new Date(`${iso}T00:00:00`).getTime();
  return Math.round((b - a) / 86400000);
}

export function CampaignsView({
  campaigns,
  categories,
  milestoneTypes,
  designers,
  projects,
  workspaces,
  onOpenProject,
  socialPosts,
  onOpenSocialPost,
  onSave,
  onDelete,
  focusCampaignId,
  onFocusHandled,
}: Props) {
  const today = todayIso();
  const [month, setMonth] = useState(() => today.slice(0, 7));
  // "" shows every type; NO_TYPE shows campaigns without one.
  const [typeFilter, setTypeFilter] = useState("");
  // "" shows every campaign; otherwise only the always-on ones, or only
  // those with an end date.
  const [runFilter, setRunFilter] = useState<"" | "evergreen" | "dated">("");
  const [editing, setEditing] = useState<Editing | null>(null);
  // Which campaign card has its milestone list expanded.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [exporting, setExporting] = useState(false);
  // A row per campaign (its milestones in one cell), or a row per milestone.
  const [exportRows, setExportRows] = useState<"campaigns" | "milestones">(
    "campaigns",
  );

  // Open a campaign handed over from another view. Done at render time
  // (setState-during-render is React's sanctioned way to derive state) so
  // there's no flash of the plain view first.
  const [handledFocus, setHandledFocus] = useState<string | null>(null);
  if (focusCampaignId && focusCampaignId !== handledFocus) {
    const c = campaigns.find((x) => x.id === focusCampaignId);
    setHandledFocus(focusCampaignId);
    if (c) {
      setMonth(c.startDate.slice(0, 7));
      setEditing({ mode: "edit", campaign: c });
    }
    // Let the parent clear its request after this render commits.
    queueMicrotask(() => onFocusHandled?.());
  }

  const matchesType = (c: Campaign) =>
    !typeFilter || (c.category || NO_TYPE) === typeFilter;
  const matchesRun = (c: Campaign) =>
    !runFilter || (runFilter === "evergreen") === !!c.evergreen;
  const matchesFilters = (c: Campaign) => matchesType(c) && matchesRun(c);

  const cells = useMemo(() => monthGrid(month), [month]);
  const weeks = useMemo(() => weeksOf(cells), [cells]);
  const monthLabel = monthTitle(month);

  // Everything touching the month, before the filters — what the pills
  // count over so the counts don't collapse once you pick one. An
  // evergreen campaign touches every month from its start on.
  const monthAll = useMemo(() => {
    const { from, to } = monthBounds(month);
    return campaigns
      .filter((c) => campaignOverlaps(c, from, to))
      .sort(
        (a, b) =>
          a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name),
      );
  }, [campaigns, month]);

  const monthCampaigns = useMemo(
    () => monthAll.filter(matchesFilters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthAll, typeFilter, runFilter],
  );
  const evergreenCount = monthAll.filter((c) => c.evergreen).length;

  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    monthAll.forEach((c) => {
      const key = c.category || NO_TYPE;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return counts;
  }, [monthAll]);

  // A fixed row per campaign for the month, so its band stays level across
  // the grid.
  const lanes = useMemo(() => assignLanes(monthCampaigns), [monthCampaigns]);

  // What's coming after this month, so the page isn't a dead end at the
  // end of the current plan.
  const upcoming = useMemo(() => {
    const { to } = monthBounds(month);
    return campaigns
      .filter((c) => c.startDate > to)
      .filter(matchesFilters)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .slice(0, 5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaigns, month, typeFilter, runFilter]);

  function save(campaign: Campaign, deletePostIds: string[]) {
    onSave(campaign, deletePostIds);
    setEditing(null);
    const { from, to } = monthBounds(month);
    if (!campaignOverlaps(campaign, from, to)) {
      setMonth(campaign.startDate.slice(0, 7));
    }
  }

  function remove(id: string) {
    onDelete(id);
    setEditing(null);
  }

  function toggleMilestone(campaign: Campaign, milestoneId: string) {
    onSave({
      ...campaign,
      milestones: campaign.milestones.map((m) =>
        m.id === milestoneId ? { ...m, done: !m.done } : m,
      ),
    });
  }

  const projectTitle = (id: string) => projects.find((p) => p.id === id)?.title;

  function openProject(projectId: string) {
    setEditing(null);
    onOpenProject(projectId);
  }

  function openSocialPost(postId: string) {
    setEditing(null);
    onOpenSocialPost(postId);
  }

  function openCreate(startDate?: string) {
    setEditing({
      mode: "create",
      initial: {
        startDate: startDate ?? `${month}-01`,
        category: typeFilter && typeFilter !== NO_TYPE ? typeFilter : undefined,
      },
    });
  }

  // Every campaign in the range, whatever the type filter on screen.
  function exportCount(from: string, to: string): number {
    return exportRows === "campaigns"
      ? campaignsInRange(campaigns, from, to).length
      : milestonesInRange(campaigns, from, to).length;
  }

  function exportCsv(from: string, to: string) {
    downloadCsv(
      csvFileName(exportRows === "campaigns" ? "campaigns" : "campaign-milestones", from, to),
      exportRows === "campaigns"
        ? campaignsCsv(campaignsInRange(campaigns, from, to), projectTitle)
        : milestonesCsv(milestonesInRange(campaigns, from, to)),
    );
    setExporting(false);
  }

  function toggleExpanded(id: string) {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section className="workspace-section soc camps">
      <div className="soc-toolbar">
        <div className="soc-monthnav">
          <button
            className="btn-mini"
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            aria-label="Previous month"
          >
            ‹
          </button>
          <h2 className="soc-month-title">{monthLabel}</h2>
          <button
            className="btn-mini"
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            aria-label="Next month"
          >
            ›
          </button>
          {month !== today.slice(0, 7) && (
            <button className="btn-mini" onClick={() => setMonth(today.slice(0, 7))}>
              Today
            </button>
          )}
        </div>

        <div className="filter-quick soc-types" role="group" aria-label="Filter by type">
          <button
            className={typeFilter === "" ? "active" : ""}
            onClick={() => setTypeFilter("")}
          >
            All types
          </button>
          {categories.map((cat) => {
            const count = typeCounts.get(cat.label) ?? 0;
            const active = typeFilter === cat.label;
            return (
              <button
                key={cat.id}
                className={`soc-type-pill ${active ? "active" : ""} ${
                  count === 0 ? "empty" : ""
                }`}
                style={{ ["--category" as string]: cat.color } as React.CSSProperties}
                onClick={() => setTypeFilter(active ? "" : cat.label)}
                aria-pressed={active}
                title={cat.label}
              >
                {cat.short}
                {count > 0 && <span className="soc-type-count">{count}</span>}
              </button>
            );
          })}
          <button
            className={`soc-type-pill none ${typeFilter === NO_TYPE ? "active" : ""} ${
              (typeCounts.get(NO_TYPE) ?? 0) === 0 ? "empty" : ""
            }`}
            onClick={() => setTypeFilter(typeFilter === NO_TYPE ? "" : NO_TYPE)}
            aria-pressed={typeFilter === NO_TYPE}
            title="Campaigns with no type set yet"
          >
            No type
            {(typeCounts.get(NO_TYPE) ?? 0) > 0 && (
              <span className="soc-type-count">{typeCounts.get(NO_TYPE)}</span>
            )}
          </button>
        </div>

        <div className="filter-quick" role="group" aria-label="Evergreen or dated">
          <button
            className={runFilter === "" ? "active" : ""}
            onClick={() => setRunFilter("")}
          >
            All
          </button>
          <button
            className={runFilter === "evergreen" ? "active" : ""}
            onClick={() => setRunFilter(runFilter === "evergreen" ? "" : "evergreen")}
            aria-pressed={runFilter === "evergreen"}
            title="Only always-on campaigns"
            // The count badge takes its tint from the type pills' variable.
            style={{ ["--category" as string]: "var(--brand-violet)" } as React.CSSProperties}
          >
            Evergreen
            {evergreenCount > 0 && <span className="soc-type-count">{evergreenCount}</span>}
          </button>
          <button
            className={runFilter === "dated" ? "active" : ""}
            onClick={() => setRunFilter(runFilter === "dated" ? "" : "dated")}
            aria-pressed={runFilter === "dated"}
            title="Only campaigns with an end date"
          >
            Dated
          </button>
        </div>

        <div className="soc-toolbar-right">
          <button
            className="btn-mini"
            onClick={() => setExporting(true)}
            disabled={campaigns.length === 0}
            title="Download the campaigns in a date range as a CSV file"
          >
            Export CSV
          </button>
          <button className="primary" onClick={() => openCreate()}>
            + New campaign
          </button>
        </div>
      </div>

      <div className="soc-summary">
        <span className="muted small">
          {monthCampaigns.length === 0
            ? `No campaigns touch ${monthLabel}`
            : `${monthCampaigns.length} campaign${
                monthCampaigns.length === 1 ? "" : "s"
              } in ${monthLabel}`}
          {typeFilter
            ? typeFilter === NO_TYPE
              ? " with no type"
              : ` of type ${typeFilter}`
            : ""}
          {runFilter === "evergreen" ? ", evergreen only" : runFilter === "dated" ? ", dated only" : ""}
          {" · click a campaign bar to edit it, tick a milestone when it's happened, use + on a day to start a campaign there"}
        </span>
      </div>

      {/* How to read the grid. The three bar styles are the same ones the
          bands use (shared CSS), so the legend is the thing itself. */}
      <div className="camps-key" role="note" aria-label="How campaigns are drawn">
        <span className="camps-key-item">
          <span className="camp-band phase-live named sample starts ends">
            <span className="camp-band-name">Live</span>
          </span>
          <span className="camps-key-text">running now — solid bar</span>
        </span>
        <span className="camps-key-item">
          <span className="camp-band phase-upcoming named sample starts ends">
            <span className="camp-band-name">Upcoming</span>
          </span>
          <span className="camps-key-text">hasn't started — hatched</span>
        </span>
        <span className="camps-key-item">
          <span className="camp-band phase-finished named sample starts ends">
            <span className="camp-band-name">✓ Finished</span>
          </span>
          <span className="camps-key-text">ended — washed out</span>
        </span>
        <span className="camps-key-item">
          <span className="camp-band phase-evergreen named sample starts">
            <span className="camp-band-name">Evergreen</span>
          </span>
          <span className="camps-key-text">always on from its start — ticked, no end</span>
        </span>
        <span className="camps-key-item">
          <span className="camp-ms-card sample">
            <span className="camp-ms-tick" aria-hidden>
              <span className="camp-ms-diamond" />
            </span>
            <span className="camp-ms-card-label">Milestone</span>
          </span>
          <span className="camps-key-text">on its day — click the diamond to tick it off</span>
        </span>
      </div>

      <div className="soc-grid camps-cal" role="grid" aria-label={monthLabel}>
        {WEEKDAYS.map((d) => (
          <div key={d} className="soc-weekday" role="columnheader">
            {d}
          </div>
        ))}
        {cells.map((iso, i) => {
          if (iso === null) {
            return <div key={`pad-${i}`} className="soc-cell pad" aria-hidden />;
          }
          const week = weeks[Math.floor(i / 7)];
          const laneCount = weekLaneCount(monthCampaigns, week, lanes);
          const running = campaignsOn(monthCampaigns, iso);
          const marks = milestonesOn(monthCampaigns, iso);
          const monday = new Date(`${iso}T00:00:00`).getDay() === 1;
          const weekend = [0, 6].includes(new Date(`${iso}T00:00:00`).getDay());
          return (
            <div
              key={iso}
              role="gridcell"
              className={`soc-cell camp-cell ${iso === today ? "today" : ""} ${
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
                  title={`New campaign starting ${iso}`}
                  aria-label={`New campaign starting ${iso}`}
                >
                  +
                </button>
              </div>
              {laneCount > 0 && (
                <div className="camp-cell-bands">
                  {Array.from({ length: laneCount }, (_, lane) => {
                    const c = running.find((x) => lanes.get(x.id) === lane);
                    return c ? (
                      <CampaignBand
                        key={c.id}
                        campaign={c}
                        iso={iso}
                        today={today}
                        showName={c.startDate === iso || monday}
                        onClick={() => setEditing({ mode: "edit", campaign: c })}
                      />
                    ) : (
                      <span key={`gap-${lane}`} className="camp-band-gap" aria-hidden />
                    );
                  })}
                </div>
              )}
              {marks.length > 0 && (
                <div className="camp-cell-ms">
                  {marks.map(({ campaign: c, milestone: m }) => {
                    const overdue = !m.done && m.date < today;
                    return (
                      <div
                        key={m.id}
                        className={`camp-ms-card ${m.done ? "done" : ""} ${
                          overdue ? "overdue" : ""
                        }`}
                        style={{ ["--camp" as string]: c.color } as React.CSSProperties}
                      >
                        <button
                          type="button"
                          className="camp-ms-tick"
                          onClick={() => toggleMilestone(c, m.id)}
                          aria-pressed={m.done}
                          aria-label={`${m.label}: ${m.done ? "done" : "not done"}`}
                          title={m.done ? "Done — click to unflag" : "Click to flag as done"}
                        >
                          <span className="camp-ms-diamond" aria-hidden />
                        </button>
                        <button
                          type="button"
                          className="camp-ms-card-body"
                          onClick={() => setEditing({ mode: "edit", campaign: c })}
                          title={`${c.name} · open the campaign`}
                        >
                          <span className="camp-ms-card-label">{m.label}</span>
                          <span className="camp-ms-card-camp">
                            {c.name}
                            {overdue ? " · overdue" : m.done ? " · done" : ""}
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="section-head camps-list-head">
        <h2>This month's campaigns</h2>
        <span className="muted small">
          Tick milestones off as they happen · open a card to change dates or details
        </span>
      </div>
      {monthCampaigns.length === 0 ? (
        <p className="muted">
          Nothing running in {monthLabel}. Use + New campaign, or click a day on
          the timeline above to start one there.
        </p>
      ) : (
        <div className="camps-grid">
          {monthCampaigns.map((c) => {
            const phase = campaignPhase(c, today);
            const done = c.milestones.filter((m) => m.done).length;
            const open = expanded.has(c.id) || c.milestones.length <= 4;
            const shown = open ? c.milestones : c.milestones.slice(0, 3);
            const phaseNote =
              phase === "evergreen"
                ? `always on ${c.startDate > today ? "from" : "since"} ${formatShort(c.startDate)}`
                : phase === "upcoming"
                ? `starts in ${daysFromToday(c.startDate, today)} day${
                    daysFromToday(c.startDate, today) === 1 ? "" : "s"
                  }`
                : phase === "live"
                  ? `${daysFromToday(c.endDate, today)} day${
                      daysFromToday(c.endDate, today) === 1 ? "" : "s"
                    } left`
                  : `ended ${formatShort(c.endDate)}`;
            return (
              <article
                key={c.id}
                className={`camp-card ${phase}`}
                style={{ ["--camp" as string]: c.color } as React.CSSProperties}
              >
                <div className="camp-card-bar" />
                <div className="camp-card-body">
                  <div className="camp-card-top">
                    <span
                      className="soc-chip"
                      style={{ background: brandColor(c.brand || "No brand") }}
                      title="Brand"
                    >
                      {c.brand || "No brand"}
                    </span>
                    <span className={`camp-phase ${phase}`} title={phaseNote}>
                      {PHASE_LABEL[phase]}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="camp-card-title"
                    onClick={() => setEditing({ mode: "edit", campaign: c })}
                    title="Edit campaign"
                  >
                    {c.name}
                  </button>
                  <p className="camp-card-dates muted small">
                    {phase === "evergreen" ? (
                      <>From {formatShort(c.startDate)} · no end</>
                    ) : (
                      <>
                        {formatShort(c.startDate)} – {formatShort(c.endDate)} ·{" "}
                        {spanDays(c)} day{spanDays(c) === 1 ? "" : "s"} · {phaseNote}
                      </>
                    )}
                    {c.owner ? ` · ${c.owner}` : ""}
                  </p>
                  {c.sharePointUrl && (
                    <a
                      className="camp-card-sharepoint"
                      href={c.sharePointUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      SharePoint page ↗
                    </a>
                  )}
                  {(() => {
                    const cat = socialCategoryMeta(c.category, categories);
                    return cat ? (
                      <span
                        className="soc-category camp-card-type"
                        style={{
                          color: cat.color,
                          borderColor: cat.color,
                          ["--category" as string]: cat.color,
                        } as React.CSSProperties}
                        title={`Type: ${cat.label}`}
                      >
                        {cat.label}
                      </span>
                    ) : null;
                  })()}
                  {c.description && (
                    <p className="camp-card-desc">{c.description}</p>
                  )}
                  {(c.projectIds ?? []).length > 0 && (
                    <div className="camp-card-projects">
                      {(c.projectIds ?? []).map((id) => {
                        const title = projectTitle(id);
                        return (
                          <button
                            key={id}
                            type="button"
                            className={`camp-card-project ${title ? "" : "dangling"}`}
                            onClick={title ? () => openProject(id) : undefined}
                            disabled={!title}
                            title={title ? `Open project: ${title}` : "Project no longer exists"}
                          >
                            <svg
                              width="11"
                              height="11"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden
                            >
                              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                            </svg>
                            {title ?? "Deleted project"}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {c.milestones.length > 0 ? (
                    <>
                      <div className="camp-card-progress" title={`${done} of ${c.milestones.length} milestones done`}>
                        <div
                          className="camp-card-progress-bar"
                          style={{ width: `${(done / c.milestones.length) * 100}%` }}
                        />
                      </div>
                      <ul className="camp-card-ms">
                        {shown.map((m) => (
                          <li key={m.id}>
                            <label
                              className={`camp-card-ms-row ${m.done ? "done" : ""} ${
                                m.date < today && !m.done ? "overdue" : ""
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={m.done}
                                onChange={() => toggleMilestone(c, m.id)}
                              />
                              <span className="camp-card-ms-date">
                                {formatShort(m.date)}
                              </span>
                              <span className="camp-card-ms-label">{m.label}</span>
                            </label>
                            <MilestonePostLink
                              milestone={m}
                              socialPosts={socialPosts}
                              onOpen={openSocialPost}
                            />
                          </li>
                        ))}
                      </ul>
                      {c.milestones.length > 4 && (
                        <button
                          type="button"
                          className="link-btn camp-card-more"
                          onClick={() => toggleExpanded(c.id)}
                        >
                          {expanded.has(c.id)
                            ? "Show fewer"
                            : `Show all ${c.milestones.length} milestones`}
                        </button>
                      )}
                    </>
                  ) : (
                    <p className="muted small" style={{ margin: 0 }}>
                      No milestones yet.
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="camps-upcoming">
          <div className="section-head">
            <h2>Coming up</h2>
            <span className="muted small">After {monthLabel}</span>
          </div>
          <ul className="camps-upcoming-list">
            {upcoming.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="camps-upcoming-row"
                  onClick={() => setEditing({ mode: "edit", campaign: c })}
                >
                  <span className="camps-swatch" style={{ background: c.color }} />
                  <span className="camps-upcoming-name">{c.name}</span>
                  <span className="muted small">
                    {c.evergreen
                      ? `From ${formatShort(c.startDate)} · evergreen`
                      : `${formatShort(c.startDate)} – ${formatShort(c.endDate)}`}
                    {c.brand ? ` · ${c.brand}` : ""}
                    {c.category ? ` · ${c.category}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {editing && editing.mode === "create" && (
        <CampaignModal
          mode="create"
          initial={editing.initial}
          categories={categories}
          milestoneTypes={milestoneTypes}
          designers={designers}
          projects={projects}
          workspaces={workspaces}
          onOpenProject={openProject}
          socialPosts={socialPosts}
          onOpenSocialPost={openSocialPost}
          onCancel={() => setEditing(null)}
          onSave={save}
        />
      )}
      {editing && editing.mode === "edit" && (
        <CampaignModal
          key={editing.campaign.id}
          mode="edit"
          initial={editing.campaign}
          categories={categories}
          milestoneTypes={milestoneTypes}
          designers={designers}
          projects={projects}
          workspaces={workspaces}
          onOpenProject={openProject}
          socialPosts={socialPosts}
          onOpenSocialPost={openSocialPost}
          onCancel={() => setEditing(null)}
          onSave={save}
          onDelete={() => remove(editing.campaign.id)}
        />
      )}
      {exporting && (
        <ExportCsvModal
          title="Export the Campaigns calendar"
          month={month}
          count={exportCount}
          noun={(n) =>
            exportRows === "campaigns"
              ? n === 1 ? "campaign" : "campaigns"
              : n === 1 ? "milestone" : "milestones"
          }
          onExport={exportCsv}
          onCancel={() => setExporting(false)}
        >
          <div className="csv-rows" role="radiogroup" aria-label="One row per">
            <span className="muted small">One row per</span>
            <label className="csv-option">
              <input
                type="radio"
                name="csv-rows"
                checked={exportRows === "campaigns"}
                onChange={() => setExportRows("campaigns")}
              />
              Campaign — running at any point in the range, milestones listed in one column
            </label>
            <label className="csv-option">
              <input
                type="radio"
                name="csv-rows"
                checked={exportRows === "milestones"}
                onChange={() => setExportRows("milestones")}
              />
              Milestone — dated inside the range, with its campaign alongside
            </label>
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            Every campaign comes along, whatever type filter is on.
          </p>
        </ExportCsvModal>
      )}
    </section>
  );
}
