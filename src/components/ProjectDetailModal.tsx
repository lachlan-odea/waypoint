import { useEffect, useState } from "react";
import type {
  Designer,
  Notification,
  Project,
  Priority,
  ProjectStatus,
  Workspace,
} from "../types";
import { BRANDS } from "../constants";
import { ContentTypeField } from "./ContentTypeField";
import { LinkifiedText } from "./LinkifiedText";
import { findMentionedDesigners, findNewMentions } from "../mentions";
import { Avatar } from "./Avatar";
import { AssigneePicker } from "./AssigneePicker";

type Props = {
  project: Project;
  // Full designer list — used for looking up names/avatars on existing
  // assignees, comment authors, @-mention parsing, AND as the source for
  // the assignee picker. Cross-team assignment is allowed: anyone on the
  // platform can be added regardless of team membership.
  designers: Designer[];
  // Designers eligible to be picked as reviewers (anyone with isReviewer
  // toggled on in Settings). The picker shows these as toggleable chips;
  // their UIDs end up in project.reviewerIds.
  reviewers: Designer[];
  // All known workspaces, used to render the Workspace move dropdown.
  workspaces: Workspace[];
  currentDesignerId: string;
  currentDesignerName: string;
  onClose: () => void;
  onChange: (updater: (p: Project) => Project) => void;
  // Set the reviewer list for this project. Pass [] to clear.
  onSetReviewers: (reviewerIds: string[]) => void;
  onStatusChange: (status: ProjectStatus) => void;
  onArchiveToggle: (archived: boolean) => void;
  onDelete: () => void;
  onNotify: (notifications: Notification[]) => void;
  // Move this project to another workspace. Routed through App.tsx so the
  // toast / undo path is shared with the sidebar-drop flow.
  onMoveToWorkspace: (workspaceId: string) => void;
};

