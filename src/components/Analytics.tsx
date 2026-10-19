import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  Campaign,
  CampaignMilestone,
  Designer,
  Project,
  ProjectStatus,
  SocialCategory,
  SocialPost,
  SocialPostStatus,
  Workspace,
} from "../types";
import { useChartTheme } from "../chartTheme";
import { contentTypesLabel, projectContentTypes } from "../contentTypes";
import {
  PROJECT_STATUSES,
  SOCIAL_POST_STATUSES,
  brandColor,
  socialCategoryMeta,
  socialChannelColor,
} from "../constants";
import {
  PHASE_LABEL,
  campaignOverlaps,
  campaignPhase,
  monthBounds,
  type CampaignPhase,
} from "../campaigns";
import { formatShort, shiftIso, todayIso } from "../dates";

type Props = {
  // Every project across every workspace. Analytics filters this down based
  // on its own workspace selector — the sidebar's currently-active workspace
  // only sets the initial selection.
  allProjects: Project[];
  // Full designer list, used to resolve assignee names in the CSV export.
  allDesigners: Designer[];
  // All known workspaces, used to populate the workspace selector.
  workspaces: Workspace[];
  // The Social calendar and campaigns are shared by every team, so the team
  // selector doesn't narrow them — only the date range does.
  socialPosts: SocialPost[];
  socialCategories: SocialCategory[];
  campaigns: Campaign[];
};

const ALL_WORKSPACES = "__all__";

// A project counts toward the "needs attention" KPIs (Urgent / Due in 7
// days / Overdue / In review) only if it's live work — active status and not
// archived. Matches the predicate used by the Overdue chip on project cards.
function isLiveWork(p: Project): boolean {
  if (p.archived) return false;
  return (p.status ?? "active") === "active";
}

// Brand steps (CargoWise Blue, Sky, a navy grey, Mint/Pine green), kept
// mid-tone so the same bars read on the white and the dark-mode panel.
const PROJECT_STATUS_COLORS: Record<ProjectStatus, string> = {
  planning: "#5b45f0",
  active: "#2f7fc0",
  paused: "#8486a3",
  completed: "#2e9e68",
};

// CargoWise Blue, lifted a step so it holds up on the dark panel too.
const NEUTRAL_BAR = "#5b45f0";

// How far ahead the campaign watch list looks for milestones still to do.
const WATCH_DAYS = 14;

function commencedDate(p: Project): string {
  return (p.createdAt || "").slice(0, 10);
}

function inRange(iso: string, from: string, to: string): boolean {
  if (!iso) return false;
  if (from && iso < from) return false;
  if (to && iso > to) return false;
  return true;
}

// A post is placed by its publish date; one still waiting for a date is
// placed by the month it's planned for, so it counts toward any range that
// touches that month.
function postInRange(p: SocialPost, from: string, to: string): boolean {
  if (!from && !to) return true;
  if (p.date) return inRange(p.date, from, to);
  if (!p.month) return false;
  const m = monthBounds(p.month);
  return (!to || m.from <= to) && (!from || m.to >= from);
}

function postMonth(p: SocialPost): string {
  return p.date ? p.date.slice(0, 7) : p.month;
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: "short",
    year: "2-digit",
  });
}

// "Live" campaigns first, then what's coming, then what's done. Evergreen
// ones never reach the date-range list, but the record needs them.
const PHASE_ORDER: Record<CampaignPhase, number> = {
  live: 0,
  upcoming: 1,
  finished: 2,
  evergreen: 3,
};

function toCsv(projects: Project[], designers: Designer[]): string {
  const designerNames = (ids: string[]) =>
    ids.length === 0
      ? "Unassigned"
      : ids
          .map((id) => designers.find((d) => d.id === id)?.name ?? "")
          .filter(Boolean)
          .join("; ");
  const header = [
    "id",
    "title",
    "priority",
    "client",
    "brand",
    "contentType",
    "assignees",
    "dueDate",
    "commencedDate",
    "milestonesTotal",
    "milestonesDone",
    "commentCount",
    "source",
  ];
  const rows = projects.map((p) => [
    p.id,
    p.title,
    p.priority,
    p.client,
    p.brand,
    contentTypesLabel(p, ""),
    designerNames(p.assigneeIds),
    p.dueDate,
    commencedDate(p),
    p.milestones.length,
    p.milestones.filter((m) => m.done).length,
    p.comments.length,
    p.source ?? "manual",
  ]);
  return [header, ...rows]
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell ?? "");
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\n");
}

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function startOfMonth(base: string): string {
  return `${base.slice(0, 7)}-01`;
}

