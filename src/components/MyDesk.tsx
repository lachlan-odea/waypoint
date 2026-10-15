import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Campaign,
  DeskItem,
  Notification,
  Project,
  WorkspaceData,
} from "../types";
import { Avatar } from "./Avatar";
import { CampaignsPanel } from "./CampaignsPanel";
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
  hasArrived,
  shiftIso,
  todayIso,
} from "../dates";

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
  // Marketing campaigns, for the "Your campaigns" panel: the ones any of
  // your projects contribute to.
  campaigns: Campaign[];
  onOpenCampaign: (campaignId: string) => void;
}

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
}: MyDeskProps) {
  const [deskItems, setDeskItems] = useState<DeskItem[]>([]);
  const [deskError, setDeskError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

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

  // Shortcut from a project row onto today's list, so you don't retype the
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

  const getStatusColor = (priority: string): string => {
    switch (priority) {
      case "Urgent":
        return "#c2335f";
      case "High":
        return "#f0844f";
      case "Normal":
        return "#371ee1";
      case "Low":
        return "#8a84ff";
      default:
        return "#5f6079";
    }
  };

  const dueLabel = (dueDate: string | undefined): string => {
    const n = daysUntil(dueDate);
    if (n === null) return "No due date";
    if (n < 0) return `${Math.abs(n)} days overdue`;
    if (n === 0) return "Due today";
    return `Due in ${n} days`;
  };

  const openDeskCount = deskItems.filter(
    (i) => !i.done && !i.remind && i.date <= todayIso(),
  ).length;

  const currentDesigner = workspace.designers.find(
    (d) => d.id === currentDesignerId,
  );

  return (
    <div className="mydesk">
      <div className="mydesk-header">
        <div className="mydesk-greeting">
          <h1>My Desk</h1>
          <p className="muted small">
            {formatLong(todayIso())}
            {openDeskCount > 0
              ? ` · ${openDeskCount} thing${openDeskCount === 1 ? "" : "s"} on today's list`
              : ""}
          </p>
        </div>
        {currentDesigner && <Avatar designer={currentDesigner} size={48} />}
      </div>

      {deskError && (
        <div className="desk-banner error">
          Your checklist isn't syncing: {deskError}
        </div>
      )}
      {flash && <div className="desk-banner">{flash}</div>}

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

      {/* Campaigns that any project you're assigned to is feeding — the
          wider thing your work is part of. Renders nothing when there are
          none, so people outside marketing never see an empty panel. */}
      <CampaignsPanel
        campaigns={campaigns}
        projects={workspace.projects.filter(
          (p) => p.assigneeIds.includes(currentDesignerId) && !p.archived,
        )}
        title="Your campaigns"
        subject="you"
        onOpenCampaign={onOpenCampaign}
        onOpenProject={onOpenProject}
        storageKey="waypoint.mydesk.campaignsCollapsed"
      />

      {/* Things other people have directed at you, as distinct from the cards
          above, which are derived from your own projects' dates. */}
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

      <div className="mydesk-grid">
        <section className="mydesk-section">
          <div className="mydesk-section-head">
            <h3>My Projects</h3>
            <span className="badge">{myProjects.length}</span>
          </div>
          {myProjects.length === 0 ? (
            <p className="muted small">No projects assigned to you.</p>
          ) : (
            <div className="project-list">
              {myProjects.map((p) => {
                const daysLeft = daysUntil(p.dueDate);
                return (
                  <div
                    key={p.id}
                    className="project-item"
                    onClick={() => onOpenProject(p.id)}
                  >
                    <div className="project-header">
                      <div className="project-title">{p.title}</div>
                      <span
                        className="priority-dot"
                        style={{ backgroundColor: getStatusColor(p.priority) }}
                        title={p.priority}
                      />
                    </div>
                    <div className="project-meta">
                      <span className="project-client">{p.client || "—"}</span>
                      {p.dueDate && (
                        <span
                          className={`project-due ${
                            daysLeft !== null && daysLeft < 0 ? "overdue" : ""
                          }`}
                        >
                          {daysLeft === null
                            ? "No due date"
                            : daysLeft < 0
                              ? `${Math.abs(daysLeft)}d overdue`
                              : daysLeft === 0
                                ? "Due today"
                                : `${daysLeft}d left`}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="desk-addtoday"
                      onClick={(e) => {
                        e.stopPropagation();
                        addProjectToToday(p);
                      }}
                    >
                      + Add to today's list
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="mydesk-section">
          <div className="mydesk-section-head">
            <h3>Upcoming Deadlines</h3>
            <span className="badge">{upcomingDeadlines.length}</span>
          </div>
          {upcomingDeadlines.length === 0 ? (
            <p className="muted small">
              No upcoming deadlines in the next 2 weeks.
            </p>
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
        </section>
      </div>
    </div>
  );
}
