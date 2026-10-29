import { useMemo, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
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
import { CHART_FONT, CHART_MONO, useChartTheme } from "../chartTheme";
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
import { campaignPhaseTone } from "../statusTone";
import { formatShort, shiftIso, todayIso } from "../dates";
import { Icon, type IconName, type IconTone } from "./Icon";
import { StatusChip } from "./pages/ItemPage";

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

// The project status bars take fixed brand steps: Planning Sky, Active
// Cobalt, On hold a neutral, Completed WiseTech Blue.
const PROJECT_STATUS_COLORS: Record<ProjectStatus, string> = {
  planning: "#a7cff8",
  active: "#371ee1",
  paused: "#8b96a8",
  completed: "#1d1765",
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
            ? "#b9c0cc"
            : (socialCategoryMeta(label, socialCategories)?.color ?? undefined),
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
  const rangeLabel =
    from || to ? `${from ? formatShort(from) : "…"} – ${to ? formatShort(to) : "…"}` : "All time";
  const teamName =
    selectedWorkspaceId === ALL_WORKSPACES
      ? "all teams"
      : (workspaces.find((w) => w.id === selectedWorkspaceId)?.name ?? "");

  return (
    <div className="an">
      {/* One row of filters above every chart, left to right: who, when. */}
      <div className="an-filters" role="group" aria-label="Filters">
        <label className="an-filter">
          <span className="eyebrow">Team</span>
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
        <div className="an-filter">
          <span className="eyebrow">Range</span>
          <div className="an-seg" role="group" aria-label="Quick range">
            {(
              [
                ["7", "7 days"],
                ["30", "30 days"],
                ["90", "90 days"],
                ["month", "This month"],
                ["all", "All time"],
              ] as Array<[QuickRange, string]>
            ).map(([kind, label]) => (
              <button
                key={kind}
                type="button"
                aria-pressed={activeQuickRange === kind}
                onClick={() => applyQuickRange(kind)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <label className="an-filter">
          <span className="eyebrow">From</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            max={to || undefined}
          />
        </label>
        <label className="an-filter">
          <span className="eyebrow">To</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            min={from || undefined}
          />
        </label>
        <div className="an-filter an-filter-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() =>
              download(
                `waypoint-projects-${today}.csv`,
                toCsv(filtered, allDesigners),
                "text/csv;charset=utf-8",
              )
            }
            title="The filtered projects as a CSV file"
          >
            <Icon name="download" size={14} /> CSV
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() =>
              download(
                `waypoint-projects-${today}.json`,
                JSON.stringify(filtered, null, 2),
                "application/json",
              )
            }
            title="The filtered projects as JSON"
          >
            <Icon name="download" size={14} /> JSON
          </button>
        </div>
      </div>

      <Section
        eyebrow={`${rangeLabel} · ${teamName}`}
        title="Projects"
        summary={`${filtered.length} of ${workspaceProjects.length} projects, by the day they commenced`}
      >
        <div className="an-stats">
          <Stat label="Active" value={stats.activeCount} icon="target" tone="sky" />
          <Stat label="Overdue" value={stats.overdue} icon="clock-circle" tone="peach" alert={stats.overdue > 0} />
          <Stat label="Due in 7 days" value={stats.dueThisWeek} icon="calendar" tone="pale" />
          <Stat label="Urgent" value={stats.urgentCount} icon="flag" tone="peach" alert={stats.urgentCount > 0} />
          <Stat label="In review" value={stats.inReview} icon="checkmark" tone="violet" />
          <GaugeStat
            label="Active tasks"
            done={stats.doneMilestones}
            total={stats.totalMilestones}
            pct={stats.completionPct}
          />
        </div>

        <div className="an-grid">
          <Panel title="By status" aside={`${filtered.filter((p) => !p.archived).length} projects`}>
            {stats.byStatus.every((s) => s.count === 0) ? (
              <Empty>No projects in this range.</Empty>
            ) : (
              <CategoryBars data={stats.byStatus} unit="projects" />
            )}
          </Panel>
          <Panel title="By brand" aside="One bar per brand">
            {stats.byBrand.length === 0 ? (
              <Empty>No projects in this range.</Empty>
            ) : (
              <CategoryBars data={stats.byBrand} unit="projects" />
            )}
          </Panel>
        </div>

        <Panel title="By content type" aside="A project with several types counts once against each">
          {stats.byContentType.length === 0 ? (
            <Empty>No projects in this range.</Empty>
          ) : (
            <CategoryBars data={stats.byContentType} unit="projects" />
          )}
        </Panel>
      </Section>

      <Section
        eyebrow={`${rangeLabel} · all teams`}
        title="Social calendar"
        summary={`${social.total} post${social.total === 1 ? "" : "s"} planned, by publish date`}
      >
        <div className="an-stats">
          <Stat label="Published" value={social.published} icon="checkmark" tone="mint" />
          <Stat label="Scheduled" value={social.scheduled} icon="calendar" tone="pale" />
          <Stat label="Ready to publish" value={social.ready} icon="rocket" tone="violet" />
          <Stat label="Draft" value={social.draft} icon="file" tone="pale" />
          <Stat label="On hold" value={social.onHold} icon="clock" tone="pale" />
          <Stat label="No date yet" value={social.unscheduled} icon="calendar" tone="peach" alert={social.unscheduled > 0} />
          <Stat label="No asset yet" value={social.needsAsset} icon="file" tone="peach" alert={social.needsAsset > 0} />
        </div>

        <Panel title="Posts per month" aside="Stacked by status">
          {social.byMonth.length === 0 ? (
            <Empty>No posts in this range.</Empty>
          ) : (
            <MonthlyPosts data={social.byMonth} statuses={social.monthStatuses} />
          )}
        </Panel>

        <div className="an-grid">
          <Panel title="By category" aside="One bar per category">
            {social.byCategory.length === 0 ? (
              <Empty>No posts in this range.</Empty>
            ) : (
              <CategoryBars data={social.byCategory} unit="posts" />
            )}
          </Panel>
          <Panel title="By channel" aside="One bar per channel">
            {social.byChannel.length === 0 ? (
              <Empty>No posts in this range.</Empty>
            ) : (
              <CategoryBars data={social.byChannel} unit="posts" />
            )}
          </Panel>
        </div>
      </Section>

      <Section
        eyebrow={`${rangeLabel} · all teams`}
        title="Campaigns"
        summary={`${rangeCampaigns.length} campaign${rangeCampaigns.length === 1 ? "" : "s"} running in the range`}
      >
        <div className="an-stats">
          <Stat label="Live" value={campaignStats.live} icon="rocket" tone="mint" />
          <Stat label="Upcoming" value={campaignStats.upcoming} icon="calendar" tone="pale" />
          <Stat label="Finished" value={campaignStats.finished} icon="checkmark" tone="sky" />
          <Stat label="Evergreen" value={campaignStats.evergreen} icon="leaf" tone="mint" />
          <Stat
            label="Overdue milestones"
            value={campaignStats.overdueMilestones}
            icon="clock-circle"
            tone="peach"
            alert={campaignStats.overdueMilestones > 0}
          />
          <GaugeStat
            label="Milestones"
            done={campaignStats.milestonesDone}
            total={campaignStats.milestonesTotal}
            pct={campaignStats.milestonesPct}
          />
        </div>

        <div className="an-grid">
          <Panel title="Milestones to watch" aside={`Overdue, or due in the next ${WATCH_DAYS} days`}>
            {campaignStats.watch.length === 0 ? (
              <Empty>Nothing overdue or due in the next {WATCH_DAYS} days.</Empty>
            ) : (
              <ul className="an-watch">
                {campaignStats.watch.map(({ campaign, milestone, overdue }) => (
                  <li key={`${campaign.id}-${milestone.id}`}>
                    <span className={`an-watch-date mono ${overdue ? "late" : ""}`}>
                      {formatShort(milestone.date)}
                    </span>
                    <span className="an-watch-main">
                      <b>{milestone.label}</b>
                      <span className="an-watch-camp">
                        <Swatch color={campaign.color || brandColor(campaign.brand)} />
                        {campaign.name}
                      </span>
                    </span>
                    {overdue ? (
                      <StatusChip status="blocked">Overdue</StatusChip>
                    ) : milestone.date === today ? (
                      <StatusChip status="live">Today</StatusChip>
                    ) : (
                      <StatusChip status="scheduled">Soon</StatusChip>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Campaign progress" aside="Milestones done, projects linked">
            {rangeCampaigns.length === 0 ? (
              <Empty>No campaigns in this range.</Empty>
            ) : (
              <div className="an-table-wrap">
                <table className="an-table">
                  <thead>
                    <tr>
                      <th>Campaign</th>
                      <th>Dates</th>
                      <th className="n">Milestones</th>
                      <th className="n">Projects</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rangeCampaigns.map(({ campaign: c, phase }) => (
                      <tr key={c.id}>
                        <td>
                          <span className="an-table-name">
                            <Swatch color={c.color || brandColor(c.brand)} />
                            <b>{c.name}</b>
                            <StatusChip status={campaignPhaseTone(phase)}>{PHASE_LABEL[phase]}</StatusChip>
                          </span>
                        </td>
                        <td className="mono muted">
                          {c.evergreen
                            ? `From ${formatShort(c.startDate)}`
                            : `${formatShort(c.startDate)} – ${formatShort(c.endDate)}`}
                        </td>
                        <td className="n mono">
                          {c.milestones.filter((m) => m.done).length}/{c.milestones.length}
                        </td>
                        <td className="n mono">{c.projectIds.length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      </Section>
    </div>
  );
}

// ── Page pieces ─────────────────────────────────────────────────────────

function Section({
  eyebrow,
  title,
  summary,
  children,
}: {
  eyebrow: string;
  title: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <section className="an-section">
      <div className="an-section-head">
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h2>{title}</h2>
        </div>
        <p className="an-summary">{summary}</p>
      </div>
      {children}
    </section>
  );
}

function Panel({ title, aside, children }: { title: string; aside?: string; children: ReactNode }) {
  return (
    <section className="an-panel">
      <div className="an-panel-head">
        <h3>{title}</h3>
        {aside && <span className="an-panel-aside">{aside}</span>}
      </div>
      <div className="an-panel-body">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="an-empty">{children}</p>;
}

function Swatch({ color }: { color: string }) {
  return <span className="an-swatch" style={{ background: color }} aria-hidden />;
}

// A stat tile: an icon tile, a mono label and the number in DM Mono. The
// number only changes colour when it's a problem (overdue, urgent, missing).
function Stat({
  label,
  value,
  icon,
  tone,
  alert,
}: {
  label: string;
  value: number;
  icon: IconName;
  tone: IconTone;
  alert?: boolean;
}) {
  return (
    <div className={`an-stat ${alert ? "alert" : ""}`}>
      <Icon name={icon} size={18} container="tile" tone={tone} />
      <div className="an-stat-text">
        <span className="an-stat-label">{label}</span>
        <span className="an-stat-value">{value.toLocaleString()}</span>
      </div>
    </div>
  );
}

function GaugeStat({
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
    <div className="an-stat an-stat-gauge">
      <div className="an-gauge" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            innerRadius="72%"
            outerRadius="100%"
            data={[{ value: pct, fill: theme.gaugeFill }]}
            startAngle={90}
            endAngle={-270}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
            <RadialBar dataKey="value" cornerRadius={10} background={{ fill: theme.gaugeTrack }} />
          </RadialBarChart>
        </ResponsiveContainer>
        <span className="an-gauge-pct mono">{pct}%</span>
      </div>
      <div className="an-stat-text">
        <span className="an-stat-label">{label}</span>
        <span className="an-stat-value">
          {done.toLocaleString()}
          <span className="an-stat-sub"> / {total.toLocaleString()}</span>
        </span>
      </div>
    </div>
  );
}

// ── Charts ──────────────────────────────────────────────────────────────

type MonthRow = { month: string } & Record<string, number | string>;

// Posts per month, one stacked bar per month, one fixed colour per status.
// A 2px gap in the surface colour separates the stacked segments; the
// legend names every status in the stack.
function MonthlyPosts({
  data,
  statuses,
}: {
  data: MonthRow[];
  statuses: typeof SOCIAL_POST_STATUSES;
}) {
  const theme = useChartTheme();
  return (
    <div className="an-chart" style={{ height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke={theme.grid} />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: theme.axisTick, fontFamily: CHART_MONO }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: theme.axisTick, fontFamily: CHART_MONO }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: theme.cursorFill }}
            contentStyle={theme.tooltipContentStyle}
            labelStyle={theme.tooltipLabelStyle}
            itemStyle={theme.tooltipItemStyle}
          />
          <Legend iconType="square" iconSize={8} wrapperStyle={theme.legendStyle} />
          {statuses.map((s, i) => (
            <Bar
              key={s.value}
              dataKey={s.value}
              name={s.label}
              stackId="posts"
              fill={theme.statusSeries[s.value]}
              stroke={theme.surface}
              strokeWidth={2}
              maxBarSize={28}
              radius={i === statuses.length - 1 ? [4, 4, 0, 0] : 0}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

type CategoryRow = { label: string; count: number; color?: string };

// Horizontal bars for a count per category: thin marks with rounded data
// ends, the value written at the end of each bar instead of a numeric
// axis, and the category's own colour where it has one.
function CategoryBars({ data, unit }: { data: CategoryRow[]; unit: string }) {
  const chartHeight = Math.max(120, data.length * 30 + 8);
  const theme = useChartTheme();
  return (
    <div className="an-chart" style={{ height: chartHeight }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 40, bottom: 0, left: 0 }}
          barCategoryGap="30%"
        >
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="label"
            tick={{ fontSize: 12, fill: theme.axisLabel, fontFamily: CHART_FONT }}
            axisLine={false}
            tickLine={false}
            width={150}
          />
          <Tooltip
            cursor={{ fill: theme.cursorFill }}
            formatter={(value) => [value, unit]}
            contentStyle={theme.tooltipContentStyle}
            labelStyle={theme.tooltipLabelStyle}
            itemStyle={theme.tooltipItemStyle}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={14} minPointSize={2}>
            {data.map((row, i) => (
              <Cell key={i} fill={row.color ?? theme.bar} />
            ))}
            <LabelList
              dataKey="count"
              position="right"
              offset={8}
              style={{ fill: theme.valueLabel, fontSize: 12, fontFamily: CHART_MONO }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