type QuickRange = "7" | "30" | "90" | "month" | "all";

// Derive which quick-range button (if any) corresponds to the current
// from/to values. Returns null when the dates don't line up with a preset —
// e.g. the user typed a custom range. Today's-date-sensitive so it'll
// silently lose the highlight at midnight, which is fine.
function detectActiveQuickRange(from: string, to: string): QuickRange | null {
  if (!from && !to) return "all";
  if (!from || !to) return null;
  const today = todayIso();
  if (to !== today) return null;
  if (from === startOfMonth(today)) return "month";
  if (from === shiftIso(today, -6)) return "7";
  if (from === shiftIso(today, -29)) return "30";
  if (from === shiftIso(today, -89)) return "90";
  return null;
}

type WatchItem = {
  campaign: Campaign;
  milestone: CampaignMilestone;
  overdue: boolean;
};

export function Analytics({
  allProjects,
  allDesigners,
  workspaces,
  socialPosts,
  socialCategories,
  campaigns,
}: Props) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  // Default to All workspaces so the page opens on the broadest view; users
  // narrow to a specific workspace via the dropdown.
  const [selectedWorkspaceId, setSelectedWorkspaceId] =
    useState<string>(ALL_WORKSPACES);
  const today = todayIso();

  // Projects narrowed to the selected workspace (or all of them when
  // ALL_WORKSPACES is picked).
  const workspaceProjects = useMemo(() => {
    if (selectedWorkspaceId === ALL_WORKSPACES) return allProjects;
    return allProjects.filter((p) => p.workspaceId === selectedWorkspaceId);
  }, [allProjects, selectedWorkspaceId]);

  const filtered = useMemo(() => {
    if (!from && !to) return workspaceProjects;
    return workspaceProjects.filter((p) => inRange(commencedDate(p), from, to));
  }, [workspaceProjects, from, to]);

  const stats = useMemo(() => {
    const brands = new Map<string, number>();
    filtered.forEach((p) => {
      const key = p.brand || "—";
      brands.set(key, (brands.get(key) ?? 0) + 1);
    });
    const byBrand = [...brands.entries()]
      .map(([label, count]) => ({ label, count, color: brandColor(label) }))
      .sort((a, b) => b.count - a.count);
    // A project with several content types counts once against each, so
    // these bars intentionally sum to more than the project total — that's
    // what a multi-value facet looks like.
    const contentTypes = new Map<string, number>();
    filtered.forEach((p) => {
      const types = projectContentTypes(p);
      const keys = types.length > 0 ? types : ["—"];
      keys.forEach((key) => {
        contentTypes.set(key, (contentTypes.get(key) ?? 0) + 1);
      });
    });
    const byContentType = [...contentTypes.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);

    // Archived projects are out of the status bars: they're filed away, not
    // a stage of the work.
    const current = filtered.filter((p) => !p.archived);
    const byStatus = PROJECT_STATUSES.map((s) => ({
      label: s.label,
      count: current.filter((p) => (p.status ?? "active") === s.value).length,
      color: PROJECT_STATUS_COLORS[s.value],
    }));

    // "Needs attention" KPIs are scoped to live work only — completed,
    // paused, and archived projects don't count as overdue / due-soon /
    // urgent even if their due date or priority would otherwise qualify.
    const live = filtered.filter(isLiveWork);
    const dueSoonLimit = shiftIso(today, 7);
    const overdue = live.filter((p) => p.dueDate && p.dueDate < today).length;
    const dueThisWeek = live.filter(
      (p) => p.dueDate && p.dueDate >= today && p.dueDate <= dueSoonLimit,
    ).length;
    const urgentCount = live.filter((p) => p.priority === "Urgent").length;
    const inReview = live.filter((p) => (p.reviewerIds ?? []).length > 0).length;

    let totalMilestones = 0;
    let doneMilestones = 0;
    live.forEach((p) => {
      totalMilestones += p.milestones.length;
      doneMilestones += p.milestones.filter((m) => m.done).length;
    });
    const completionPct =
      totalMilestones === 0
        ? 0
        : Math.round((doneMilestones / totalMilestones) * 100);

    return {
      activeCount: live.length,
      urgentCount,
      overdue,
      dueThisWeek,
      inReview,
      byStatus,
      byBrand,
      byContentType,
      totalMilestones,
      doneMilestones,
      completionPct,
    };
  }, [filtered, today]);

  // Evergreen library posts that nobody has scheduled are reusable copy,
  // not part of the plan, so they stay out of the calendar numbers.
  const posts = useMemo(
    () =>
      socialPosts.filter(
        (p) => !(p.evergreen && !p.date) && postInRange(p, from, to),
      ),
    [socialPosts, from, to],
  );

  const social = useMemo(() => {
    const count = (s: SocialPostStatus) =>
      posts.filter((p) => p.status === s).length;
    // Still to go out: not published, not pulled, and not parked on hold —
    // an on-hold post missing a date or asset isn't something to chase yet.
    const open = posts.filter(
      (p) =>
        p.status !== "published" &&
        p.status !== "cancelled" &&
        p.status !== "onHold",
    );

    const categories = new Map<string, number>();
    const channels = new Map<string, number>();
    posts.forEach((p) => {
      const cat = p.category || "Uncategorised";
      categories.set(cat, (categories.get(cat) ?? 0) + 1);
      const ch = p.channel.trim() || "—";
      channels.set(ch, (channels.get(ch) ?? 0) + 1);
    });
    const byCategory = [...categories.entries()]
      .map(([label, n]) => ({
        label,
        count: n,
        color:
          label === "Uncategorised"
            ? "#a3a6c2"
            : (socialCategoryMeta(label, socialCategories)?.color ?? NEUTRAL_BAR),
      }))
      .sort((a, b) => b.count - a.count);
    const byChannel = [...channels.entries()]
      .map(([label, n]) => ({
        label,
        count: n,
        color: socialChannelColor(label),
      }))
      .sort((a, b) => b.count - a.count);

    // Posts per month, stacked by status. Only statuses that actually occur
    // get a series, so the legend doesn't list empty ones.
    const months = new Map<string, Record<string, number>>();
    posts.forEach((p) => {
      const m = postMonth(p);
      if (!m) return;
      const row = months.get(m) ?? {};
      row[p.status] = (row[p.status] ?? 0) + 1;
      months.set(m, row);
    });
    const byMonth = [...months.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([m, row]) => ({ month: monthLabel(m), ...row }));
    const monthStatuses = SOCIAL_POST_STATUSES.filter((s) =>
      posts.some((p) => p.status === s.value),
    );

    return {
      total: posts.length,
      published: count("published"),
      scheduled: count("scheduled"),
      draft: count("draft"),
      ready: count("pending"),
      onHold: count("onHold"),
      unscheduled: open.filter((p) => !p.date).length,
      needsAsset: open.filter((p) => !p.asset.trim()).length,
      byCategory,
      byChannel,
      byMonth,
      monthStatuses,
    };
  }, [posts, socialCategories]);

  const rangeCampaigns = useMemo(
    () =>
      campaigns
        .filter((c) => campaignOverlaps(c, from || "0000-01-01", to || "9999-12-31"))
        .map((c) => ({ campaign: c, phase: campaignPhase(c, today) }))
        .sort(
          (a, b) =>
            PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase] ||
            a.campaign.startDate.localeCompare(b.campaign.startDate),
        ),
    [campaigns, from, to, today],
  );

  const campaignStats = useMemo(() => {
    const phaseCount = (ph: CampaignPhase) =>
      rangeCampaigns.filter((c) => c.phase === ph).length;
    let total = 0;
    let done = 0;
    const watch: WatchItem[] = [];
    const watchLimit = shiftIso(today, WATCH_DAYS);
    rangeCampaigns.forEach(({ campaign }) => {
      campaign.milestones.forEach((m) => {
        total++;
        if (m.done) {
          done++;
          return;
        }
        if (!m.date || m.date > watchLimit) return;
        watch.push({ campaign, milestone: m, overdue: m.date < today });
      });
    });
    watch.sort((a, b) => a.milestone.date.localeCompare(b.milestone.date));
    return {
      live: phaseCount("live"),
      upcoming: phaseCount("upcoming"),
      finished: phaseCount("finished"),
      evergreen: phaseCount("evergreen"),
      milestonesTotal: total,
      milestonesDone: done,
      milestonesPct: total === 0 ? 0 : Math.round((done / total) * 100),
      overdueMilestones: watch.filter((w) => w.overdue).length,
      watch,
    };
  }, [rangeCampaigns, today]);

  function applyQuickRange(kind: QuickRange) {
    if (kind === "all") {
      setFrom("");
      setTo("");
      return;
    }
    if (kind === "month") {
      setFrom(startOfMonth(today));
      setTo(today);
      return;
    }
    setFrom(shiftIso(today, -Number(kind) + 1));
    setTo(today);
  }

  const activeQuickRange = detectActiveQuickRange(from, to);
  const rangeLabel = from || to ? `${from || "…"} → ${to || "…"}` : "All time";
  const teamName =
    selectedWorkspaceId === ALL_WORKSPACES
      ? "all teams"
      : (workspaces.find((w) => w.id === selectedWorkspaceId)?.name ?? "");

  return (
    <div className="analytics">
      <div className="filter-bar">
        <div className="filter-fields">
          <label className="field-inline">
            <span>Team</span>
            <select
              value={selectedWorkspaceId}
              onChange={(e) => setSelectedWorkspaceId(e.target.value)}
            >
              <option value={ALL_WORKSPACES}>All teams</option>
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field-inline">
            <span>From</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              max={to || undefined}
            />
          </label>
          <label className="field-inline">
            <span>To</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              min={from || undefined}
            />
          </label>
        </div>
        <div className="filter-quick">
          {(
            [
              ["7", "Last 7d"],
              ["30", "Last 30d"],
              ["90", "Last 90d"],
              ["month", "This month"],
              ["all", "All time"],
            ] as Array<[QuickRange, string]>
          ).map(([kind, label]) => (
            <button
              key={kind}
              className={activeQuickRange === kind ? "active" : ""}
              onClick={() => applyQuickRange(kind)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <section className="analytics-section">
        <div className="section-head">
          <h2>Projects</h2>
          <span className="muted small">
            {filtered.length} of {workspaceProjects.length} for {teamName},
            commenced {rangeLabel}
          </span>
        </div>

        <div className="kpi-row">
          <Kpi label="Active" value={stats.activeCount} variant="live" />
          <Kpi label="Overdue" value={stats.overdue} variant="overdue" />
          <Kpi label="Due in 7 days" value={stats.dueThisWeek} variant="duesoon" />
          <Kpi label="Urgent" value={stats.urgentCount} variant="urgent" />
          <Kpi label="In review" value={stats.inReview} variant="planning" />
          <CompletionKpi
            label="Active tasks"
            done={stats.doneMilestones}
            total={stats.totalMilestones}
            pct={stats.completionPct}
          />
        </div>

        <div className="panel-grid">
          <div className="panel">
            <h3>By status</h3>
            {stats.byStatus.every((s) => s.count === 0) ? (
              <p className="muted small">No data.</p>
            ) : (
              <CategoryBars data={stats.byStatus} unit="projects" />
            )}
          </div>
          <div className="panel">
            <h3>By brand</h3>
            {stats.byBrand.length === 0 ? (
              <p className="muted small">No data.</p>
            ) : (
              <CategoryBars data={stats.byBrand} unit="projects" />
            )}
          </div>
        </div>

        <div className="panel">
          <h3>By content type</h3>
          {stats.byContentType.length === 0 ? (
            <p className="muted small">No data.</p>
          ) : (
            <CategoryBars data={stats.byContentType} unit="projects" />
          )}
        </div>

        <div className="export-row">
          <button
            onClick={() =>
              download(
                `waypoint-projects-${today}.csv`,
                toCsv(filtered, allDesigners),
                "text/csv;charset=utf-8",
              )
            }
          >
            Export CSV
          </button>
          <button
            onClick={() =>
              download(
                `waypoint-projects-${today}.json`,
                JSON.stringify(filtered, null, 2),
                "application/json",
              )
            }
          >
            Export JSON
          </button>
        </div>
      </section>

      <section className="analytics-section">
        <div className="section-head">
          <h2>Social calendar</h2>
          <span className="muted small">
            {social.total} posts planned {rangeLabel === "All time" ? "in total" : rangeLabel}
            , all teams
          </span>
        </div>

        <div className="kpi-row">
          <Kpi label="Published" value={social.published} variant="completed" />
          <Kpi label="Scheduled" value={social.scheduled} variant="duesoon" />
          <Kpi label="Ready to publish" value={social.ready} />
          <Kpi label="Draft" value={social.draft} />
          <Kpi label="On hold" value={social.onHold} variant="planning" />
          <Kpi label="No date yet" value={social.unscheduled} variant="paused" />
          <Kpi label="No asset yet" value={social.needsAsset} variant="overdue" />
        </div>

        <div className="panel">
          <h3>Posts per month</h3>
          {social.byMonth.length === 0 ? (
            <p className="muted small">No posts in this range.</p>
          ) : (
            <MonthlyPosts data={social.byMonth} statuses={social.monthStatuses} />
          )}
        </div>

        <div className="panel-grid">
          <div className="panel">
            <h3>By category</h3>
            {social.byCategory.length === 0 ? (
              <p className="muted small">No data.</p>
            ) : (
              <CategoryBars data={social.byCategory} unit="posts" />
            )}
          </div>
          <div className="panel">
            <h3>By channel</h3>
            {social.byChannel.length === 0 ? (
              <p className="muted small">No data.</p>
            ) : (
              <CategoryBars data={social.byChannel} unit="posts" />
            )}
          </div>
        </div>
      </section>

      <section className="analytics-section">
        <div className="section-head">
          <h2>Campaigns</h2>
          <span className="muted small">
            {rangeCampaigns.length} running {rangeLabel === "All time" ? "in total" : rangeLabel}
            , all teams
          </span>
        </div>

        <div className="kpi-row">
          <Kpi label="Live" value={campaignStats.live} variant="live" />
          <Kpi label="Upcoming" value={campaignStats.upcoming} variant="planning" />
          <Kpi label="Finished" value={campaignStats.finished} variant="completed" />
          <Kpi label="Evergreen" value={campaignStats.evergreen} variant="paused" />
          <Kpi
            label="Overdue milestones"
            value={campaignStats.overdueMilestones}
            variant="overdue"
          />
          <CompletionKpi
            label="Milestones"
            done={campaignStats.milestonesDone}
            total={campaignStats.milestonesTotal}
            pct={campaignStats.milestonesPct}
          />
        </div>

        <div className="panel-grid">
          <div className="panel">
            <h3>Milestones to watch</h3>
            {campaignStats.watch.length === 0 ? (
              <p className="muted small">
                Nothing overdue or due in the next {WATCH_DAYS} days.
              </p>
            ) : (
              <ul className="watch-list">
                {campaignStats.watch.map(({ campaign, milestone, overdue }) => (
                  <li key={`${campaign.id}-${milestone.id}`}>
                    <span
                      className={`watch-date${overdue ? " overdue" : ""}`}
                    >
                      {formatShort(milestone.date)}
                    </span>
                    <span className="watch-label">
                      {milestone.label}
                      <span className="muted small">
                        <BrandDot color={campaign.color || brandColor(campaign.brand)} />
                        {campaign.name}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="panel">
            <h3>Campaign progress</h3>
            {rangeCampaigns.length === 0 ? (
              <p className="muted small">No campaigns in this range.</p>
            ) : (
              <table className="campaign-table">
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Dates</th>
                    <th>Milestones</th>
                    <th>Projects</th>
                  </tr>
                </thead>
                <tbody>
                  {rangeCampaigns.map(({ campaign: c, phase }) => (
                    <tr key={c.id}>
                      <td>
                        <BrandDot color={c.color || brandColor(c.brand)} />
                        {c.name}
                        <span className={`phase-tag phase-${phase}`}>
                          {PHASE_LABEL[phase]}
                        </span>
                      </td>
                      <td className="muted">
                        {formatShort(c.startDate)} – {formatShort(c.endDate)}
                      </td>
                      <td>
                        {c.milestones.filter((m) => m.done).length} /{" "}
                        {c.milestones.length}
                      </td>
                      <td>{c.projectIds.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function BrandDot({ color }: { color: string }) {
  return <span className="brand-dot" style={{ background: color }} aria-hidden />;
}

function Kpi({
  label,
  value,
  variant,
}: {
  label: string;
  value: number | string;
  variant?:
    | "urgent"
    | "overdue"
    | "duesoon"
    | "planning"
    // "live" rather than "active": the variant becomes a class on .kpi, and
    // .active is the app's ubiquitous selected-state class.
    | "live"
    | "completed"
    | "paused";
}) {
  return (
    <div className={`kpi ${variant ?? ""}`}>
      <p className="kpi-label">{label}</p>
      <p className="kpi-value">{value}</p>
    </div>
  );
}

function CompletionKpi({
  label,
  done,
  total,
  pct,
}: {
  label: string;
  done: number;
  total: number;
  pct: number;
}) {
  const theme = useChartTheme();
  return (
    <div className="kpi kpi-gauge">
      <div>
        <p className="kpi-label">{label}</p>
        <p className="kpi-value">
          {done}
          <span className="kpi-sub"> / {total}</span>
        </p>
        <p className="muted small">{pct}% complete</p>
      </div>
      <div className="kpi-gauge-chart" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            innerRadius="70%"
            outerRadius="100%"
            data={[{ value: pct, fill: theme.gaugeFill }]}
            startAngle={90}
            endAngle={-270}
          >
            <PolarAngleAxis
              type="number"
              domain={[0, 100]}
              tick={false}
              axisLine={false}
            />
            <RadialBar
              dataKey="value"
              cornerRadius={8}
              background={{ fill: theme.gaugeTrack }}
            />
          </RadialBarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

type MonthRow = { month: string } & Record<string, number | string>;

function MonthlyPosts({
  data,
  statuses,
}: {
  data: MonthRow[];
  statuses: typeof SOCIAL_POST_STATUSES;
}) {
  const theme = useChartTheme();
  return (
    <div className="chart-wrap" style={{ height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: theme.axisLabel }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: theme.axisTick }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: theme.cursorFill }}
            contentStyle={theme.tooltipContentStyle}
            labelStyle={theme.tooltipLabelStyle}
            itemStyle={theme.tooltipItemStyle}
          />
          <Legend iconType="circle" wrapperStyle={theme.legendStyle} />
          {statuses.map((s, i) => (
            <Bar
              key={s.value}
              dataKey={s.value}
              name={s.label}
              stackId="posts"
              fill={s.color}
              radius={i === statuses.length - 1 ? [4, 4, 0, 0] : 0}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

type CategoryRow = { label: string; count: number; color?: string };

function CategoryBars({ data, unit }: { data: CategoryRow[]; unit: string }) {
  const chartHeight = Math.max(180, data.length * 32);
  const theme = useChartTheme();
  return (
    <div className="chart-wrap" style={{ height: chartHeight }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 20, bottom: 4, left: 8 }}
        >
          <XAxis
            type="number"
            allowDecimals={false}
            tick={{ fontSize: 11, fill: theme.axisTick }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            tick={{ fontSize: 12, fill: theme.axisLabel }}
            axisLine={false}
            tickLine={false}
            width={140}
          />
          <Tooltip
            cursor={{ fill: theme.cursorFill }}
            formatter={(value) => [value, unit]}
            contentStyle={theme.tooltipContentStyle}
            labelStyle={theme.tooltipLabelStyle}
            itemStyle={theme.tooltipItemStyle}
          />
          <Bar dataKey="count" radius={[0, 6, 6, 0]}>
            {data.map((row, i) => (
              <Cell key={i} fill={row.color ?? theme.bar} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
