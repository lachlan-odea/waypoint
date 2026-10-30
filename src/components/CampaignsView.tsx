import { useMemo, useState } from "react";
import { ActivityPortalLink } from "./ActivityPortalLink";
import type {
  Campaign,
  Designer,
  MilestoneType,
  Project,
  SocialCategory,
  SocialPost,
  Speaker,
  Workspace,
} from "../types";
import { brandColor, socialCategoryMeta } from "../constants";
import { formatShort, todayIso } from "../dates";
import {
  PHASE_LABEL,
  campaignOverlaps,
  campaignPhase,
  milestonesOn,
  monthBounds,
  spanDays,
} from "../campaigns";
import { CampaignModal } from "./CampaignModal";
import { MilestonePostLink } from "./MilestonePostLink";
import { ExportCsvModal } from "./ExportCsvModal";
import { WebinarPipeline } from "./webinar/WebinarPipeline";
import {
  MILESTONE_DRAG_MIME,
  readDraggedMilestone,
  writeDraggedMilestone,
} from "../dnd";
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
  // Open a campaign as its own page (hash route in App.tsx), optionally
  // on a tab or kit section. Editing happens there; this view only creates.
  onOpenCampaign: (campaignId: string, tab?: string) => void;
  // For "My webinars" and attribution on the webinar kit.
  currentDesignerId: string;
  // The webinar speaker directory, for the Webinars view.
  speakers: Speaker[];
  onSaveSpeaker: (speaker: Speaker) => void;
  onDeleteSpeaker: (id: string) => void;
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
  // The header's + New → Campaign and Export CSV, as request numbers that
  // change per click. Acted on once each, then cleared through the callback.
  createRequest?: number;
  onCreateHandled?: () => void;
  exportRequest?: number;
  onExportHandled?: () => void;
  // Another page asking for a particular view (the dashboard opens the
  // Webinars view directly). A fresh seq per request.
  viewRequest?: { view: "cards" | "calendar" | "webinars"; seq: number };
};

type Editing = { mode: "create"; initial: Partial<Campaign> };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Type-filter value for campaigns with no category set.
const NO_TYPE = "__none__";

