import { useEffect, useState } from "react";
import type {
  Designer,
  Notification,
  Project,
  Priority,
  ProjectStatus,
} from "../types";
import { BRANDS } from "../constants";
import { ContentTypeField } from "./ContentTypeField";
import { LinkifiedText } from "./LinkifiedText";
import { findMentionedDesigners, findNewMentions } from "../mentions";
import { Avatar } from "./Avatar";

type Props = {
  project: Project;
  designers: Designer[];
  currentDesignerId: string;
  currentDesignerName: string;
  onClose: () => void;
  onChange: (updater: (p: Project) => Project) => void;
  onFlagForReview: (flagged: boolean) => void;
  onStatusChange: (status: ProjectStatus) => void;
  onArchiveToggle: (archived: boolean) => void;
  onDelete: () => void;
  onNotify: (notifications: Notification[]) => void;
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
  currentDesignerId,
  currentDesignerName,
  onClose,
  onChange,
  onFlagForReview,
  onStatusChange,
  onArchiveToggle,
  onDelete,
  onNotify,
}: Props) {
  const [newComment, setNewComment] = useState("");
  const [newMilestone, setNewMilestone] = useState("");
  const [editingOverview, setEditingOverview] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState("");
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

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
              <span>{project.source === "outlook" ? "From Outlook" : "Manual"}</span>
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
                  value={project.overview}
                  onChange={(e) =>
                    onChange((p) => ({ ...p, overview: e.target.value }))
                  }
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
              <div className="assignee-picker">
                {designers.map((d) => {
                  const active = project.assigneeIds.includes(d.id);
                  return (
                    <button
                      type="button"
                      key={d.id}
                      className={`assignee-chip ${active ? "active" : ""}`}
                      onClick={() => {
                        const next = active
                          ? project.assigneeIds.filter((id) => id !== d.id)
                          : [...project.assigneeIds, d.id];
                        onChange((p) => ({ ...p, assigneeIds: next }));
                      }}
                      title={active ? `Remove ${d.name}` : `Add ${d.name}`}
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
            </Field>
            <Field label="Review">
              {project.flaggedForReview ? (
                <button
                  type="button"
                  className="flag-btn flagged"
                  onClick={() => onFlagForReview(false)}
                  title="Flagged for review. Click to clear."
                >
                  <span className="flag-dot" aria-hidden />
                  <span>For review · click to clear</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="flag-btn"
                  onClick={() => onFlagForReview(true)}
                >
                  <span className="flag-dot" aria-hidden />
                  <span>Flag for review</span>
                </button>
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
          </section>

          <section className="modal-section">
            <h3>Milestones</h3>
            <ul className="milestones">
              {project.milestones.map((m) => (
                <li key={m.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={m.done}
                      onChange={() => toggleMilestone(m.id)}
                    />
                    <span className={m.done ? "done" : ""}>
                      <LinkifiedText text={m.label} designers={designers} />
                    </span>
                  </label>
                  <button className="link-btn" onClick={() => removeMilestone(m.id)}>
                    remove
                  </button>
                </li>
              ))}
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
