import { useEffect, useMemo, useState } from "react";
import type { Designer, Priority, Project, Workspace } from "../types";
import { BRANDS } from "../constants";
import { ContentTypeField } from "./ContentTypeField";
import { projectContentTypes } from "../contentTypes";
import { AssigneePicker } from "./AssigneePicker";

type Props = {
  designers: Designer[];
  // Teams the project can be filed under.
  workspaces: Workspace[];
  // Pre-selected team. Normally whichever board you were looking at when you
  // hit New project.
  defaultWorkspaceId: string;
  defaultAssigneeId: string | null;
  initial?: Partial<Project>;
  // Content types on offer, from Settings → Category types & social tags.
  contentTypeOptions: readonly string[];
  onCancel: () => void;
  onCreate: (project: Project) => void;
};

const priorities: Priority[] = ["Urgent", "High", "Normal", "Low"];

export function CreateProjectModal({
  designers,
  workspaces,
  defaultWorkspaceId,
  defaultAssigneeId,
  initial,
  contentTypeOptions,
  onCancel,
  onCreate,
}: Props) {
  // An Outlook-supplied payload can name its own team; otherwise fall back to
  // the board in view, and only then to the first team that exists.
  const [workspaceId, setWorkspaceId] = useState(
    () =>
      initial?.workspaceId ??
      defaultWorkspaceId ??
      workspaces[0]?.id ??
      "",
  );
  const [title, setTitle] = useState(initial?.title ?? "");
  const [overview, setOverview] = useState(initial?.overview ?? "");
  const [client, setClient] = useState(initial?.client ?? "");
  const [brand, setBrand] = useState(initial?.brand ?? "");
  const [contentTypes, setContentTypes] = useState<string[]>(() =>
    projectContentTypes(initial ?? {}),
  );
  const [briefUrl, setBriefUrl] = useState(initial?.briefUrl ?? "");
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? "");
  const [priority, setPriority] = useState<Priority>(initial?.priority ?? "Normal");
  const [assigneeIds, setAssigneeIds] = useState<string[]>(() => {
    if (initial?.assigneeIds && initial.assigneeIds.length > 0)
      return initial.assigneeIds;
    return defaultAssigneeId ? [defaultAssigneeId] : [];
  });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const selectedWorkspace = workspaces.find((w) => w.id === workspaceId);

  // Anyone can be assigned to a project regardless of team, but only a team's
  // members get a column on its board — so an assignee who isn't a member
  // would file the project somewhere they can't see it. Worth saying out loud
  // now that the team is selectable; a team with no explicit members is open
  // to everyone and can't trip this.
  const outsiders = useMemo(() => {
    const members = selectedWorkspace?.memberIds ?? [];
    if (members.length === 0) return [];
    return assigneeIds
      .filter((id) => !members.includes(id))
      .map((id) => designers.find((d) => d.id === id)?.name)
      .filter((n): n is string => !!n);
  }, [selectedWorkspace, assigneeIds, designers]);

  function submit() {
    if (!title.trim()) return;
    const project: Project = {
      id: initial?.id ?? `p-${Date.now()}`,
      workspaceId,
      title: title.trim(),
      overview,
      client,
      brand,
      contentTypes,
      briefUrl,
      dueDate,
      priority,
      assigneeIds,
      milestones: initial?.milestones ?? [],
      comments: initial?.comments ?? [],
      createdAt: initial?.createdAt ?? new Date().toISOString(),
      source: initial?.source ?? "manual",
    };
    onCreate(project);
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
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
              <span>Content type</span>
              <ContentTypeField
                value={contentTypes}
                onChange={setContentTypes}
                options={contentTypeOptions}
              />
            </label>
            <label className="field">
              <span>Team</span>
              <select
                value={workspaceId}
                onChange={(e) => setWorkspaceId(e.target.value)}
              >
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
              <span className="field-hint">
                Whose board this lands on. Movable later from the project.
              </span>
            </label>
            <label className="field" style={{ gridColumn: "1 / -1" }}>
              <span>URL</span>
              <input
                value={briefUrl}
                onChange={(e) => setBriefUrl(e.target.value)}
                placeholder="https://…"
              />
            </label>
            <label className="field" style={{ gridColumn: "1 / -1" }}>
              <span>Assignees</span>
              <AssigneePicker
                designers={designers}
                assigneeIds={assigneeIds}
                onChange={setAssigneeIds}
              />
              {outsiders.length > 0 && selectedWorkspace && (
                <span className="field-hint warn">
                  {outsiders.join(", ")}{" "}
                  {outsiders.length === 1 ? "isn't" : "aren't"} in{" "}
                  {selectedWorkspace.name}, so they won't get a column on that
                  board. The project still appears in their My work.
                </span>
              )}
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
