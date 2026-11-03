import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Campaign,
  DeskItem,
  Notification,
  Project,
  ProjectStatus,
  Workspace,
  WorkspaceData,
} from "../types";
import { Avatar } from "./Avatar";
import { CampaignsPanel } from "./CampaignsPanel";
import { MyWork } from "./MyWork";
import { ProjectPicker } from "./ProjectPicker";
import {
  describeNotification,
  notificationTag,
  sortNotifications,
} from "../notifications";
import { timeAgo } from "../dates";
import { DeskChecklist, KEEP_COMPLETED_DAYS } from "./DeskChecklist";
import {
  applyDeskItemChanges,
  deleteDeskItem,
  setDeskItem,
  subscribeDeskItems,
} from "../firestore";
import {
  daysSince,
  daysUntil,
  formatLong,
  formatShort,
  hasArrived,
  shiftIso,
  todayIso,
} from "../dates";
import {
  EmptyNote,
  ItemGrid,
  ItemPage,
  SideCard,
  type StripCell,
} from "./pages/ItemPage";

interface MyDeskProps {
  workspace: WorkspaceData;
  currentDesignerId: string;
  onOpenProject: (id: string) => void;
  // Notifications addressed to this user — @-mentions, replies, likes. Passed
  // in rather than derived here so App stays the single place that decides
  // what counts as "mine".
  notifications: Notification[];
  // Active projects this user has been asked to review.
  reviewProjects: Project[];
  // Opens the project and dismisses the notification, matching what the bell
  // panel does — a notification you've acted on shouldn't linger.
  onOpenNotification: (projectId: string, notificationId: string) => void;
  onClearNotifications: () => void;
  // Marketing campaigns, for the Campaigns tab (the ones you own or any of
  // your projects contribute to) and the owner's milestone list.
  campaigns: Campaign[];
  onOpenCampaign: (campaignId: string) => void;
  // Flags a milestone done (or not) on a campaign you own.
  onToggleMilestone: (campaign: Campaign, milestoneId: string) => void;
  // For the My work tab: which campaigns each project feeds, the teams (so
  // every card can say which board it's from) and the status setter behind
  // the kanban's drag-and-drop and the list's in-place select.
  campaignsByProject: Map<string, Campaign[]>;
  workspaces: Workspace[];
  onStatusChange: (projectId: string, status: ProjectStatus) => void;
}

// The desk is built on the same shell as a project, campaign or event page
// (ItemPage): a header band with the greeting, the next deadline and the
// day's numbers; tabs; a strip of the week ahead; then the body. Overview
// is the landing tab — what needs attention, with today's list and what
// needs you down the side — and the rest is one tab each.
type DeskTab = "overview" | "work" | "checklist" | "campaigns" | "notifications";

const TAB_KEY = "waypoint.mydesk.tab";
const TABS: readonly DeskTab[] = ["overview", "work", "checklist", "campaigns", "notifications"];

// How far ahead the owner's milestone list looks.
const MILESTONE_HORIZON_DAYS = 14;

// How many days the strip shows, today first.
const STRIP_DAYS = 7;

const PRIORITY_ORDER: Record<string, number> = {
  Urgent: 0,
  High: 1,
  Normal: 2,
  Low: 3,
};

function sortByPriorityThenDue(a: Project, b: Project): number {
  const dp = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  if (dp !== 0) return dp;
  return (a.dueDate || "9999").localeCompare(b.dueDate || "9999");
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// Firestore rejects documents containing `undefined`, and clearing an
// optional field (remindTime when a reminder becomes a plain item) is
// naturally expressed as `undefined` in a patch. Dropping the keys entirely
// removes the field on the next setDoc, which is what we want.
function stripUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as T;
}

