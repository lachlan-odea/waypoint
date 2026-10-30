import { useMemo, type ReactNode } from "react";
import type { Campaign, MarketingEvent, SocialPost, Workspace, WorkspaceData } from "../types";
import type { SidebarView } from "./Sidebar";
import { PROJECT_STATUSES, projectStatusLabel, socialStatusMeta, brandColor } from "../constants";
import { PHASE_LABEL, campaignPhase } from "../campaigns";
import { checklistDone, eventPhase, eventStatusMeta, followUpMissing, formatEventDates, formatUsd, EVENT_CHECKLIST } from "../events";
import { STAGE_LABEL, kitName, kitOf, kitState } from "../webinarKit";
import { socialPostTitle } from "../socialPosts";
import { daysUntil, formatShort, shiftIso, timeAgo, todayIso } from "../dates";
import { campaignPhaseTone, eventStatusTone, projectStatusTone, socialStatusTone } from "../statusTone";
import { Avatar } from "./Avatar";
import { Icon, type IconName, type IconTone } from "./Icon";
import { StatusChip } from "./pages/ItemPage";

// The Executive Dashboard: the head of marketing's one page. Everything
// across every team and programme, read top to bottom: what needs
// attention now, the next fortnight day by day, how each team and each
// programme is tracking, and what moved recently. Every row opens the
// thing it describes.

type Props = {
  workspace: WorkspaceData;
  campaigns: Campaign[];
  events: MarketingEvent[];
  socialPosts: SocialPost[];
  currentDesignerId: string;
  onOpenProject: (id: string) => void;
  onOpenCampaign: (id: string, tab?: string) => void;
  onOpenEvent: (id: string, tab?: string) => void;
  onOpenSocialPost: (id: string) => void;
  onOpenBoard: (workspaceId: string) => void;
  onOpenView: (view: SidebarView) => void;
};

type Kind = "project" | "campaign" | "webinar" | "event" | "post";

type Item = {
  key: string;
  kind: Kind;
  date: string;
  title: string;
  sub: string;
  // What's wrong, for the attention list; the day's label, for the agenda.
  note: string;
  severity?: "bad" | "warn";
  open: () => void;
  swatch?: string;
};

const KIND_ICON: Record<Kind, IconName> = {
  project: "folder",
  campaign: "target",
  webinar: "presentation-board-chart-graph",
  event: "calendar",
  post: "message-chat",
};

