import { useEffect, useState } from "react";
import type { Designer, Priority, Project } from "../types";
import { BRANDS } from "../constants";
import { ProductAreaField } from "./ProductAreaField";

type Props = {
  designers: Designer[];
  defaultAssigneeId: string | null;
  initial?: Partial<Project>;
  onCancel: () => void;
  onCreate: (project: Project) => void;
};

const priorities: Priority[] = ["Urgent", "High", "Normal", "Low"];

export function CreateProjectModal({
  designers,
  defaultAssigneeId,
  initial,
  onCancel,
  onCreate,
}: Props) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [overview, setOverview] = useState(initial?.overview ?? "");
  const [client, setClient] = useState(initial?.client ?? "");
  const [brand, setBrand] = useState(initial?.brand ?? "");
  const [productArea, setProductArea] = useState(initial?.productArea ?? "");
  const [briefUrl, setBriefUrl] = useState(initial?.briefUrl ?? "");
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? "");
  const [priority, setPriority] = useState<Priority>(initial?.priority ?? "Normal");
  const [assigneeId, setAssigneeId] = useState<string | null>(
    initial?.assigneeId ?? defaultAssigneeId
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  function submit() {
    if (!title.trim()) return;
    const project: Project = {
      id: initial?.id ?? `p-${Date.now()}`,
      title: title.trim(),
      overview,
      client,
      brand,
      productArea,
      briefUrl,
      dueDate,
      priority,
      assigneeId,
      milestones: initial?.milestones ?? [],
      comments: initial?.comments ?? [],
      createdAt: initial?.createdAt ?? new Date().toISOString(),
      source: initial?.source ?? "manual",
    };
    onCreate(project);
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2 className="modal-title-static">New project</h2>
          <button className="icon-btn" onClick={onCancel} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="modal-body">
          <label className="field">
            <span>Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </label>
          <label className="field">
            <span>Overview</span>
            <textarea value={overview} onChange={(e) => setOverview(e.target.value)} rows={3} />
          </label>
          <div className="modal-grid">
            <label className="field">
              <span>Client</span>
              <input value={client} onChange={(e) => setClient(e.target.value)} />
            </label>
            <label className="field">
              <span>Due date</span>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>
            <label className="field">
              <span>Priority</span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
              >
                {priorities.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Brand</span>
              <select value={brand} onChange={(e) => setBrand(e.target.value)}>
                <option value="">Select a brand…</option>
                {BRANDS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Product area</span>
              <ProductAreaField value={productArea} onChange={setProductArea} />
            </label>
            <label className="field">
              <span>Brief URL</span>
              <input
                value={briefUrl}
                onChange={(e) => setBriefUrl(e.target.value)}
                placeholder="https://…"
              />
            </label>
            <label className="field">
              <span>Assign to</span>
              <select
                value={assigneeId ?? ""}
                onChange={(e) => setAssigneeId(e.target.value || null)}
              >
                <option value="">Unassigned</option>
                {designers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <footer className="modal-foot">
          <button onClick={onCancel}>Cancel</button>
          <button className="primary" onClick={submit} disabled={!title.trim()}>
            Create project
          </button>
        </footer>
      </div>
    </div>
  );
}