function newDeskItemId(): string {
  return `desk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function MyDesk({
  workspace,
  currentDesignerId,
  onOpenProject,
  notifications,
  reviewProjects,
  onOpenNotification,
  onClearNotifications,
  campaigns,
  onOpenCampaign,
  onToggleMilestone,
  campaignsByProject,
  workspaces,
  onStatusChange,
}: MyDeskProps) {
  const [deskItems, setDeskItems] = useState<DeskItem[]>([]);
  const [deskError, setDeskError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  // The tab you were on last time, per browser, like the board's layouts.
  const [tab, setTabState] = useState<DeskTab>(() => {
    try {
      const saved = localStorage.getItem(TAB_KEY) as DeskTab | null;
      return saved && TABS.includes(saved) ? saved : "overview";
    } catch {
      return "overview";
    }
  });
  function setTab(next: DeskTab) {
    setTabState(next);
    try {
      localStorage.setItem(TAB_KEY, next);
    } catch {
      // per-browser preference only
    }
  }

  // Live-subscribe to just this person's checklist.
  useEffect(() => {
    if (!currentDesignerId) return;
    return subscribeDeskItems(
      currentDesignerId,
      (items) => {
        setDeskItems(items);
        setDeskError(null);
      },
      (err) => {
        console.error(err);
        setDeskError(err.message);
      },
    );
  }, [currentDesignerId]);

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), 4000);
    return () => window.clearTimeout(timer);
  }, [flash]);

  // A reminder can come due while the page just sits there, so nudge the
  // housekeeping effect below once a minute as well as whenever the list
  // itself changes.
  const [clockTick, setClockTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setClockTick((n) => n + 1), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const housekeepingInFlight = useRef(false);

  // Three daily chores, batched into one write:
  //   · anything unticked from an earlier day rolls forward to today, with a
  //     counter so a task that's been dodged five times says so
  //   · a reminder whose date and time have arrived stops being a reminder
  //     and becomes a job for today
  //   · completed items older than a fortnight are deleted
  // Every pass is idempotent: rolling sets date to today, promoting clears
  // the remind flag, sweeping deletes. So the write's own snapshot re-runs
  // this effect, finds nothing left to do, and settles.
  useEffect(() => {
    if (housekeepingInFlight.current) return;

    const today = todayIso();
    const updated: DeskItem[] = [];
    const removedIds: string[] = [];
    let rolled = 0;
    let promoted = 0;

    deskItems.forEach((item) => {
      if (item.done) {
        const since = daysSince(item.completedOn);
        if (since !== null && since > KEEP_COMPLETED_DAYS) {
          removedIds.push(item.id);
        }
        return;
      }
      if (item.remind) {
        if (hasArrived(item.date, item.remindTime)) {
          updated.push(
            stripUndefined({
              ...item,
              remind: false,
              remindTime: undefined,
              date: today,
              fromReminder: true,
            }),
          );
          promoted += 1;
        }
        return;
      }
      if (item.date < today) {
        updated.push({
          ...item,
          date: today,
          rolled: (item.rolled ?? 0) + 1,
        });
        rolled += 1;
      }
    });

    if (updated.length === 0 && removedIds.length === 0) return;

    housekeepingInFlight.current = true;
    applyDeskItemChanges(updated, removedIds)
      .then(() => {
        const notes: string[] = [];
        if (rolled > 0) {
          notes.push(
            `${rolled} unticked item${rolled === 1 ? "" : "s"} rolled over to today`,
          );
        }
        if (promoted > 0) {
          notes.push(
            `${promoted} reminder${promoted === 1 ? "" : "s"} came due — now on today's list`,
          );
        }
        if (notes.length > 0) setFlash(notes.join(" · "));
      })
      .catch((err) => {
        console.error("Desk housekeeping failed", err);
      })
      .finally(() => {
        housekeepingInFlight.current = false;
      });
  }, [deskItems, clockTick]);

  // ── checklist mutations ──────────────────────────────────────────────

  function addDeskItem(text: string, extra?: Partial<DeskItem>) {
    const item = stripUndefined<DeskItem>({
      id: newDeskItemId(),
      ownerId: currentDesignerId,
      text,
      date: todayIso(),
      done: false,
      rolled: 0,
      createdAt: new Date().toISOString(),
      ...extra,
    });
    setDeskItem(item).catch((err) => {
      console.error(err);
      setFlash("Couldn't save that item — check your connection.");
    });
  }

  function patchDeskItem(id: string, patch: Partial<DeskItem>) {
    const existing = deskItems.find((i) => i.id === id);
    if (!existing) return;
    setDeskItem(stripUndefined({ ...existing, ...patch })).catch((err) => {
      console.error(err);
      setFlash("Couldn't save that change — check your connection.");
    });
  }

  function removeDeskItem(id: string) {
    deleteDeskItem(id).catch((err) => {
      console.error(err);
      setFlash("Couldn't remove that item — check your connection.");
    });
  }

  // Shortcut from a project onto today's list, so you don't retype the
  // title. Refuses duplicates of an item that's still open.
  function addProjectToToday(project: Project) {
    if (deskItems.some((i) => i.projectId === project.id && !i.done)) {
      setFlash("Already on your list.");
      return;
    }
    addDeskItem(`Work on ${project.title}`, { projectId: project.id });
    setFlash(`“${project.title}” added to today's list.`);
  }

  // ── project-derived panels ───────────────────────────────────────────

  const allActiveProjects = useMemo(
    () =>
      workspace.projects.filter(
        (p) => (p.status ?? "active") === "active" && !p.archived,
      ),
    [workspace.projects],
  );

  const myProjects = useMemo(
    () =>
      allActiveProjects
        .filter((p) => p.assigneeIds.includes(currentDesignerId))
        .sort(sortByPriorityThenDue),
    [allActiveProjects, currentDesignerId],
  );

  // Everything assigned to you, whatever its status, for My work's kanban
  // and list.
  const myAllProjects = useMemo(
    () =>
      workspace.projects
        .filter((p) => p.assigneeIds.includes(currentDesignerId) && !p.archived)
        .sort(sortByPriorityThenDue),
    [workspace.projects, currentDesignerId],
  );

  const overdueTasks = useMemo(() => {
    const today = todayIso();
    return myProjects
      .filter((p) => p.dueDate && p.dueDate < today)
      .sort(sortByPriorityThenDue);
  }, [myProjects]);

  const dueSoon = useMemo(() => {
    const today = todayIso();
    const nextWeek = shiftIso(today, 7);
    return myProjects
      .filter((p) => p.dueDate && p.dueDate >= today && p.dueDate <= nextWeek)
      .sort(sortByPriorityThenDue);
  }, [myProjects]);

  const highPriority = useMemo(
    () =>
      myProjects
        .filter((p) => p.priority === "Urgent" || p.priority === "High")
        .slice(0, 5),
    [myProjects],
  );

  const upcomingDeadlines = useMemo(() => {
    const today = todayIso();
    const twoWeeksOut = shiftIso(today, 14);
    return myProjects
      .filter((p) => p.dueDate && p.dueDate >= today && p.dueDate <= twoWeeksOut)
      .sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""))
      .slice(0, 6);
  }, [myProjects]);

  // The next thing due, for the band's countdown.
  const nextDue = useMemo(() => {
    const today = todayIso();
    return (
      myProjects
        .filter((p) => p.dueDate && p.dueDate >= today)
        .sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""))[0] ?? null
    );
  }, [myProjects]);

  // Campaigns you own. The owner works like a project's assignees: these
  // campaigns' milestones are your work, so the open ones land on the desk.
  const ownedCampaigns = useMemo(
    () => campaigns.filter((c) => c.ownerId === currentDesignerId),
    [campaigns, currentDesignerId],
  );

  // Campaigns that are yours in any sense — owned, or fed by a project
  // you're on. Decides whether the Campaigns tab is worth showing.
  const myCampaigns = useMemo(() => {
    const mine = new Set(myAllProjects.map((p) => p.id));
    return campaigns.filter(
      (c) => c.ownerId === currentDesignerId || c.projectIds.some((id) => mine.has(id)),
    );
  }, [campaigns, myAllProjects, currentDesignerId]);

  // Their overdue milestones and the next fortnight's, soonest first.
  const myMilestones = useMemo(() => {
    const horizon = shiftIso(todayIso(), MILESTONE_HORIZON_DAYS);
    return ownedCampaigns
      .flatMap((campaign) =>
        campaign.milestones
          .filter((m) => !m.done && m.date && m.date <= horizon)
          .map((milestone) => ({ campaign, milestone })),
      )
      .sort(
        (a, b) =>
          a.milestone.date.localeCompare(b.milestone.date) ||
          a.campaign.name.localeCompare(b.campaign.name),
      );
  }, [ownedCampaigns]);

  // The teams you belong to. A team with no member list is open to all.
  const myTeams = useMemo(
    () =>
      workspaces.filter(
        (w) => !w.memberIds?.length || w.memberIds.includes(currentDesignerId),
      ),
    [workspaces, currentDesignerId],
  );

  const getStatusColor = (priority: string): string => {
    switch (priority) {
      case "Urgent":
        return "#8a1c16";
      case "High":
        return "#b4501f";
      case "Normal":
        return "#371ee1";
      case "Low":
        return "#8b96a8";
      default:
        return "#5d6b82";
    }
  };

  const dueLabel = (dueDate: string | undefined): string => {
    const n = daysUntil(dueDate);
    if (n === null) return "No due date";
    if (n < 0) return `${Math.abs(n)} days overdue`;
    if (n === 0) return "Due today";
    return `Due in ${n} days`;
  };

  const today = todayIso();
  const todayItems = deskItems.filter(
    (i) => !i.done && !i.remind && i.date <= today,
  );
  const openDeskCount = todayItems.length;

  const currentDesigner = workspace.designers.find(
    (d) => d.id === currentDesignerId,
  );
  const firstName = currentDesigner?.name.split(" ")[0] ?? "";

  // ── the page shell ───────────────────────────────────────────────────

  const showCampaigns = myCampaigns.length > 0;
  const here: DeskTab = tab === "campaigns" && !showCampaigns ? "overview" : tab;

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "work", label: "My work", count: myProjects.length },
    { id: "checklist", label: "Checklist", count: openDeskCount },
    ...(showCampaigns ? [{ id: "campaigns", label: "Campaigns", count: myCampaigns.length }] : []),
    { id: "notifications", label: "Notifications", count: notifications.length + reviewProjects.length },
  ];

  // Overdue work trumps the next deadline: if something has slipped, that's
  // the number to see first.
  const countdown = (() => {
    if (overdueTasks.length > 0) {
      return {
        value: String(overdueTasks.length),
        label: `project${overdueTasks.length === 1 ? "" : "s"} overdue`,
      };
    }
    if (nextDue) {
      const n = daysUntil(nextDue.dueDate) ?? 0;
      // The band's small print, so a long title is cut short.
      const title =
        nextDue.title.length > 36 ? `${nextDue.title.slice(0, 35).trimEnd()}…` : nextDue.title;
      return n === 0
        ? { value: "Today", label: `${title} is due` }
        : { value: String(n), label: `day${n === 1 ? "" : "s"} to ${title}` };
    }
    return { value: "—", label: "no deadlines ahead" };
  })();

  const facts = [
    { label: "Live projects", value: <b className="mono">{myProjects.length}</b> },
    { label: "Overdue", value: <b className="mono">{overdueTasks.length}</b> },
    { label: "Due this week", value: <b className="mono">{dueSoon.length}</b> },
    { label: "For review", value: <b className="mono">{reviewProjects.length}</b> },
    { label: "Today's list", value: <b className="mono">{openDeskCount}</b> },
  ];

  // The week ahead: a cell per day with what's due and what's on your list.
  // Overdue work, when there is any, sits first in red.
  const strip: StripCell[] = [];
  if (overdueTasks.length > 0) {
    strip.push({
      key: "overdue",
      n: "!",
      label: "Overdue",
      detail: `${overdueTasks.length} project${overdueTasks.length === 1 ? "" : "s"}`,
      state: "late",
      title: overdueTasks.map((p) => p.title).join(", "),
      onClick: () => setTab("work"),
    });
  }
  for (let i = 0; i < STRIP_DAYS; i++) {
    const iso = shiftIso(today, i);
    const date = new Date(`${iso}T00:00:00`);
    const due = myProjects.filter((p) => p.dueDate === iso);
    const items = deskItems.filter((it) => !it.done && it.date === iso).length;
    const parts: string[] = [];
    if (due.length > 0) parts.push(`${due.length} due`);
    if (items > 0) parts.push(`${items} on list`);
    strip.push({
      key: iso,
      n: date.toLocaleDateString(undefined, { weekday: "short" }),
      label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : formatShort(iso),
      detail: parts.length > 0 ? parts.join(" · ") : "Clear",
      state: i === 0 ? "current" : due.length > 0 ? "open" : "na",
      active: i === 0,
      title: due.length > 0 ? due.map((p) => p.title).join(", ") : undefined,
      onClick:
        due.length > 0 ? () => setTab("work") : items > 0 ? () => setTab("checklist") : undefined,
    });
  }

  const peekNotifications = sortNotifications(notifications).slice(0, 4);
  const peekReviews = reviewProjects.slice(0, 3);

  return (
    <div className="mydesk">
      <ItemPage
        kind="desk"
        crumbs={[]}
        eyebrow={`My Desk · ${formatLong(today)}`}
        title={firstName ? `${greeting()}, ${firstName}` : greeting()}
        subtitle={
          <>
            {openDeskCount > 0
              ? `${openDeskCount} thing${openDeskCount === 1 ? "" : "s"} on today's list`
              : "Nothing on today's list yet"}
            {" · "}
            {myProjects.length} live project{myProjects.length === 1 ? "" : "s"}
            {myTeams.length > 0
              ? ` across ${myTeams.length} team${myTeams.length === 1 ? "" : "s"}`
              : ""}
          </>
        }
        countdown={countdown}
        chips={
          <>
            {currentDesigner && (
              <span className="item-chip item-people">
                <Avatar designer={currentDesigner} size={18} /> {currentDesigner.name}
              </span>
            )}
            {myTeams.map((w) => (
              <span key={w.id} className="item-chip">
                {w.name}
              </span>
            ))}
          </>
        }
        facts={facts}
        tabs={tabs}
        tab={here}
        onTab={(id) => setTab(id as DeskTab)}
        strip={strip}
        stripLabel="The week ahead"
      >
        {deskError && (
          <div className="desk-banner error">
            Your checklist isn't syncing: {deskError}
          </div>
        )}
        {flash && <div className="desk-banner">{flash}</div>}

        {here === "overview" ? (
          <ItemGrid
            main={
              <>
                <div className="mydesk-notifications">
                  {highPriority.length > 0 && (
                    <section className="notification-card high-priority">
                      <h3>High Priority</h3>
                      <div className="notification-list">
                        {highPriority.map((p) => (
                          <div
                            key={p.id}
                            className="notification-item"
                            onClick={() => onOpenProject(p.id)}
                          >
                            <span className="notification-title">{p.title}</span>
                            {p.dueDate && (
                              <span className="notification-meta">
                                {dueLabel(p.dueDate)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {overdueTasks.length > 0 && (
                    <section className="notification-card overdue">
                      <h3>Overdue</h3>
                      <div className="notification-list">
                        {overdueTasks.map((p) => (
                          <div
                            key={p.id}
                            className="notification-item"
                            onClick={() => onOpenProject(p.id)}
                          >
                            <span className="notification-title">{p.title}</span>
                            <span className="notification-meta">
                              {Math.abs(daysUntil(p.dueDate)!)} days overdue
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {dueSoon.length > 0 && (
                    <section className="notification-card due-soon">
                      <h3>Due Soon</h3>
                      <div className="notification-list">
                        {dueSoon.map((p) => (
                          <div
                            key={p.id}
                            className="notification-item"
                            onClick={() => onOpenProject(p.id)}
                          >
                            <span className="notification-title">{p.title}</span>
                            <span className="notification-meta">
                              {dueLabel(p.dueDate)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {highPriority.length === 0 &&
                    overdueTasks.length === 0 &&
                    dueSoon.length === 0 && (
                      <section className="notification-card empty">
                        <p className="muted">
                          Nothing needs immediate attention. Great work!
                        </p>
                      </section>
                    )}
                </div>

                <SideCard
                  title="Upcoming deadlines"
                  aside={<span className="badge">{upcomingDeadlines.length}</span>}
                >
                  {upcomingDeadlines.length === 0 ? (
                    <EmptyNote>No deadlines in the next two weeks.</EmptyNote>
                  ) : (
                    <div className="deadline-list">
                      {upcomingDeadlines.map((p) => {
                        const date = new Date(`${p.dueDate}T00:00:00`);
                        return (
                          <div
                            key={p.id}
                            className="deadline-item"
                            onClick={() => onOpenProject(p.id)}
                          >
                            <div className="deadline-date">
                              <div className="deadline-day">{date.getDate()}</div>
                              <div className="deadline-month">
                                {date.toLocaleDateString(undefined, { month: "short" })}
                              </div>
                            </div>
                            <div className="deadline-content">
                              <div className="deadline-title">{p.title}</div>
                              <div className="deadline-meta">{p.client || "—"}</div>
                            </div>
                            <span
                              className="priority-badge"
                              style={{ backgroundColor: getStatusColor(p.priority) }}
                            >
                              {p.priority}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </SideCard>

                {/* The milestones on campaigns you own — the owner's
                    equivalent of a project's due dates. Only owners see it. */}
                {ownedCampaigns.length > 0 && (
                  <SideCard
                    title="Your campaign milestones"
                    aside={<span className="badge">{myMilestones.length}</span>}
                  >
                    {myMilestones.length === 0 ? (
                      <EmptyNote>
                        Nothing overdue or due in the next two weeks on the{" "}
                        {ownedCampaigns.length === 1
                          ? "campaign"
                          : `${ownedCampaigns.length} campaigns`}{" "}
                        you own.
                      </EmptyNote>
                    ) : (
                      <ul className="camp-card-ms desk-ms-list">
                        {myMilestones.map(({ campaign: c, milestone: m }) => {
                          const overdue = m.date < today;
                          return (
                            <li
                              key={m.id}
                              style={{ ["--camp" as string]: c.color } as React.CSSProperties}
                            >
                              <label className={`camp-card-ms-row ${overdue ? "overdue" : ""}`}>
                                <input
                                  type="checkbox"
                                  checked={m.done}
                                  onChange={() => onToggleMilestone(c, m.id)}
                                  title="Tick once it has happened"
                                />
                                <span className="camp-card-ms-date">{formatShort(m.date)}</span>
                                <span className="camp-card-ms-label">
                                  {m.label}
                                  <span className="muted">
                                    {" "}
                                    · {c.name}
                                    {overdue ? " · overdue" : ""}
                                  </span>
                                </span>
                              </label>
                              <button
                                type="button"
                                className="camp-card-project"
                                onClick={() => onOpenCampaign(c.id)}
                                title={`Open ${c.name} on the Campaigns page`}
                              >
                                Open
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </SideCard>
                )}
              </>
            }
            sideTop={
              <SideCard
                title="Today's list"
                aside={
                  <button type="button" className="desk-link" onClick={() => setTab("checklist")}>
                    Open checklist
                  </button>
                }
              >
                {todayItems.length === 0 ? (
                  <EmptyNote>Nothing on today's list. Add something on the Checklist tab.</EmptyNote>
                ) : (
                  <ul className="desk-peek">
                    {todayItems.slice(0, 6).map((i) => (
                      <li key={i.id}>
                        <span className="desk-peek-text">{i.text}</span>
                        {(i.rolled ?? 0) > 0 && (
                          <span className="muted small">
                            {" "}
                            · rolled {i.rolled}×
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {todayItems.length > 6 && (
                  <p className="item-hint">
                    +{todayItems.length - 6} more on the Checklist tab
                  </p>
                )}
              </SideCard>
            }
            sideBottom={
              <SideCard
                title="Needs you"
                aside={
                  <button type="button" className="desk-link" onClick={() => setTab("notifications")}>
                    See all
                  </button>
                }
              >
                {peekReviews.length === 0 && peekNotifications.length === 0 ? (
                  <EmptyNote>Nothing new. @-mentions, replies and review requests land here.</EmptyNote>
                ) : (
                  <ul className="notify-list">
                    {peekReviews.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          className="notify-row"
                          onClick={() => onOpenProject(p.id)}
                        >
                          <span className="notify-tag review">Review</span>
                          <span className="notify-body">
                            <span className="notify-title">{p.title}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                    {peekNotifications.map((n) => {
                      const project = workspace.projects.find((p) => p.id === n.projectId);
                      return (
                        <li key={n.id}>
                          <button
                            type="button"
                            className="notify-row"
                            onClick={() => onOpenNotification(n.projectId, n.id)}
                          >
                            <span className="notify-tag">{notificationTag(n.kind)}</span>
                            <span className="notify-body">
                              <span className="notify-title">
                                <strong>{n.fromName}</strong> {describeNotification(n.kind)}
                                {project ? ` · ${project.title}` : ""}
                              </span>
                            </span>
                            <span className="notify-when">{timeAgo(n.createdAt)}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </SideCard>
            }
          />
        ) : here === "work" ? (
          <MyWork
            projects={myProjects}
            allProjects={myAllProjects}
            designers={workspace.designers}
            workspaces={workspaces}
            campaignsByProject={campaignsByProject}
            onOpen={onOpenProject}
            onStatusChange={onStatusChange}
            onOpenCampaign={onOpenCampaign}
          />
        ) : here === "checklist" ? (
          <>
            {/* Put a project on today's list without retyping its title. */}
            {myProjects.length > 0 && (
              <div className="desk-addproject">
                <span className="eyebrow">Add a project to today's list</span>
                {/* The same type-to-search picker the editors use. Nothing
                    stays selected: a pick goes straight onto the list and
                    the box clears for the next one. */}
                <ProjectPicker
                  projects={myProjects}
                  workspaces={workspaces}
                  value={[]}
                  single
                  onChange={(ids) => {
                    const p = myProjects.find((x) => x.id === ids[0]);
                    if (p) addProjectToToday(p);
                  }}
                  placeholder="Search your projects by title, client or brand…"
                />
              </div>
            )}
            {/* The personal checklist — Today / Upcoming / Completed. */}
            <DeskChecklist
              items={deskItems}
              projects={workspace.projects}
              onAdd={(text) => addDeskItem(text)}
              onPatch={patchDeskItem}
              onRemove={removeDeskItem}
              onOpenProject={onOpenProject}
              onFlash={setFlash}
            />
          </>
        ) : here === "campaigns" ? (
          /* Campaigns that any project you're assigned to is feeding, or that
             you own — the wider thing your work is part of. */
          <CampaignsPanel
            campaigns={campaigns}
            projects={workspace.projects.filter(
              (p) => p.assigneeIds.includes(currentDesignerId) && !p.archived,
            )}
            title="Your campaigns"
            subject="you"
            ownerId={currentDesignerId}
            onOpenCampaign={onOpenCampaign}
            onOpenProject={onOpenProject}
            storageKey="waypoint.mydesk.campaignsCollapsed"
          />
        ) : (
          /* Things other people have directed at you, as distinct from the
             Overview's cards, which come from your own projects' dates. */
          <section className="mydesk-section mydesk-notify">
            <div className="mydesk-section-head">
              <h3>Notifications</h3>
              <div className="desk-head-right">
                <span className="badge">
                  {notifications.length + reviewProjects.length}
                </span>
                {notifications.length > 0 && (
                  <button
                    type="button"
                    className="desk-link"
                    onClick={onClearNotifications}
                  >
                    Clear all
                  </button>
                )}
              </div>
            </div>

            {notifications.length === 0 && reviewProjects.length === 0 ? (
              <p className="muted small">
                Nothing new. @-mentions, replies and review requests land here.
              </p>
            ) : (
              <>
                {reviewProjects.length > 0 && (
                  <>
                    <div className="notify-group">Awaiting your review</div>
                    <ul className="notify-list">
                      {reviewProjects.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            className="notify-row"
                            onClick={() => onOpenProject(p.id)}
                          >
                            <span className="notify-tag review">Review</span>
                            <span className="notify-body">
                              <span className="notify-title">{p.title}</span>
                              <span className="notify-meta">
                                {p.client || "No client"}
                                {p.dueDate ? ` · ${dueLabel(p.dueDate)}` : ""}
                              </span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {notifications.length > 0 && (
                  <>
                    {reviewProjects.length > 0 && (
                      <div className="notify-group">Mentions &amp; replies</div>
                    )}
                    <ul className="notify-list">
                      {sortNotifications(notifications).map((n) => {
                        const project = workspace.projects.find(
                          (p) => p.id === n.projectId,
                        );
                        return (
                          <li key={n.id}>
                            <button
                              type="button"
                              className="notify-row"
                              onClick={() => onOpenNotification(n.projectId, n.id)}
                            >
                              <span className="notify-tag">
                                {notificationTag(n.kind)}
                              </span>
                              <span className="notify-body">
                                <span className="notify-title">
                                  <strong>{n.fromName}</strong>{" "}
                                  {describeNotification(n.kind)}
                                  {project ? ` · ${project.title}` : ""}
                                </span>
                                {n.snippet && (
                                  <span className="notify-snippet">
                                    {n.snippet}
                                  </span>
                                )}
                              </span>
                              <span className="notify-when">
                                {timeAgo(n.createdAt)}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </>
            )}
          </section>
        )}
      </ItemPage>
    </div>
  );
}
