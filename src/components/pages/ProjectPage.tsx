import { useState } from "react";
import type {
  Campaign,
  Designer,
  Notification,
  Priority,
  Project,
  ProjectStatus,
  SocialPost,
  Workspace,
} from "../../types";
import {
  PROJECT_STATUSES,
  brandColor,
  projectStatusLabel,
  socialStatusMeta,
} from "../../constants";
import { projectContentTypes } from "../../contentTypes";
import { daysUntil, formatShort, timeAgo } from "../../dates";
import { copyText, projectShareUrl } from "../../share";
import { socialPostTitle } from "../../socialPosts";
import { Avatar } from "../Avatar";
import { Icon } from "../Icon";
import { LinkifiedText } from "../LinkifiedText";
import { ProjectDetailModal } from "../ProjectDetailModal";
import {
  EmptyNote,
  ItemGrid,
  ItemPage,
  KeyValues,
  ReadyCount,
  ReadyWhen,
  SideCard,
  StatusChip,
  type StripCell,
  type WpStatus,
} from "./ItemPage";
import { countdownFor } from "./countdown";

type Props = {
  project: Project;
  designers: Designer[];
  reviewers: Designer[];
  workspaces: Workspace[];
  // Every campaign and every social post; the page picks out the ones
  // linked to this project.
  campaigns: Campaign[];
  socialPosts: SocialPost[];
  contentTypeOptions: readonly string[];
  currentDesignerId: string;
  currentDesignerName: string;
  tab: string;
  onTab: (tab: string) => void;
  // Back to the project's team board.
  onBack: () => void;
  onChange: (updater: (p: Project) => Project) => void;
  onSetReviewers: (reviewerIds: string[]) => void;
  onStatusChange: (status: ProjectStatus) => void;
  onArchiveToggle: (archived: boolean) => void;
  onDelete: () => void;
  onNotify: (notifications: Notification[]) => void;
  onMoveToWorkspace: (workspaceId: string) => void;
  onOpenSocialPost: (postId: string) => void;
  onOpenCampaign: (campaignId: string) => void;
};

const STATUS_CHIP: Record<ProjectStatus, WpStatus> = {
  planning: "planning",
  active: "in-progress",
  paused: "draft",
  completed: "complete",
};

const PRIORITIES: Priority[] = ["Urgent", "High", "Normal", "Low"];