export function Dashboard({
  workspace,
  campaigns,
  events,
  socialPosts,
  onOpenProject,
  onOpenCampaign,
  onOpenEvent,
  onOpenSocialPost,
  onOpenBoard,
  onOpenView,
}: Props) {
  const today = todayIso();
  const in7 = shiftIso(today, 7);
  const in14 = shiftIso(today, 14);
  const in30 = shiftIso(today, 30);
  const month = today.slice(0, 7);
  const year = today.slice(0, 4);
  const lastMonth = shiftIso(`${month}-01`, -1).slice(0, 7);

  const designers = workspace.designers;
  const workspaces = useMemo(
    () => workspace.workspaces.slice().sort((a, b) => a.name.localeCompare(b.name)),
    [workspace.workspaces],
  );
  const designerName = (id: string) => designers.find((d) => d.id === id)?.name ?? "";

  // ── Projects ────────────────────────────────────────────────────────────
  const projects = useMemo(() => workspace.projects.filter((p) => !p.archived), [workspace.projects]);
  const live = useMemo(() => projects.filter((p) => (p.status ?? "active") === "active"), [projects]);
  const overdueProjects = useMemo(
    () => live.filter((p) => p.dueDate && p.dueDate < today).sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [live, today],
  );
  const dueWeekProjects = useMemo(
    () => live.filter((p) => p.dueDate && p.dueDate >= today && p.dueDate <= in7),
    [live, today, in7],
  );
  const reviewProjects = useMemo(() => live.filter((p) => (p.reviewerIds ?? []).length > 0), [live]);
  const urgentProjects = useMemo(() => live.filter((p) => p.priority === "Urgent"), [live]);
  const unassigned = useMemo(() => live.filter((p) => p.assigneeIds.length === 0), [live]);

  // ── Campaigns and webinars ─────────────────────────────────────────────
  const campaignRows = useMemo(
    () => campaigns.map((c) => ({ c, phase: campaignPhase(c, today), kit: kitOf(c) })),
    [campaigns, today],
  );
  const liveCampaigns = campaignRows.filter((r) => r.phase === "live" && !r.kit);
  const upcomingCampaigns = campaignRows
    .filter((r) => r.phase === "upcoming" && r.c.startDate <= in30 && !r.kit)
    .sort((a, b) => a.c.startDate.localeCompare(b.c.startDate));
  const overdueMilestones = useMemo(
    () =>
      campaignRows
        .filter((r) => r.phase !== "finished")
        .flatMap((r) => r.c.milestones.filter((m) => !m.done && m.date < today).map((m) => ({ c: r.c, m, kit: r.kit })))
        .sort((a, b) => a.m.date.localeCompare(b.m.date)),
    [campaignRows, today],
  );
  const webinars = useMemo(
    () =>
      campaignRows
        .filter((r) => r.kit)
        .map((r) => ({ c: r.c, kit: r.kit!, st: kitState(r.kit!, today) })),
    [campaignRows, today],
  );
  const activeWebinars = webinars.filter((w) => !w.st.parked);
  const nextGoLive = activeWebinars
    .filter((w) => w.kit.goLive && w.kit.goLive >= today)
    .sort((a, b) => a.kit.goLive.localeCompare(b.kit.goLive))[0];
  const webinarLate = activeWebinars.flatMap((w) => w.st.late.map((i) => ({ w, i })));
  const stageCounts = useMemo(() => {
    const m = new Map<string, number>();
    activeWebinars.forEach((w) => m.set(w.kit.stage, (m.get(w.kit.stage) ?? 0) + 1));
    return m;
  }, [activeWebinars]);

  // ── Events ──────────────────────────────────────────────────────────────
  const eventRows = useMemo(() => events.map((e) => ({ e, phase: eventPhase(e, today) })), [events, today]);
  const liveEvents = eventRows.filter((r) => r.phase === "live");
  const upcomingEvents = eventRows
    .filter((r) => r.phase !== "cancelled" && r.e.startDate && r.e.startDate > today && r.e.startDate <= in30)
    .sort((a, b) => a.e.startDate.localeCompare(b.e.startDate));
  const followUps = eventRows
    .map((r) => ({ ...r, missing: followUpMissing(r.e, today) }))
    .filter((r) => r.missing.length > 0)
    .sort((a, b) => (b.e.endDate || "").localeCompare(a.e.endDate || ""));
  const yearEvents = eventRows.filter((r) => r.phase !== "cancelled" && (r.e.startDate ? r.e.startDate.startsWith(year) : r.e.year === Number(year)));
  const spendYtd = yearEvents.reduce((s, r) => s + (r.e.investmentUsd ?? 0), 0);
  const comms = yearEvents.reduce((s, r) => s + (r.e.comms ?? 0), 0);
  const opps = yearEvents.reduce((s, r) => s + (r.e.opps ?? 0), 0);

  // ── Social ──────────────────────────────────────────────────────────────
  const monthPosts = useMemo(
    () => socialPosts.filter((p) => !(p.evergreen && !p.date) && (p.date ? p.date.slice(0, 7) : p.month) === month),
    [socialPosts, month],
  );
  const lastMonthPublished = socialPosts.filter((p) => p.status === "published" && (p.date ? p.date.slice(0, 7) : p.month) === lastMonth).length;
  const postsThisWeek = socialPosts
    .filter((p) => p.date && p.date >= today && p.date <= in7 && p.status !== "cancelled" && p.status !== "published")
    .sort((a, b) => a.date.localeCompare(b.date));
  const openPosts = monthPosts.filter((p) => !["published", "cancelled", "onHold"].includes(p.status));
  const noDate = openPosts.filter((p) => !p.date);
  const noAsset = openPosts.filter((p) => !p.asset.trim());
  const readyToday = socialPosts.filter((p) => p.status === "pending" && p.date && p.date <= today);
  const socialByStatus = useMemo(() => {
    const m = new Map<string, number>();
    monthPosts.forEach((p) => m.set(p.status, (m.get(p.status) ?? 0) + 1));
    return m;
  }, [monthPosts]);

  // ── Needs attention ─────────────────────────────────────────────────────
  const attention: Item[] = useMemo(() => {
    const items: Item[] = [];
    overdueProjects.forEach((p) =>
      items.push({
        key: `p-${p.id}`,
        kind: "project",
        date: p.dueDate,
        title: p.title || "Untitled project",
        sub: [teamName(workspaces, p.workspaceId), p.assigneeIds.map(designerName).filter(Boolean).join(", ") || "Unassigned"].join(" · "),
        note: `${-daysUntil(p.dueDate)!} days overdue`,
        severity: "bad",
        open: () => onOpenProject(p.id),
      }),
    );
    overdueMilestones.forEach(({ c, m, kit }) =>
      items.push({
        key: `m-${c.id}-${m.id}`,
        kind: kit ? "webinar" : "campaign",
        date: m.date,
        title: m.label,
        sub: kit ? kitName(c) : c.name,
        note: `milestone ${-daysUntil(m.date)!} days overdue`,
        severity: "bad",
        open: () => onOpenCampaign(c.id, "milestones"),
        swatch: c.color || brandColor(c.brand),
      }),
    );
    webinarLate.forEach(({ w, i }) =>
      items.push({
        key: `w-${w.c.id}-${i.s.k}`,
        kind: "webinar",
        date: i.due,
        title: `${String(i.s.n).padStart(2, "0")} ${i.s.title}`,
        sub: kitName(w.c),
        note: `section ${-i.days!} days overdue`,
        severity: "bad",
        open: () => onOpenCampaign(w.c.id, i.s.k),
      }),
    );
    followUps.forEach((r) =>
      items.push({
        key: `e-${r.e.id}`,
        kind: "event",
        date: r.e.endDate || today,
        title: r.e.name,
        sub: formatEventDates(r.e),
        note: `needs ${r.missing.join(", ")}`,
        severity: "warn",
        open: () => onOpenEvent(r.e.id, "checklist"),
      }),
    );
    readyToday.forEach((p) =>
      items.push({
        key: `s-${p.id}`,
        kind: "post",
        date: p.date,
        title: socialPostTitle(p),
        sub: p.channel,
        note: "ready to publish, not yet posted",
        severity: "warn",
        open: () => onOpenSocialPost(p.id),
      }),
    );
    unassigned.slice(0, 5).forEach((p) =>
      items.push({
        key: `u-${p.id}`,
        kind: "project",
        date: p.dueDate || "9999",
        title: p.title || "Untitled project",
        sub: teamName(workspaces, p.workspaceId),
        note: "active with nobody assigned",
        severity: "warn",
        open: () => onOpenProject(p.id),
      }),
    );
    return items.sort((a, b) => (a.severity === b.severity ? a.date.localeCompare(b.date) : a.severity === "bad" ? -1 : 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overdueProjects, overdueMilestones, webinarLate, followUps, readyToday, unassigned, workspaces, designers]);

  // ── Next 14 days ────────────────────────────────────────────────────────
  const agenda = useMemo(() => {
    const items: Item[] = [];
    live.concat(projects.filter((p) => p.status === "planning")).forEach((p) => {
      if (p.dueDate && p.dueDate >= today && p.dueDate <= in14)
        items.push({ key: `p-${p.id}`, kind: "project", date: p.dueDate, title: p.title || "Untitled project", sub: teamName(workspaces, p.workspaceId), note: "due", open: () => onOpenProject(p.id) });
    });
    campaignRows.forEach(({ c, kit }) => {
      c.milestones.forEach((m) => {
        if (!m.done && m.date >= today && m.date <= in14)
          items.push({
            key: `m-${c.id}-${m.id}`,
            kind: kit ? "webinar" : "campaign",
            date: m.date,
            title: m.label,
            sub: kit ? kitName(c) : c.name,
            note: kit && m.label === "Webinar" ? "go-live" : "milestone",
            open: () => onOpenCampaign(c.id, kit && m.label === "Webinar" ? "overview" : "milestones"),
            swatch: c.color || brandColor(c.brand),
          });
      });
      if (!kit && c.startDate >= today && c.startDate <= in14 && !c.evergreen)
        items.push({ key: `cs-${c.id}`, kind: "campaign", date: c.startDate, title: c.name, sub: c.brand, note: "campaign launches", open: () => onOpenCampaign(c.id), swatch: c.color || brandColor(c.brand) });
    });
    eventRows.forEach(({ e, phase }) => {
      if (phase === "cancelled" || !e.startDate) return;
      if (e.startDate >= today && e.startDate <= in14)
        items.push({ key: `e-${e.id}`, kind: "event", date: e.startDate, title: e.name, sub: e.location || e.division, note: `event starts · ${formatEventDates(e)}`, open: () => onOpenEvent(e.id) });
    });
    postsThisWeek.forEach((p) =>
      items.push({ key: `s-${p.id}`, kind: "post", date: p.date, title: socialPostTitle(p), sub: `${p.channel} · ${socialStatusMeta(p.status).label}`, note: "post", open: () => onOpenSocialPost(p.id) }),
    );
    const byDay = new Map<string, Item[]>();
    items.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title)).forEach((it) => {
      const list = byDay.get(it.date) ?? [];
      list.push(it);
      byDay.set(it.date, list);
    });
    return [...byDay.entries()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, projects, campaignRows, eventRows, postsThisWeek, workspaces, today, in14]);

  // ── Teams ───────────────────────────────────────────────────────────────
  const teamRows = useMemo(
    () =>
      workspaces.map((w) => {
        const all = projects.filter((p) => p.workspaceId === w.id);
        const act = all.filter((p) => (p.status ?? "active") === "active");
        const people = new Set(act.flatMap((p) => p.assigneeIds));
        return {
          w,
          total: all.length,
          active: act.length,
          planning: all.filter((p) => p.status === "planning").length,
          paused: all.filter((p) => p.status === "paused").length,
          completed: all.filter((p) => p.status === "completed").length,
          overdue: act.filter((p) => p.dueDate && p.dueDate < today).length,
          dueWeek: act.filter((p) => p.dueDate && p.dueDate >= today && p.dueDate <= in7).length,
          review: act.filter((p) => (p.reviewerIds ?? []).length > 0).length,
          people: people.size,
          perPerson: people.size ? act.length / people.size : act.length,
        };
      }),
    [workspaces, projects, today, in7],
  );
  const maxActive = Math.max(1, ...teamRows.map((t) => t.active));

  // ── Workload ────────────────────────────────────────────────────────────
  const workload = useMemo(() => {
    const rows = designers
      .map((d) => {
        const mine = live.filter((p) => p.assigneeIds.includes(d.id));
        return { d, count: mine.length, overdue: mine.filter((p) => p.dueDate && p.dueDate < today).length, urgent: mine.filter((p) => p.priority === "Urgent").length };
      })
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count || a.d.name.localeCompare(b.d.name));
    return rows;
  }, [designers, live, today]);
  const maxLoad = Math.max(1, ...workload.map((r) => r.count));

  // ── Recent activity ─────────────────────────────────────────────────────
  const recentComments = useMemo(
    () =>
      projects
        .flatMap((p) => p.comments.map((c) => ({ p, c })))
        .sort((a, b) => b.c.createdAt.localeCompare(a.c.createdAt))
        .slice(0, 8),
    [projects],
  );
  const recentKit = useMemo(
    () =>
      webinars
        .flatMap((w) => w.kit.activity.slice(0, 5).map((a) => ({ w, a })))
        .sort((a, b) => b.a.at.localeCompare(a.a.at))
        .slice(0, 6),
    [webinars],
  );

  const bad = attention.filter((a) => a.severity === "bad").length;

  return (
    <div className="an ex">
      {/* ── The numbers ────────────────────────────────────────────────── */}
      <div className="an-stats ex-stats">
        <Stat label="Live projects" value={live.length} icon="folder" tone="sky" onClick={() => onOpenView("analytics")} />
        <Stat label="Overdue" value={overdueProjects.length} icon="clock-circle" tone="peach" alert={overdueProjects.length > 0} />
        <Stat label="Due in 7 days" value={dueWeekProjects.length} icon="calendar" tone="pale" />
        <Stat label="Awaiting review" value={reviewProjects.length} icon="checkmark" tone="violet" />
        <Stat label="Live campaigns" value={liveCampaigns.length} icon="target" tone="mint" onClick={() => onOpenView("campaigns")} />
        <Stat label="Webinars in flight" value={activeWebinars.length} icon="presentation-board-chart-graph" tone="violet" onClick={() => onOpenView("campaigns")} />
        <Stat label="Events in 30 days" value={upcomingEvents.length + liveEvents.length} icon="calendar" tone="sky" onClick={() => onOpenView("events")} />
        <Stat label="Posts this week" value={postsThisWeek.length} icon="message-chat" tone="pale" onClick={() => onOpenView("socialCalendar")} />
      </div>

      {/* ── Attention and the fortnight ───────────────────────────────── */}
      <div className="an-grid ex-grid-wide">
        <Panel
          title="Needs attention"
          aside={attention.length ? `${bad} overdue · ${attention.length - bad} to watch` : "All clear"}
          className={attention.length ? "ex-attention" : ""}
        >
          {attention.length === 0 ? (
            <Empty>Nothing overdue and nothing waiting. Enjoy it.</Empty>
          ) : (
            <ul className="ex-list">
              {attention.slice(0, 12).map((it) => (
                <li key={it.key}>
                  <button type="button" className="ex-row" onClick={it.open}>
                    <span className={`ex-kind ${it.kind}`} title={it.kind}>
                      <Icon name={KIND_ICON[it.kind]} size={14} />
                    </span>
                    <span className="ex-row-main">
                      <b>{it.title}</b>
                      <span className="ex-row-sub">
                        {it.swatch && <i className="an-swatch" style={{ background: it.swatch }} />}
                        {it.sub}
                      </span>
                    </span>
                    <span className={`ex-note ${it.severity ?? ""}`}>{it.note}</span>
                  </button>
                </li>
              ))}
              {attention.length > 12 && <li className="ex-more">and {attention.length - 12} more</li>}
            </ul>
          )}
        </Panel>

        <Panel title="The next 14 days" aside={`${formatShort(today)} – ${formatShort(in14)}`}>
          {agenda.length === 0 ? (
            <Empty>Nothing dated in the next fortnight.</Empty>
          ) : (
            <div className="ex-agenda">
              {agenda.map(([day, items]) => (
                <div key={day} className={`ex-day ${day === today ? "today" : ""}`}>
                  <div className="ex-day-head">
                    <span className="mono">{formatShort(day)}</span>
                    <span className="ex-day-dow">{day === today ? "Today" : day === shiftIso(today, 1) ? "Tomorrow" : new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { weekday: "long" })}</span>
                  </div>
                  <ul className="ex-list tight">
                    {items.map((it) => (
                      <li key={it.key}>
                        <button type="button" className="ex-row" onClick={it.open}>
                          <span className={`ex-kind ${it.kind}`} title={it.kind}>
                            <Icon name={KIND_ICON[it.kind]} size={14} />
                          </span>
                          <span className="ex-row-main">
                            <b>{it.title}</b>
                            <span className="ex-row-sub">
                              {it.swatch && <i className="an-swatch" style={{ background: it.swatch }} />}
                              {it.sub}
                            </span>
                          </span>
                          <span className="ex-note">{it.note}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* ── Teams ─────────────────────────────────────────────────────── */}
      <Section eyebrow="Across the teams" title="Teams" summary={`${live.length} live project${live.length === 1 ? "" : "s"} · ${urgentProjects.length} urgent · ${unassigned.length} unassigned`}>
        <div className="an-grid">
          <Panel title="By team" aside="Click a team to open its board">
            <div className="an-table-wrap">
              <table className="an-table ex-teams">
                <thead>
                  <tr>
                    <th>Team</th>
                    <th>Live</th>
                    <th className="n">Overdue</th>
                    <th className="n">Due 7d</th>
                    <th className="n">Review</th>
                    <th className="n">Planning</th>
                    <th className="n">On hold</th>
                    <th className="n">Done</th>
                    <th className="n">Per person</th>
                  </tr>
                </thead>
                <tbody>
                  {teamRows.map((t) => (
                    <tr key={t.w.id} onClick={() => onOpenBoard(t.w.id)} className="ex-clickable">
                      <td>
                        <b>{t.w.name}</b>
                      </td>
                      <td>
                        <span className="ex-bar" title={`${t.active} live`}>
                          <i style={{ width: `${(t.active / maxActive) * 100}%` }} />
                          <span className="mono">{t.active}</span>
                        </span>
                      </td>
                      <td className={`n mono ${t.overdue ? "late" : ""}`}>{t.overdue}</td>
                      <td className="n mono">{t.dueWeek}</td>
                      <td className="n mono">{t.review}</td>
                      <td className="n mono">{t.planning}</td>
                      <td className="n mono">{t.paused}</td>
                      <td className="n mono">{t.completed}</td>
                      <td className="n mono">{t.people ? t.perPerson.toFixed(1) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel title="Workload" aside="Live projects per person">
            {workload.length === 0 ? (
              <Empty>No live projects assigned.</Empty>
            ) : (
              <ul className="ex-load">
                {workload.slice(0, 10).map((r) => (
                  <li key={r.d.id}>
                    <Avatar designer={r.d} size={24} />
                    <span className="ex-load-name">{r.d.name}</span>
                    <span className="ex-bar">
                      <i style={{ width: `${(r.count / maxLoad) * 100}%` }} />
                      <span className="mono">{r.count}</span>
                    </span>
                    <span className="ex-load-flags">
                      {r.overdue > 0 && <StatusChip status="blocked">{r.overdue} overdue</StatusChip>}
                      {r.urgent > 0 && <StatusChip status="scheduled">{r.urgent} urgent</StatusChip>}
                    </span>
                  </li>
                ))}
                {unassigned.length > 0 && (
                  <li className="ex-load-unassigned">
                    <span className="dot-avatar" style={{ width: 24, height: 24, fontSize: 10, background: "var(--ink-300)" }}>
                      ??
                    </span>
                    <span className="ex-load-name">Unassigned</span>
                    <span className="ex-bar">
                      <i className="muted-bar" style={{ width: `${(unassigned.length / maxLoad) * 100}%` }} />
                      <span className="mono">{unassigned.length}</span>
                    </span>
                  </li>
                )}
              </ul>
            )}
          </Panel>
        </div>
      </Section>

      {/* ── Programmes ────────────────────────────────────────────────── */}
      <Section eyebrow="Campaigns, webinars and events" title="Programmes" summary="What's live, what's next, and what's owed">
        <div className="an-grid ex-grid-3">
          <Panel title="Campaigns" aside={<button type="button" className="link-btn" onClick={() => onOpenView("campaigns")}>All campaigns</button>}>
            {liveCampaigns.length === 0 && upcomingCampaigns.length === 0 ? (
              <Empty>No campaigns live or launching in the next 30 days.</Empty>
            ) : (
              <ul className="ex-list">
                {liveCampaigns.map(({ c, phase }) => (
                  <CampaignRow key={c.id} c={c} phaseLabel={PHASE_LABEL[phase]} tone={campaignPhaseTone(phase)} today={today} ownerName={c.ownerId ? designerName(c.ownerId) : c.owner} onOpen={() => onOpenCampaign(c.id)} />
                ))}
                {upcomingCampaigns.slice(0, 5).map(({ c, phase }) => (
                  <CampaignRow key={c.id} c={c} phaseLabel={`Launches ${formatShort(c.startDate)}`} tone={campaignPhaseTone(phase)} today={today} ownerName={c.ownerId ? designerName(c.ownerId) : c.owner} onOpen={() => onOpenCampaign(c.id)} />
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Webinars" aside={nextGoLive ? `Next go-live ${formatShort(nextGoLive.kit.goLive)}` : "No go-live scheduled"}>
            {activeWebinars.length === 0 ? (
              <Empty>No webinars in flight.</Empty>
            ) : (
              <>
                <div className="ex-stages">
                  {["proposed", "planning", "production", "promotion", "post"].map((s) => (
                    <span key={s} className={`ex-stage ${stageCounts.get(s) ? "on" : ""}`}>
                      <b className="mono">{stageCounts.get(s) ?? 0}</b>
                      {STAGE_LABEL[s]}
                    </span>
                  ))}
                </div>
                <ul className="ex-list">
                  {activeWebinars
                    .slice()
                    .sort((a, b) => (a.kit.goLive || "9999").localeCompare(b.kit.goLive || "9999"))
                    .slice(0, 6)
                    .map(({ c, kit, st }) => (
                      <li key={c.id}>
                        <button type="button" className="ex-row" onClick={() => onOpenCampaign(c.id)}>
                          <span className="ex-row-main">
                            <b>{kitName(c)}</b>
                            <span className="ex-row-sub">
                              {STAGE_LABEL[kit.stage]} · {st.done}/{st.total} sections
                              {kit.goLive ? ` · go-live ${formatShort(kit.goLive)}` : " · no go-live date"}
                              {kit.lead ? ` · ${designerName(kit.lead)}` : ""}
                            </span>
                          </span>
                          {st.health && (
                            <StatusChip status={st.health.k === "bad" ? "blocked" : st.health.k === "warn" ? "scheduled" : "live"}>{st.health.label}</StatusChip>
                          )}
                        </button>
                      </li>
                    ))}
                </ul>
              </>
            )}
          </Panel>

          <Panel title="Events" aside={<button type="button" className="link-btn" onClick={() => onOpenView("events")}>All events</button>}>
            <div className="ex-minis">
              <Mini label={`Spend ${year}`} value={spendYtd ? `US$${formatUsd(spendYtd)}` : "—"} />
              <Mini label="Conversations" value={comms ? comms.toLocaleString() : "—"} />
              <Mini label="Opportunities" value={opps ? opps.toLocaleString() : "—"} />
              <Mini label="Follow-ups owed" value={String(followUps.length)} alert={followUps.length > 0} />
            </div>
            {liveEvents.length === 0 && upcomingEvents.length === 0 ? (
              <Empty>No events on or coming up in the next 30 days.</Empty>
            ) : (
              <ul className="ex-list">
                {[...liveEvents, ...upcomingEvents].slice(0, 6).map(({ e, phase }) => {
                  const done = checklistDone(e);
                  return (
                    <li key={e.id}>
                      <button type="button" className="ex-row" onClick={() => onOpenEvent(e.id)}>
                        <span className="ex-row-main">
                          <b>{e.name}</b>
                          <span className="ex-row-sub">
                            {formatEventDates(e)}
                            {e.location ? ` · ${e.location}` : ""} · checklist {done}/{EVENT_CHECKLIST.length}
                            {e.marketingLead ? ` · ${e.marketingLead}` : ""}
                          </span>
                        </span>
                        <StatusChip status={eventStatusTone(phase)}>{eventStatusMeta(phase).label}</StatusChip>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      </Section>

      {/* ── Social and activity ───────────────────────────────────────── */}
      <Section eyebrow="Social and activity" title="This month" summary={`${monthPosts.length} post${monthPosts.length === 1 ? "" : "s"} planned · ${socialByStatus.get("published") ?? 0} published so far (${lastMonthPublished} all of last month)`}>
        <div className="an-grid">
          <Panel title="Social calendar" aside={<button type="button" className="link-btn" onClick={() => onOpenView("socialCalendar")}>Open the calendar</button>}>
            <div className="ex-minis">
              <Mini label="Published" value={String(socialByStatus.get("published") ?? 0)} />
              <Mini label="Scheduled" value={String(socialByStatus.get("scheduled") ?? 0)} />
              <Mini label="Ready" value={String(socialByStatus.get("pending") ?? 0)} />
              <Mini label="Draft" value={String(socialByStatus.get("draft") ?? 0)} />
              <Mini label="No date" value={String(noDate.length)} alert={noDate.length > 0} />
              <Mini label="No asset" value={String(noAsset.length)} alert={noAsset.length > 0} />
            </div>
            {postsThisWeek.length === 0 ? (
              <Empty>Nothing going out in the next 7 days.</Empty>
            ) : (
              <ul className="ex-list">
                {postsThisWeek.slice(0, 6).map((p) => (
                  <li key={p.id}>
                    <button type="button" className="ex-row" onClick={() => onOpenSocialPost(p.id)}>
                      <span className="mono ex-date">{formatShort(p.date)}</span>
                      <span className="ex-row-main">
                        <b>{socialPostTitle(p)}</b>
                        <span className="ex-row-sub">
                          {p.channel}
                          {p.category ? ` · ${p.category}` : ""}
                          {p.owner ? ` · ${p.owner}` : ""}
                        </span>
                      </span>
                      <StatusChip status={socialStatusTone(p.status)}>{socialStatusMeta(p.status).label}</StatusChip>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Recent activity" aside="Comments and webinar work, newest first">
            {recentComments.length === 0 && recentKit.length === 0 ? (
              <Empty>No activity yet.</Empty>
            ) : (
              <ul className="ex-activity">
                {[
                  ...recentComments.map(({ p, c }) => ({ at: c.createdAt, who: c.author, what: `commented on ${p.title}`, detail: c.text, open: () => onOpenProject(p.id) })),
                  ...recentKit.map(({ w, a }) => ({ at: a.at, who: designerName(a.by ?? "") || "Someone", what: `${a.what}${a.detail ? ` ${a.detail}` : ""} · ${kitName(w.c)}`, detail: "", open: () => onOpenCampaign(w.c.id, a.section || "overview") })),
                ]
                  .sort((a, b) => b.at.localeCompare(a.at))
                  .slice(0, 10)
                  .map((row, i) => {
                    const d = designers.find((x) => x.name === row.who);
                    return (
                      <li key={i}>
                        <button type="button" className="ex-row" onClick={row.open}>
                          {d ? (
                            <Avatar designer={d} size={24} />
                          ) : (
                            <span className="dot-avatar" style={{ width: 24, height: 24, fontSize: 10 }}>
                              {row.who.slice(0, 2).toUpperCase()}
                            </span>
                          )}
                          <span className="ex-row-main">
                            <b>
                              {row.who} <span className="ex-what">{row.what}</span>
                            </b>
                            {row.detail && <span className="ex-row-sub ex-clamp">{row.detail}</span>}
                          </span>
                          <span className="ex-note">{timeAgo(row.at)}</span>
                        </button>
                      </li>
                    );
                  })}
              </ul>
            )}
          </Panel>
        </div>
      </Section>

      {/* ── Project status mix ─────────────────────────────────────────── */}
      <Section eyebrow="Every team" title="Project status" summary={`${projects.length} project${projects.length === 1 ? "" : "s"} on the boards, archive excluded`}>
        <div className="ex-statusbar" role="img" aria-label="Projects by status">
          {PROJECT_STATUSES.map((s) => {
            const n = projects.filter((p) => (p.status ?? "active") === s.value).length;
            if (!n) return null;
            return (
              <span key={s.value} className={`ex-statusbar-seg wp-status ${projectStatusTone(s.value)}`} style={{ flex: n }} title={`${n} ${projectStatusLabel(s.value)}`}>
                {n} {s.label}
              </span>
            );
          })}
        </div>
      </Section>
    </div>
  );
}

// ── Pieces ───────────────────────────────────────────────────────────────

function teamName(workspaces: Workspace[], id: string): string {
  return workspaces.find((w) => w.id === id)?.name ?? id;
}

function Section({ eyebrow, title, summary, children }: { eyebrow: string; title: string; summary: string; children: ReactNode }) {
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

function Panel({ title, aside, children, className }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`an-panel ${className ?? ""}`}>
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

function Stat({ label, value, icon, tone, alert, onClick }: { label: string; value: number; icon: IconName; tone: IconTone; alert?: boolean; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} className={`an-stat ${alert ? "alert" : ""} ${onClick ? "ex-stat-btn" : ""}`} onClick={onClick}>
      <Icon name={icon} size={18} container="tile" tone={tone} />
      <div className="an-stat-text">
        <span className="an-stat-label">{label}</span>
        <span className="an-stat-value">{value.toLocaleString()}</span>
      </div>
    </Tag>
  );
}

function Mini({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className={`ex-mini ${alert ? "alert" : ""}`}>
      <span className="ex-mini-value mono">{value}</span>
      <span className="ex-mini-label">{label}</span>
    </div>
  );
}

function CampaignRow({ c, phaseLabel, tone, today, ownerName, onOpen }: { c: Campaign; phaseLabel: string; tone: ReturnType<typeof campaignPhaseTone>; today: string; ownerName: string; onOpen: () => void }) {
  const done = c.milestones.filter((m) => m.done).length;
  const next = c.milestones.filter((m) => !m.done && m.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  return (
    <li>
      <button type="button" className="ex-row" onClick={onOpen}>
        <i className="an-swatch" style={{ background: c.color || brandColor(c.brand) }} />
        <span className="ex-row-main">
          <b>{c.name}</b>
          <span className="ex-row-sub">
            {c.brand} · {done}/{c.milestones.length} milestones
            {next ? ` · next ${next.label} ${formatShort(next.date)}` : ""}
            {ownerName ? ` · ${ownerName}` : ""}
          </span>
        </span>
        <StatusChip status={tone}>{phaseLabel}</StatusChip>
      </button>
    </li>
  );
}

