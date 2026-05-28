import { useEffect, useState } from "react";
import type { Designer, Project, Priority } from "../types";
import { BRANDS } from "../constants";
import { ProductAreaField } from "./ProductAreaField";

type Props = {
  project: Project;
  designers: Designer[];
  currentDesignerName: string;
  onClose: () => void;
  onChange: (updater: (p: Project) => Project) => void;
  onDelete: () => void;
};

const priorities: Priority[] = ["Urgent", "High", "Normal", "Low"];

export function ProjectDetailModal({
  project,
  designers,
  currentDesignerName,
  onClose,
  onChange,
  onDelete,
}: Props) {
  const [newComment, setNewComment] = useState("");
  const [newMilestone, setNewMilestone] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
    setNewComment("");
  }

  function addMilestone() {
    const label = newMilestone.trim();
    if (!label) return;
    onChange((p) => ({
      ...p,
      milestones: [...p.milestones, { id: `m-${Date.now()}`, label, done: false }],
    }));
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
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="modal-body">
          <section className="modal-section">
            <h3>Overview</h3>
            <textarea
              value={project.overview}
              onChange={(e) => onChange((p) => ({ ...p, overview: e.target.value }))}
              rows={3}
            />
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
            <Field label="Product area">
              <ProductAreaField
                value={project.productArea}
                onChange={(next) =>
                  onChange((p) => ({ ...p, productArea: next }))
                }
              />
            </Field>
            <Field label="Assignee">
              <select
                value={project.assigneeId ?? ""}
                onChange={(e) =>
                  onChange((p) => ({ ...p, assigneeId: e.target.value || null }))
                }
              >
                <option value="">Unassigned</option>
                {designers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
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
                    <span className={m.done ? "done" : ""}>{m.label}</span>
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
              {project.comments.length === 0 && (
                <p className="muted">No comments yet — start the thread below.</p>
              )}
              {project.comments.map((c) => (
                <div className="comment" key={c.id}>
                  <div className="comment-head">
                    <strong>{c.author}</strong>
                    <span className="muted">
                      {new Date(c.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p>{c.text}</p>
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
          <button className="danger" onClick={onDelete}>
            Delete project
          </button>
          <button onClick={onClose}>Done</button>
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