function newMilestoneId(): string {
  return `ms-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function ProjectPage({
  project,
  designers,
  reviewers,
  workspaces,
  campaigns,
  socialPosts,
  contentTypeOptions,
  currentDesignerId,
  currentDesignerName,
  tab,
  onTab,
  onBack,
  onChange,
  onSetReviewers,
  onStatusChange,
  onArchiveToggle,
  onDelete,
  onNotify,
  onMoveToWorkspace,
  onOpenSocialPost,
  onOpenCampaign,
}: Props) {
  const status: ProjectStatus = project.status ?? "active";
  const workspaceName =
    workspaces.find((w) => w.id === project.workspaceId)?.name ?? project.workspaceId;
  const assignees = project.assigneeIds
    .map((id) => designers.find((d) => d.id === id))
    .filter((d): d is Designer => !!d);
  const reviewerList = (project.reviewerIds ?? [])
    .map((id) => designers.find((d) => d.id === id))
    .filter((d): d is Designer => !!d);
  const contentTypes = projectContentTypes(project);
  const linkedCampaigns = campaigns
    .filter((c) => c.projectIds.includes(project.id))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const linkedPosts = socialPosts
    .filter((p) => p.projectId === project.id)
    .sort((a, b) => (b.date || "0000").localeCompare(a.date || "0000"));

  const tasks = project.milestones;
  const tasksDone = tasks.filter((m) => m.done).length;
  const openTasks = tasks.filter((m) => !m.done);
  const days = status === "completed" ? null : daysUntil(project.dueDate || undefined);
  const overdue = days !== null && days < 0;
  const countdown =
    status === "completed"
      ? { value: "Done", label: "project completed" }
      : countdownFor(days, {
          none: "no due date",
          before: "days to due date",
          today: "due today",
          after: "days overdue",
        });

  const [shareState, setShareState] = useState<"idle" | "copied" | "failed">("idle");
  async function copyLink() {
    const ok = await copyText(projectShareUrl(project.id));
    setShareState(ok ? "copied" : "failed");
    window.setTimeout(() => setShareState("idle"), 2500);
  }

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [newTask, setNewTask] = useState("");
  // The task being renamed in place, and its draft text.
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskDraft, setTaskDraft] = useState("");

  function toggleTask(id: string) {
    onChange((p) => ({
      ...p,
      milestones: p.milestones.map((m) => (m.id === id ? { ...m, done: !m.done } : m)),
    }));
  }
  function addTask() {
    const label = newTask.trim();
    if (!label) return;
    onChange((p) => ({
      ...p,
      milestones: [...p.milestones, { id: newMilestoneId(), label, done: false }],
    }));
    setNewTask("");
  }
  function removeTask(id: string) {
    onChange((p) => ({ ...p, milestones: p.milestones.filter((m) => m.id !== id) }));
    if (editingTaskId === id) setEditingTaskId(null);
  }
  function startEditTask(id: string, label: string) {
    setEditingTaskId(id);
    setTaskDraft(label);
  }
  function saveEditTask() {
    const id = editingTaskId;
    if (!id) return;
    const label = taskDraft.trim();
    if (label) {
      onChange((p) => ({
        ...p,
        milestones: p.milestones.map((m) => (m.id === id ? { ...m, label } : m)),
      }));
    }
    setEditingTaskId(null);
  }
  function moveTask(id: string, dir: -1 | 1) {
    onChange((p) => {
      const list = p.milestones.slice();
      const i = list.findIndex((m) => m.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return p;
      [list[i], list[j]] = [list[j], list[i]];
      return { ...p, milestones: list };
    });
  }

  const reqs: [string, boolean][] = [
    ["Brief linked", !!project.briefUrl.trim()],
    ["Someone assigned", project.assigneeIds.length > 0],
    ["Due date set", !!project.dueDate],
    ["Content type tagged", contentTypes.length > 0],
    ["Every task done", tasks.length > 0 && tasksDone === tasks.length],
  ];

  // The lifecycle as the stage strip: click a stage to move the project.
  const strip: StripCell[] = PROJECT_STATUSES.map((s, i) => {
    const idx = PROJECT_STATUSES.findIndex((x) => x.value === status);
    const state = i < idx ? "done" : i === idx ? "current" : "open";
    return {
      key: s.value,
      n: String(i + 1).padStart(2, "0"),
      label: s.label,
      detail:
        s.value === status
          ? "Now"
          : s.value === "completed" && project.dueDate
            ? `Due ${formatShort(project.dueDate)}`
            : undefined,
      state,
      active: s.value === status,
      title: `Move to ${s.label}`,
      onClick: () => onStatusChange(s.value),
    };
  });

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "details", label: "Details" },
    { id: "tasks", label: "Tasks", count: openTasks.length },
    { id: "comments", label: "Comments", count: project.comments.length },
    { id: "links", label: "Links", count: linkedCampaigns.length + linkedPosts.length },
  ];

  // The full editor is the Details tab; the same component, narrowed to
  // its comment thread, is the Comments tab.
  const editorProps = {
    project,
    designers,
    reviewers,
    workspaces,
    currentDesignerId,
    currentDesignerName,
    contentTypeOptions,
    onClose: onBack,
    onChange,
    onSetReviewers,
    onStatusChange,
    onArchiveToggle,
    onDelete,
    onNotify,
    onMoveToWorkspace,
    onOpenSocialPost,
    onOpenCampaign,
  };

  const facts = [
    { label: "Due", value: project.dueDate ? <b className="mono">{formatShort(project.dueDate)}</b> : "Not set" },
    { label: "Tasks", value: <b className="mono">{tasksDone}/{tasks.length}</b> },
    {
      label: "Assigned",
      value: assignees.length ? (
        <span className="item-people">
          {assignees.map((d) => (
            <Avatar key={d.id} designer={d} size={20} />
          ))}
          <span>{assignees.map((d) => d.name).join(", ")}</span>
        </span>
      ) : (
        "Nobody yet"
      ),
    },
    { label: "Team", value: workspaceName },
    {
      label: "Source",
      value: project.source === "outlook" ? "Outlook" : project.source === "teams" ? "Teams" : "Manual",
    },
  ];

  return (
    <ItemPage
      kind="project"
      crumbs={[
        { label: workspaceName, onClick: onBack },
        { label: project.title || "Untitled project", onClick: tab === "overview" ? undefined : () => onTab("overview") },
        ...(tab === "overview" ? [] : [{ label: tabs.find((t) => t.id === tab)?.label ?? tab }]),
      ]}
      eyebrow={[workspaceName, project.brand, project.client].filter(Boolean).join(" · ")}
      title={project.title || "Untitled project"}
      subtitle={contentTypes.length ? contentTypes.join(" · ") : undefined}
      countdown={countdown}
      chips={
        <>
          <StatusChip status={STATUS_CHIP[status]}>{projectStatusLabel(status)}</StatusChip>
          <span className={`item-chip priority-${project.priority.toLowerCase()}`}>{project.priority}</span>
          {reviewerList.length > 0 && <StatusChip status="review">In review</StatusChip>}
          {overdue && <StatusChip status="blocked">Overdue</StatusChip>}
          {project.archived && <span className="item-chip">Archived</span>}
        </>
      }
      facts={facts}
      actions={
        <>
          {project.briefUrl.trim() && (
            <a className="btn btn-ghost btn-sm" href={project.briefUrl} target="_blank" rel="noopener noreferrer">
              <Icon name="file" size={14} /> Open brief
            </a>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={copyLink}>
            <Icon name="link" size={14} />
            {shareState === "copied" ? "Link copied" : shareState === "failed" ? "Copy failed" : "Copy link"}
          </button>
        </>
      }
      tabs={tabs}
      tab={tab}
      onTab={onTab}
      strip={strip}
      stripLabel="Project lifecycle"
    >
      {tab === "details" ? (
        <ProjectDetailModal inline {...editorProps} />
      ) : tab === "comments" ? (
        <ItemGrid
          main={
            <SideCard title="Comments" aside={<span className="item-hint">Mention a teammate with @ to notify them</span>}>
              <ProjectDetailModal inline section="comments" {...editorProps} />
            </SideCard>
          }
          sideTop={
            <SideCard title="Thread">
              <KeyValues
                rows={[
                  { label: "Comments", value: <b className="mono">{project.comments.filter((c) => !c.parentId).length}</b> },
                  { label: "Replies", value: <b className="mono">{project.comments.filter((c) => !!c.parentId).length}</b> },
                  {
                    label: "Latest",
                    value: project.comments.length
                      ? timeAgo(project.comments.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0].createdAt)
                      : "—",
                  },
                ]}
              />
            </SideCard>
          }
        />
      ) : tab === "tasks" ? (
        <ItemGrid
          main={
            <SideCard title="Tasks" aside={<span className="item-counter">{tasksDone} of {tasks.length}</span>}>
              {tasks.length === 0 ? (
                <EmptyNote>No tasks yet. Add the steps this project goes through.</EmptyNote>
              ) : (
                <ul className="item-tasks">
                  {tasks.map((m, i) => (
                    <li key={m.id} className={m.done ? "done" : ""}>
                      <button
                        type="button"
                        className="item-tick"
                        aria-pressed={m.done}
                        aria-label={`${m.label}: ${m.done ? "done" : "not done"}`}
                        onClick={() => toggleTask(m.id)}
                      >
                        {m.done && <Icon name="checkmark" size={12} />}
                      </button>
                      {editingTaskId === m.id ? (
                        <input
                          className="item-task-edit"
                          autoFocus
                          value={taskDraft}
                          aria-label="Task"
                          onChange={(e) => setTaskDraft(e.target.value)}
                          onBlur={saveEditTask}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              saveEditTask();
                            } else if (e.key === "Escape") {
                              e.preventDefault();
                              setEditingTaskId(null);
                            }
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          className="item-task-label item-task-edit-btn"
                          title="Click to edit"
                          onClick={() => startEditTask(m.id, m.label)}
                        >
                          {m.label}
                        </button>
                      )}
                      <span className="item-task-tools">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          aria-label={`Move ${m.label} up`}
                          disabled={i === 0}
                          onClick={() => moveTask(m.id, -1)}
                        >
                          <Icon name="chevron-down" size={14} className="flip" />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          aria-label={`Move ${m.label} down`}
                          disabled={i === tasks.length - 1}
                          onClick={() => moveTask(m.id, 1)}
                        >
                          <Icon name="chevron-down" size={14} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => startEditTask(m.id, m.label)}
                          aria-label={`Edit ${m.label}`}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => removeTask(m.id)}
                          aria-label={`Remove ${m.label}`}
                        >
                          Remove
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <form
                className="item-addrow"
                onSubmit={(e) => {
                  e.preventDefault();
                  addTask();
                }}
              >
                <input
                  value={newTask}
                  onChange={(e) => setNewTask(e.target.value)}
                  placeholder="Add a task"
                  aria-label="New task"
                />
                <button type="submit" className="btn btn-primary btn-sm" disabled={!newTask.trim()}>
                  Add task
                </button>
              </form>
              <p className="item-hint">Click a task to rename it. Enter saves, Escape cancels.</p>
            </SideCard>
          }
          sideTop={
            <SideCard title="Ready when" aside={<ReadyCount reqs={reqs} />}>
              <ReadyWhen reqs={reqs} action={completeAction()} />
            </SideCard>
          }
        />
      ) : tab === "links" ? (
        <ItemGrid
          main={
            <>
              <SideCard title="Campaigns" aside={<span className="item-hint">This project contributes to</span>}>
                {linkedCampaigns.length === 0 ? (
                  <EmptyNote>Not part of a campaign. Link it from the campaign's Details tab.</EmptyNote>
                ) : (
                  <ul className="item-links">
                    {linkedCampaigns.map((c) => (
                      <li key={c.id}>
                        <button type="button" className="item-link-row" onClick={() => onOpenCampaign(c.id)}>
                          <span className="item-swatch" style={{ background: c.color || brandColor(c.brand) }} />
                          <span className="item-link-main">
                            <b>{c.name}</b>
                            <span className="item-hint">
                              {c.evergreen ? `From ${formatShort(c.startDate)} · evergreen` : `${formatShort(c.startDate)} – ${formatShort(c.endDate)}`}
                              {c.brand ? ` · ${c.brand}` : ""}
                            </span>
                          </span>
                          <Icon name="chevron-right" size={16} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </SideCard>
              <SideCard title="Social posts" aside={<span className="item-hint">Posts that promote this work</span>}>
                {linkedPosts.length === 0 ? (
                  <EmptyNote>No posts link here yet. Link one from the post's editor on the Social calendar.</EmptyNote>
                ) : (
                  <ul className="item-links">
                    {linkedPosts.map((p) => {
                      const meta = socialStatusMeta(p.status);
                      return (
                        <li key={p.id}>
                          <button type="button" className="item-link-row" onClick={() => onOpenSocialPost(p.id)}>
                            <span className="item-swatch" style={{ background: meta.color }} />
                            <span className="item-link-main">
                              <b>{socialPostTitle(p)}</b>
                              <span className="item-hint">
                                {p.date ? formatShort(p.date) : "Unscheduled"} · {p.channel} · {meta.label}
                              </span>
                            </span>
                            <Icon name="chevron-right" size={16} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </SideCard>
            </>
          }
          sideTop={
            <SideCard title="Share">
              <p className="item-hint">A link to this project. Whoever opens it still signs in.</p>
              <code className="item-code">{projectShareUrl(project.id)}</code>
              <button type="button" className="btn btn-secondary btn-sm" onClick={copyLink}>
                {shareState === "copied" ? "Link copied" : shareState === "failed" ? "Copy failed" : "Copy link"}
              </button>
            </SideCard>
          }
        />
      ) : (
        <ItemGrid
          main={
            <>
              <SideCard title="Up next" aside={<span className="item-hint">{openTasks.length} open</span>}>
                {openTasks.length === 0 ? (
                  <EmptyNote>{tasks.length ? "Every task is done." : "No tasks yet. Add them on the Tasks tab."}</EmptyNote>
                ) : (
                  <ul className="item-tasks">
                    {openTasks.slice(0, 5).map((m) => (
                      <li key={m.id}>
                        <button
                          type="button"
                          className="item-tick"
                          aria-pressed={false}
                          aria-label={`${m.label}: not done`}
                          onClick={() => toggleTask(m.id)}
                        />
                        <span className="item-task-label">{m.label}</span>
                      </li>
                    ))}
                    {openTasks.length > 5 && (
                      <li className="item-more">
                        <button type="button" className="link-btn" onClick={() => onTab("tasks")}>
                          {openTasks.length - 5} more on the Tasks tab
                        </button>
                      </li>
                    )}
                  </ul>
                )}
              </SideCard>
              <SideCard
                title="Brief"
                aside={
                  <button type="button" className="link-btn" onClick={() => onTab("details")}>
                    Edit
                  </button>
                }
              >
                {project.overview.trim() ? (
                  <div className="item-prose">
                    <LinkifiedText text={project.overview} designers={designers} />
                  </div>
                ) : (
                  <EmptyNote>No overview yet. Write what this project is on the Details tab.</EmptyNote>
                )}
                {project.briefUrl.trim() && (
                  <a className="btn btn-secondary btn-sm" href={project.briefUrl} target="_blank" rel="noopener noreferrer">
                    <Icon name="external-link" size={14} /> Open the brief
                  </a>
                )}
              </SideCard>
              <SideCard
                title="Recent comments"
                aside={
                  <button type="button" className="link-btn" onClick={() => onTab("comments")}>
                    All comments
                  </button>
                }
              >
                {project.comments.length === 0 ? (
                  <EmptyNote>No comments yet.</EmptyNote>
                ) : (
                  <ul className="item-activity">
                    {project.comments
                      .slice()
                      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                      .slice(0, 4)
                      .map((c) => {
                        const author = designers.find((d) => d.name === c.author);
                        return (
                          <li key={c.id}>
                            {author ? (
                              <Avatar designer={author} size={24} />
                            ) : (
                              <span className="dot-avatar" style={{ width: 24, height: 24, fontSize: 10 }}>
                                {c.author.slice(0, 2).toUpperCase()}
                              </span>
                            )}
                            <span className="item-activity-body">
                              <b>{c.author}</b>
                              <span className="item-prose">
                                <LinkifiedText text={c.text} designers={designers} />
                              </span>
                            </span>
                            <span className="item-activity-when">{timeAgo(c.createdAt)}</span>
                          </li>
                        );
                      })}
                  </ul>
                )}
              </SideCard>
            </>
          }
          sideTop={
            <>
              <SideCard title="Status & schedule">
                <KeyValues
                  rows={[
                    {
                      label: "Status",
                      value: (
                        <select
                          value={status}
                          onChange={(e) => onStatusChange(e.target.value as ProjectStatus)}
                          aria-label="Project status"
                        >
                          {PROJECT_STATUSES.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      ),
                    },
                    {
                      label: "Due",
                      value: (
                        <span className="item-stack">
                          <input
                            type="date"
                            value={project.dueDate}
                            onChange={(e) => onChange((p) => ({ ...p, dueDate: e.target.value }))}
                            aria-label="Due date"
                          />
                          {overdue && <StatusChip status="blocked">Overdue by {-days!} day{-days! === 1 ? "" : "s"}</StatusChip>}
                          {!overdue && days !== null && days <= 7 && status !== "completed" && (
                            <StatusChip status="scheduled">{days === 0 ? "Due today" : `Due in ${days} day${days === 1 ? "" : "s"}`}</StatusChip>
                          )}
                        </span>
                      ),
                    },
                    {
                      label: "Priority",
                      value: (
                        <select
                          value={project.priority}
                          onChange={(e) => onChange((p) => ({ ...p, priority: e.target.value as Priority }))}
                          aria-label="Priority"
                        >
                          {PRIORITIES.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      ),
                    },
                    {
                      label: "Owner",
                      value: assignees.length ? (
                        <span className="item-stack">
                          {assignees.map((d) => (
                            <span key={d.id} className="item-person">
                              <Avatar designer={d} size={20} /> {d.name}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="item-hint">Nobody yet</span>
                      ),
                    },
                    {
                      label: "Reviewers",
                      value: reviewerList.length ? (
                        <span className="item-stack">
                          {reviewerList.map((d) => (
                            <span key={d.id} className="item-person">
                              <Avatar designer={d} size={20} /> {d.name}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="item-hint">None requested</span>
                      ),
                    },
                    {
                      label: "Team",
                      value: (
                        <select
                          value={project.workspaceId}
                          onChange={(e) => onMoveToWorkspace(e.target.value)}
                          aria-label="Team"
                        >
                          {workspaces.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.name}
                            </option>
                          ))}
                        </select>
                      ),
                    },
                  ]}
                />
                <button type="button" className="link-btn" onClick={() => onTab("details")}>
                  Change assignees and reviewers on Details
                </button>
              </SideCard>
              <SideCard title="Ready when" aside={<ReadyCount reqs={reqs} />}>
                <ReadyWhen reqs={reqs} action={completeAction()} />
              </SideCard>
            </>
          }
          sideBottom={
            <>
              <SideCard title="Links">
                <ul className="item-flist">
                  {project.briefUrl.trim() && (
                    <li>
                      <Icon name="file" size={16} />
                      <a href={project.briefUrl} target="_blank" rel="noopener noreferrer">
                        Brief
                      </a>
                    </li>
                  )}
                  {linkedCampaigns.map((c) => (
                    <li key={c.id}>
                      <Icon name="target" size={16} />
                      <button type="button" className="link-btn" onClick={() => onOpenCampaign(c.id)}>
                        {c.name}
                      </button>
                    </li>
                  ))}
                  {linkedPosts.slice(0, 4).map((p) => (
                    <li key={p.id}>
                      <Icon name="message-chat" size={16} />
                      <button type="button" className="link-btn" onClick={() => onOpenSocialPost(p.id)}>
                        {socialPostTitle(p)}
                      </button>
                    </li>
                  ))}
                  {!project.briefUrl.trim() && linkedCampaigns.length === 0 && linkedPosts.length === 0 && (
                    <li className="item-hint">Nothing linked yet.</li>
                  )}
                </ul>
                {linkedCampaigns.length + linkedPosts.length > 0 && (
                  <button type="button" className="link-btn" onClick={() => onTab("links")}>
                    Everything linked
                  </button>
                )}
              </SideCard>
              <SideCard title="Manage">
                <div className="item-manage">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => onArchiveToggle(!project.archived)}>
                    {project.archived ? "Unarchive" : "Archive project"}
                  </button>
                  {confirmingDelete ? (
                    <>
                      <span className="item-hint">Delete this project? It can't be undone.</span>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmingDelete(false)}>
                        Keep
                      </button>
                      <button type="button" className="btn btn-danger btn-sm" onClick={onDelete}>
                        Yes, delete
                      </button>
                    </>
                  ) : (
                    <button type="button" className="btn btn-danger-ghost btn-sm" onClick={() => setConfirmingDelete(true)}>
                      Delete project
                    </button>
                  )}
                </div>
              </SideCard>
            </>
          }
        />
      )}
    </ItemPage>
  );

  function completeAction() {
    if (status === "completed") return null;
    return (
      <button type="button" className="btn btn-primary btn-sm" onClick={() => onStatusChange("completed")}>
        <Icon name="checkmark" size={14} /> Mark completed
      </button>
    );
  }
}