// Per-browser preference: the month's campaign cards, or the day grid of
// their milestones.
const VIEW_KEY = "waypoint.campaigns.view";
type View = "cards" | "calendar" | "webinars";

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
  onOpenCampaign,
  currentDesignerId,
  speakers,
  onSaveSpeaker,
  onDeleteSpeaker,
  socialPosts,
  onOpenSocialPost,
  onSave,
  focusCampaignId,
  onFocusHandled,
  createRequest,
  onCreateHandled,
  exportRequest,
  onExportHandled,
  viewRequest,
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
  // The campaign whose milestone is under the pointer, so the rest of its
  // milestones light up across the month grid.
  const [hoverCampaignId, setHoverCampaignId] = useState<string | null>(null);
  const [view, setViewState] = useState<View>(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      return saved === "calendar" || saved === "webinars" ? saved : "cards";
    } catch {
      return "cards";
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
  // A milestone being dragged to another day, and the day it's over.
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropOver, setDropOver] = useState<string | null>(null);
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
      onOpenCampaign(c.id);
    }
    // Let the parent clear its request after this render commits.
    queueMicrotask(() => onFocusHandled?.());
  }

  // The header's + New → Campaign and Export CSV land here the same way.
  const [handledCreate, setHandledCreate] = useState(0);
  if (createRequest && createRequest !== handledCreate) {
    setHandledCreate(createRequest);
    setEditing({
      mode: "create",
      initial: {
        startDate: `${month}-01`,
        category: typeFilter && typeFilter !== NO_TYPE ? typeFilter : undefined,
      },
    });
    queueMicrotask(() => onCreateHandled?.());
  }
  const [handledView, setHandledView] = useState(0);
  if (viewRequest && viewRequest.seq !== handledView) {
    setHandledView(viewRequest.seq);
    setView(viewRequest.view);
  }
  const [handledExport, setHandledExport] = useState(0);
  if (exportRequest && exportRequest !== handledExport) {
    setHandledExport(exportRequest);
    setExporting(true);
    queueMicrotask(() => onExportHandled?.());
  }

  const matchesType = (c: Campaign) =>
    !typeFilter || (c.category || NO_TYPE) === typeFilter;
  const matchesRun = (c: Campaign) =>
    !runFilter || (runFilter === "evergreen") === !!c.evergreen;
  const matchesFilters = (c: Campaign) => matchesType(c) && matchesRun(c);

  const cells = useMemo(() => monthGrid(month), [month]);
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

  function toggleMilestone(campaign: Campaign, milestoneId: string) {
    onSave({
      ...campaign,
      milestones: campaign.milestones.map((m) =>
        m.id === milestoneId ? { ...m, done: !m.done } : m,
      ),
    });
  }

  // Drop a milestone on another day. Saving through onSave also moves the
  // milestone's social post, if it has one (App.saveCampaign).
  function moveMilestone(campaignId: string, milestoneId: string, date: string) {
    const campaign = campaigns.find((c) => c.id === campaignId);
    const milestone = campaign?.milestones.find((m) => m.id === milestoneId);
    if (!campaign || !milestone || milestone.date === date) return;
    onSave({
      ...campaign,
      milestones: campaign.milestones
        .map((m) => (m.id === milestoneId ? { ...m, date } : m))
        .sort((a, b) => a.date.localeCompare(b.date)),
    });
  }

  // Each day cell takes a dragged milestone. Only milestones: a post dragged
  // in from elsewhere has a different payload and is ignored.
  function dropHandlers(iso: string) {
    return {
      onDragOver: (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes(MILESTONE_DRAG_MIME)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDropOver(iso);
      },
      onDragLeave: () => setDropOver((cur) => (cur === iso ? null : cur)),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        setDropOver(null);
        const dragged = readDraggedMilestone(e);
        if (dragged) moveMilestone(dragged.campaignId, dragged.milestoneId, iso);
      },
    };
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
        {view !== "webinars" && (
          <>
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
          </>
        )}

        <div className="soc-toolbar-right">
          <div className="soc-tabs" role="tablist" aria-label="Cards or calendar">
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
            <button
              role="tab"
              aria-selected={view === "webinars"}
              className={view === "webinars" ? "active" : ""}
              onClick={() => setView("webinars")}
              title="The webinar pipeline: every Webinar campaign worked through the 2026 kit"
            >
              Webinars
            </button>
          </div>
        </div>
      </div>

      {view !== "webinars" && (
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
          {" · open a card to edit it, tick a milestone when it's happened"}
        </span>
      </div>
      )}

      {view === "webinars" && (
        <WebinarPipeline
          campaigns={campaigns}
          designers={designers}
          currentDesignerId={currentDesignerId}
          onOpen={onOpenCampaign}
          onCreate={(c) => onSave(c)}
          speakers={speakers}
          onSaveSpeaker={onSaveSpeaker}
          onDeleteSpeaker={onDeleteSpeaker}
        />
      )}

      {view === "cards" && (
        <>
      <div className="section-head camps-list-head">
        <h2>This month's campaigns</h2>
        <span className="muted small">
          Tick milestones off as they happen · open a card to change dates or details
        </span>
      </div>
      {monthCampaigns.length === 0 ? (
        <p className="muted">
          Nothing running in {monthLabel}. Use + New → Campaign, or switch to
          Calendar and click a day to start one there.
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
                    onClick={() => onOpenCampaign(c.id)}
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
                  <ActivityPortalLink kind="campaign" id={c.id} className="camp-card-sharepoint" short offerSetup={false} />
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
        </>
      )}

      {view === "calendar" && (
        <>
      <div className="section-head camps-list-head">
        <h2>Milestones in {monthLabel}</h2>
        <span className="muted small">
          Click a diamond to tick a milestone off · drag one to another day · hover
          one to light up the rest of its campaign · use + on a day to start a
          campaign there
        </span>
      </div>
      <div
        className={`soc-grid camps-cal ${hoverCampaignId ? "hovering" : ""}`}
        role="grid"
        aria-label={monthLabel}
      >
        {WEEKDAYS.map((d) => (
          <div key={d} className="soc-weekday" role="columnheader">
            {d}
          </div>
        ))}
        {cells.map((iso, i) => {
          if (iso === null) {
            return <div key={`pad-${i}`} className="soc-cell pad" aria-hidden />;
          }
          const marks = milestonesOn(monthCampaigns, iso);
          const weekend = [0, 6].includes(new Date(`${iso}T00:00:00`).getDay());
          return (
            <div
              key={iso}
              role="gridcell"
              className={`soc-cell camp-cell drop-target ${iso === today ? "today" : ""} ${
                weekend ? "weekend" : ""
              } ${dropOver === iso ? "drop-over" : ""}`}
              {...dropHandlers(iso)}
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
              {marks.length > 0 && (
                <div className="camp-cell-ms">
                  {marks.map(({ campaign: c, milestone: m }) => {
                    const overdue = !m.done && m.date < today;
                    return (
                      <div
                        key={m.id}
                        className={`camp-ms-card ${m.done ? "done" : ""} ${
                          overdue ? "overdue" : ""
                        } ${hoverCampaignId === c.id ? "related" : ""} ${
                          draggingId === m.id ? "dragging" : ""
                        }`}
                        style={{ ["--camp" as string]: c.color } as React.CSSProperties}
                        draggable
                        onDragStart={(e) => {
                          writeDraggedMilestone(e, c.id, m.id);
                          setDraggingId(m.id);
                          setHoverCampaignId(null);
                        }}
                        onDragEnd={() => {
                          setDraggingId(null);
                          setDropOver(null);
                        }}
                        onMouseEnter={() => setHoverCampaignId(c.id)}
                        onMouseLeave={() => setHoverCampaignId(null)}
                        onFocus={() => setHoverCampaignId(c.id)}
                        onBlur={() => setHoverCampaignId(null)}
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
                          onClick={() => onOpenCampaign(c.id)}
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
        </>
      )}

      {view !== "webinars" && upcoming.length > 0 && (
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
                  onClick={() => onOpenCampaign(c.id)}
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