const priorities: Priority[] = ["Urgent", "High", "Normal", "Low"];
const statuses: { value: ProjectStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "paused", label: "Paused" },
];

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function snippetFrom(text: string, max = 80): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export function ProjectDetailModal({
  project,
  designers,
  reviewers,
  workspaces,
  currentDesignerId,
  currentDesignerName,
  onClose,
  onChange,
  onSetReviewers,
  onStatusChange,
  onArchiveToggle,
  onDelete,
  onNotify,
  onMoveToWorkspace,
}: Props) {
  const [newComment, setNewComment] = useState("");
  const [newMilestone, setNewMilestone] = useState("");
  const [editingOverview, setEditingOverview] = useState(false);
  // Local draft of the overview textarea. Binding the textarea directly to
  // `project.overview` caused a cursor-jump bug: each keystroke fires a
  // Firestore write, the live subscription re-emits the project, and
  // between the keystroke and the listener firing, React reconciles the
  // DOM against the stale prop and snaps the caret to the end. Owning the
  // value locally and flushing in parallel keeps the cursor stable.
  const [draftOverview, setDraftOverview] = useState(project.overview);
  // Re-sync the draft from the project ONLY when we (re)enter edit mode, so
  // external changes (a co-editor's update) are picked up next time the
  // user clicks in. Deliberately not depending on project.overview — if the
  // user types two characters faster than the Firestore round-trip, the
  // second keystroke would otherwise get clobbered by the late-arriving
  // first-keystroke snapshot.
  useEffect(() => {
    if (editingOverview) setDraftOverview(project.overview);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingOverview]);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState("");
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Inline edit state for milestones. `id` is the row being edited and
  // `label` is the in-progress text — null means no edit in flight.
  const [editingMilestone, setEditingMilestone] = useState<{
    id: string;
    label: string;
  } | null>(null);

  // Drag state for milestone reordering. We track the dragging row, the row
  // currently being hovered, and which side of that row the cursor is on so
  // the drop indicator can render above or below.
  const [draggingMilestoneId, setDraggingMilestoneId] = useState<string | null>(
    null,
  );
  const [milestoneDropTarget, setMilestoneDropTarget] = useState<{
    id: string;
    position: "before" | "after";
  } | null>(null);

  function clearMilestoneDrag() {
    setDraggingMilestoneId(null);
    setMilestoneDropTarget(null);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function buildNotifications(
    recipients: Designer[],
    kind: "comment" | "milestone",
    text: string,
  ): Notification[] {
    const now = new Date().toISOString();
    return recipients
      .filter((r) => r.id !== currentDesignerId)
      .map((r) => ({
        id: `n-${Date.now()}-${r.id}`,
        workspaceId: project.workspaceId,
        recipientId: r.id,
        fromName: currentDesignerName,
        projectId: project.id,
        kind,
        snippet: snippetFrom(text),
        createdAt: now,
        read: false,
      }));
  }

  function addComment() {
    const text = newComment.trim();
    if (!text) return;
    onChange((p) => ({
      ...p,
      comments: [
        ...p.comments,
        {
          id: `c-${Date.now()}`,
          author: currentDesignerName,
          text,
          createdAt: new Date().toISOString(),
        },
      ],
    }));
    const mentioned = findMentionedDesigners(text, designers);
    if (mentioned.length > 0)
      onNotify(buildNotifications(mentioned, "comment", text));
    setNewComment("");
  }

  function addMilestone() {
    const label = newMilestone.trim();
    if (!label) return;
    onChange((p) => ({
      ...p,
      milestones: [...p.milestones, { id: `m-${Date.now()}`, label, done: false }],
    }));
    const mentioned = findMentionedDesigners(label, designers);
    if (mentioned.length > 0)
      onNotify(buildNotifications(mentioned, "milestone", label));
    setNewMilestone("");
  }

  function toggleMilestone(id: string) {
    onChange((p) => ({
      ...p,
      milestones: p.milestones.map((m) => (m.id === id ? { ...m, done: !m.done } : m)),
    }));
  }

  function removeMilestone(id: string) {
    onChange((p) => ({ ...p, milestones: p.milestones.filter((m) => m.id !== id) }));
  }

  function startEditMilestone(id: string, label: string) {
    setEditingMilestone({ id, label });
  }

  function cancelEditMilestone() {
    setEditingMilestone(null);
  }

  // Commit the in-progress edit. Empty / whitespace-only labels cancel the
  // edit instead of writing an empty string (use "remove" to delete).
  function saveMilestoneEdit() {
    if (!editingMilestone) return;
    const trimmed = editingMilestone.label.trim();
    if (!trimmed) {
      cancelEditMilestone();
      return;
    }
    const { id } = editingMilestone;
    onChange((p) => ({
      ...p,
      milestones: p.milestones.map((m) =>
        m.id === id ? { ...m, label: trimmed } : m,
      ),
    }));
    setEditingMilestone(null);
  }

  // Move milestone `fromId` to sit immediately `position` (before/after) the
  // milestone with `toId`. Same-position drops resolve to no-ops via index
  // comparison after the splice.
  function reorderMilestone(
    fromId: string,
    toId: string,
    position: "before" | "after",
  ) {
    if (fromId === toId) return;
    onChange((p) => {
      const fromIdx = p.milestones.findIndex((m) => m.id === fromId);
      if (fromIdx === -1) return p;
      const next = p.milestones.slice();
      const [moved] = next.splice(fromIdx, 1);
      const toIdx = next.findIndex((m) => m.id === toId);
      if (toIdx === -1) return p;
      const insertAt = position === "after" ? toIdx + 1 : toIdx;
      next.splice(insertAt, 0, moved);
      return { ...p, milestones: next };
    });
  }

  function startEditComment(id: string, text: string) {
    setEditingCommentId(id);
    setEditingCommentText(text);
  }

  function cancelEditComment() {
    setEditingCommentId(null);
    setEditingCommentText("");
  }

  function saveEditComment() {
    const id = editingCommentId;
    if (!id) return;
    const text = editingCommentText.trim();
    if (!text) return;
    const original = project.comments.find((c) => c.id === id);
    onChange((p) => ({
      ...p,
      comments: p.comments.map((c) => (c.id === id ? { ...c, text } : c)),
    }));
    if (original) {
      const newlyMentioned = findNewMentions(original.text, text, designers);
      if (newlyMentioned.length > 0)
        onNotify(buildNotifications(newlyMentioned, "comment", text));
    }
    cancelEditComment();
  }

  function deleteComment(id: string) {
    onChange((p) => ({
      ...p,
      comments: p.comments.filter((c) => c.id !== id && c.parentId !== id),
    }));
    if (editingCommentId === id) cancelEditComment();
    if (replyingToId === id) cancelReply();
  }

  function startReply(parentId: string) {
    setReplyingToId(parentId);
    setReplyText("");
  }

  function cancelReply() {
    setReplyingToId(null);
    setReplyText("");
  }

  function submitReply() {
    const parentId = replyingToId;
    if (!parentId) return;
    const text = replyText.trim();
    if (!text) return;
    const parent = project.comments.find((c) => c.id === parentId);
    const createdAt = new Date().toISOString();
    onChange((p) => ({
      ...p,
      comments: [
        ...p.comments,
        {
          id: `c-${Date.now()}`,
          author: currentDesignerName,
          text,
          createdAt,
          parentId,
        },
      ],
    }));
    const notifs: Notification[] = [];
    if (parent && parent.author !== currentDesignerName) {
      const parentAuthor = designers.find((d) => d.name === parent.author);
      if (parentAuthor && parentAuthor.id !== currentDesignerId) {
        notifs.push({
          id: `n-${Date.now()}-reply-${parentAuthor.id}`,
          workspaceId: project.workspaceId,
          recipientId: parentAuthor.id,
          fromName: currentDesignerName,
          projectId: project.id,
          kind: "reply",
          snippet: snippetFrom(text),
          createdAt,
          read: false,
        });
      }
    }
    const mentioned = findMentionedDesigners(text, designers).filter(
      (d) => !notifs.some((n) => n.recipientId === d.id),
    );
    notifs.push(...buildNotifications(mentioned, "comment", text));
    if (notifs.length > 0) onNotify(notifs);
    cancelReply();
  }

  const topLevelComments = project.comments.filter((c) => !c.parentId);
  const repliesByParent = project.comments.reduce<Map<string, typeof project.comments>>(
    (acc, c) => {
      if (c.parentId) {
        const list = acc.get(c.parentId) ?? [];
        list.push(c);
        acc.set(c.parentId, list);
      }
      return acc;
    },
    new Map(),
  );

  function renderComment(c: typeof project.comments[number], isReply: boolean) {
    const isOwner = c.author === currentDesignerName;
    const isEditing = editingCommentId === c.id;
    const likes = c.likes ?? [];
    const liked = likes.includes(currentDesignerId);
    return (
      <div className={`comment ${isReply ? "is-reply" : ""}`} key={c.id}>
        <div className="comment-head">
          <strong>{c.author}</strong>
          <span className="muted">
            {new Date(c.createdAt).toLocaleString()}
          </span>
        </div>
        {isEditing ? (
          <div className="comment-edit">
            <textarea
              autoFocus
              value={editingCommentText}
              onChange={(e) => setEditingCommentText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  saveEditComment();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  cancelEditComment();
                }
              }}
              rows={3}
            />
            <div className="comment-edit-actions">
              <button
                className="comment-action-btn"
                onClick={cancelEditComment}
              >
                Cancel
              </button>
              <button
                onClick={saveEditComment}
                disabled={!editingCommentText.trim()}
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <>
            <p>
              <LinkifiedText text={c.text} designers={designers} />
            </p>
            <div className="comment-actions">
              <button
                type="button"
                className={`comment-action-btn like-btn ${liked ? "liked" : ""}`}
                onClick={() => toggleLikeComment(c.id)}
                title={liked ? "Unlike" : "Like"}
                aria-label={liked ? "Unlike comment" : "Like comment"}
              >
                <HeartIcon filled={liked} />
                {likes.length > 0 && <span>{likes.length}</span>}
              </button>
              {!isReply && (
                <button
                  type="button"
                  className="comment-action-btn"
                  onClick={() => startReply(c.id)}
                >
                  Reply
                </button>
              )}
              {isOwner && (
                <>
                  <button
                    type="button"
                    className="comment-action-btn"
                    onClick={() => startEditComment(c.id, c.text)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="comment-action-btn danger"
                    onClick={() => deleteComment(c.id)}
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  function toggleLikeComment(commentId: string) {
    const comment = project.comments.find((c) => c.id === commentId);
    if (!comment) return;
    const currentLikes = comment.likes ?? [];
    const wasLiked = currentLikes.includes(currentDesignerId);
    const nextLikes = wasLiked
      ? currentLikes.filter((id) => id !== currentDesignerId)
      : [...currentLikes, currentDesignerId];
    onChange((p) => ({
      ...p,
      comments: p.comments.map((c) =>
        c.id === commentId ? { ...c, likes: nextLikes } : c,
      ),
    }));
    if (!wasLiked && comment.author !== currentDesignerName) {
      const author = designers.find((d) => d.name === comment.author);
      if (author && author.id !== currentDesignerId) {
        onNotify([
          {
            id: `n-${Date.now()}-like-${author.id}`,
            workspaceId: project.workspaceId,
            recipientId: author.id,
            fromName: currentDesignerName,
            projectId: project.id,
            kind: "like",
            snippet: snippetFrom(comment.text),
            createdAt: new Date().toISOString(),
            read: false,
          },
        ]);
      }
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <input
              className="modal-title"
              value={project.title}
              onChange={(e) => onChange((p) => ({ ...p, title: e.target.value }))}
            />
            <div className="modal-sub">
              <select
                value={project.priority}
                onChange={(e) =>
                  onChange((p) => ({ ...p, priority: e.target.value as Priority }))
                }
              >
                {priorities.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <span className="dot" />
              <span>
                {project.source === "outlook"
                  ? "From Outlook"
                  : project.source === "teams"
                    ? "From Teams"
                    : "Manual"}
              </span>
            </div>
          </div>
          <div className="modal-head-actions">
            <select
              className={`status-select status-${project.status ?? "active"}`}
              value={project.status ?? "active"}
              onChange={(e) => onStatusChange(e.target.value as ProjectStatus)}
              aria-label="Project status"
            >
              {statuses.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        </header>

        <div className="modal-body">
          <section className="modal-section">
            <h3>Overview</h3>
            {editingOverview ? (
              <>
                <textarea
                  autoFocus
                  value={draftOverview}
                  onChange={(e) => {
                    const next = e.target.value;
                    setDraftOverview(next);
                    onChange((p) => ({ ...p, overview: next }));
                  }}
                  onBlur={() => setEditingOverview(false)}
                  rows={3}
                />
                <p className="field-hint">
                  Tip: type <code>cargowise.com</code> or paste a URL — links
                  are detected automatically. Use <code>[label](url)</code> for
                  a named link.
                </p>
              </>
            ) : (
              <div
                className="overview-view"
                role="button"
                tabIndex={0}
                onClick={() => setEditingOverview(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setEditingOverview(true);
                  }
                }}
                title="Click to edit"
              >
                {project.overview ? (
                  <LinkifiedText text={project.overview} designers={designers} />
                ) : (
                  <span className="muted">
                    Click to add an overview — paste URLs or use [label](url).
                  </span>
                )}
              </div>
            )}
          </section>

          <section className="modal-grid">
            <Field label="Client">
              <input
                value={project.client}
                onChange={(e) => onChange((p) => ({ ...p, client: e.target.value }))}
              />
            </Field>
            <Field label="Commenced">
              <input
                type="date"
                value={project.createdAt ? project.createdAt.slice(0, 10) : ""}
                onChange={(e) => {
                  const v = e.target.value;
                  onChange((p) => ({
                    ...p,
                    createdAt: v ? new Date(`${v}T00:00:00Z`).toISOString() : p.createdAt,
                  }));
                }}
              />
            </Field>
            <Field label="Due date">
              <input
                type="date"
                value={project.dueDate}
                onChange={(e) => onChange((p) => ({ ...p, dueDate: e.target.value }))}
              />
            </Field>
            <Field label="Brand">
              <select
                value={project.brand}
                onChange={(e) => onChange((p) => ({ ...p, brand: e.target.value }))}
              >
                <option value="">Select a brand…</option>
                {BRANDS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Content type">
              <ContentTypeField
                value={project.contentType}
                onChange={(next) =>
                  onChange((p) => ({ ...p, contentType: next }))
                }
              />
            </Field>
            <Field label="Assignees">
              <AssigneePicker
                designers={designers}
                assigneeIds={project.assigneeIds}
                onChange={(ids) =>
                  onChange((p) => ({ ...p, assigneeIds: ids }))
                }
              />
            </Field>
            <Field label="Reviewers">
              {reviewers.length === 0 ? (
                <p className="muted small" style={{ margin: 0 }}>
                  No reviewers yet. Mark someone as a reviewer in Settings
                  to make them pickable here.
                </p>
              ) : (
                <div className="assignee-picker">
                  {reviewers.map((d) => {
                    const reviewerIds = project.reviewerIds ?? [];
                    const active = reviewerIds.includes(d.id);
                    return (
                      <button
                        type="button"
                        key={d.id}
                        className={`assignee-chip ${active ? "active" : ""}`}
                        onClick={() => {
                          const next = active
                            ? reviewerIds.filter((id) => id !== d.id)
                            : [...reviewerIds, d.id];
                          onSetReviewers(next);
                        }}
                        title={
                          active
                            ? `Remove ${d.name} as reviewer`
                            : `Ask ${d.name} to review`
                        }
                      >
                        <Avatar
                          designer={d}
                          className="dot-avatar assignee-chip-avatar"
                        />
                        <span>{d.name.split(" ")[0]}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </Field>
            <Field label="Brief">
              <input
                placeholder="https://…"
                value={project.briefUrl}
                onChange={(e) => onChange((p) => ({ ...p, briefUrl: e.target.value }))}
              />
              {project.briefUrl && (
                <a className="brief-link" href={project.briefUrl} target="_blank" rel="noreferrer">
                  Open brief ↗
                </a>
              )}
            </Field>
            <Field label="Team">
              <select
                value={project.workspaceId}
                onChange={(e) => {
                  if (e.target.value !== project.workspaceId) {
                    onMoveToWorkspace(e.target.value);
                  }
                }}
                aria-label="Move project to another team"
              >
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </Field>
          </section>

          <section className="modal-section">
            <h3>Tasks</h3>
            <ul className="milestones">
              {project.milestones.map((m) => {
                const isDragging = draggingMilestoneId === m.id;
                const isDropTarget =
                  milestoneDropTarget?.id === m.id &&
                  draggingMilestoneId !== null &&
                  draggingMilestoneId !== m.id;
                const dropPos = isDropTarget
                  ? milestoneDropTarget.position
                  : null;
                return (
                  <li
                    key={m.id}
                    className={[
                      isDragging ? "milestone-dragging" : "",
                      dropPos === "before" ? "milestone-drop-before" : "",
                      dropPos === "after" ? "milestone-drop-after" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onDragOver={(e) => {
                      if (!draggingMilestoneId || draggingMilestoneId === m.id)
                        return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      const rect = e.currentTarget.getBoundingClientRect();
                      const position =
                        e.clientY < rect.top + rect.height / 2
                          ? "before"
                          : "after";
                      setMilestoneDropTarget((cur) =>
                        cur?.id === m.id && cur.position === position
                          ? cur
                          : { id: m.id, position },
                      );
                    }}
                    onDragLeave={(e) => {
                      // Only clear if we're leaving the row entirely, not
                      // bouncing between child elements.
                      const next = e.relatedTarget as Node | null;
                      if (next && e.currentTarget.contains(next)) return;
                      setMilestoneDropTarget((cur) =>
                        cur?.id === m.id ? null : cur,
                      );
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (
                        draggingMilestoneId &&
                        milestoneDropTarget &&
                        milestoneDropTarget.id === m.id
                      ) {
                        reorderMilestone(
                          draggingMilestoneId,
                          milestoneDropTarget.id,
                          milestoneDropTarget.position,
                        );
                      }
                      clearMilestoneDrag();
                    }}
                  >
                    <span
                      className="milestone-handle"
                      draggable
                      onDragStart={(e) => {
                        setDraggingMilestoneId(m.id);
                        // Set some payload so the browser actually starts a
                        // drag. Used only as a side-effect — drop logic reads
                        // component state.
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", m.id);
                      }}
                      onDragEnd={clearMilestoneDrag}
                      title="Drag to reorder"
                      aria-label="Drag to reorder task"
                    >
                      ⋮⋮
                    </span>
                    <label>
                      <input
                        type="checkbox"
                        checked={m.done}
                        onChange={() => toggleMilestone(m.id)}
                      />
                      {editingMilestone?.id === m.id ? (
                        <input
                          className="milestone-edit-input"
                          autoFocus
                          value={editingMilestone.label}
                          onChange={(e) =>
                            setEditingMilestone({
                              id: m.id,
                              label: e.target.value,
                            })
                          }
                          onBlur={saveMilestoneEdit}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              saveMilestoneEdit();
                            } else if (e.key === "Escape") {
                              e.preventDefault();
                              cancelEditMilestone();
                            }
                          }}
                        />
                      ) : (
                        <span className={m.done ? "done" : ""}>
                          <LinkifiedText text={m.label} designers={designers} />
                        </span>
                      )}
                    </label>
                    <div className="milestone-actions">
                      {editingMilestone?.id !== m.id && (
                        <button
                          className="link-btn"
                          onClick={() => startEditMilestone(m.id, m.label)}
                        >
                          edit
                        </button>
                      )}
                      <button
                        className="link-btn"
                        onClick={() => removeMilestone(m.id)}
                      >
                        remove
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="row">
              <input
                placeholder="Add a milestone…"
                value={newMilestone}
                onChange={(e) => setNewMilestone(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addMilestone()}
              />
              <button onClick={addMilestone}>Add</button>
            </div>
          </section>

          <section className="modal-section">
            <h3>Comments</h3>
            <div className="comments">
              {topLevelComments.length === 0 && (
                <p className="muted">No comments yet — start the thread below.</p>
              )}
              {topLevelComments.map((c) => (
                <div key={c.id} className="comment-thread">
                  {renderComment(c, false)}
                  {repliesByParent.get(c.id)?.map((r) => renderComment(r, true))}
                  {replyingToId === c.id && (
                    <div className="comment-reply-form">
                      <textarea
                        autoFocus
                        placeholder={`Reply as ${currentDesignerName}…`}
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault();
                            submitReply();
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            cancelReply();
                          }
                        }}
                        rows={2}
                      />
                      <div className="comment-edit-actions">
                        <button
                          className="comment-action-btn"
                          onClick={cancelReply}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={submitReply}
                          disabled={!replyText.trim()}
                        >
                          Reply
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="row">
              <input
                placeholder={`Comment as ${currentDesignerName}…`}
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addComment()}
              />
              <button onClick={addComment}>Send</button>
            </div>
          </section>
        </div>

        <footer className="modal-foot">
          {confirmingDelete ? (
            <>
              <span className="delete-confirm-prompt">
                Delete this project? It can't be undone.
              </span>
              <button onClick={() => setConfirmingDelete(false)}>Cancel</button>
              <button className="danger" onClick={onDelete}>
                Yes, delete
              </button>
            </>
          ) : (
            <>
              <button
                className="danger"
                onClick={() => setConfirmingDelete(true)}
              >
                Delete project
              </button>
              <button onClick={() => onArchiveToggle(!project.archived)}>
                {project.archived ? "Unarchive" : "Archive"}
              </button>
              <button onClick={onClose}>Done</button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
