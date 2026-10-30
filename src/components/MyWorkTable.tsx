import type { Campaign, Designer, Project, ProjectStatus, Workspace } from "../types";
import { PROJECT_STATUSES, projectStatusLabel } from "../constants";
import { projectContentTypes } from "../contentTypes";
import { formatShort, todayIso } from "../dates";
import { priorityClassName } from "../statusTone";
import { Avatar } from "./Avatar";

// My work as a table: one dense row per project, every status, so the most
// information fits on screen at once. The status can be changed in place;
// the row opens the project.

type Props = {
  projects: Project[];
  designers: Designer[];
  workspaces: Workspace[];
  campaignsByProject: Map<string, Campaign[]>;
  onOpen: (projectId: string) => void;
  onStatusChange: (projectId: string, status: ProjectStatus) => void;
  onOpenCampaign: (campaignId: string) => void;
};

export function MyWorkTable({ projects, designers, workspaces, campaignsByProject, onOpen, onStatusChange, onOpenCampaign }: Props) {
  const today = todayIso();
  if (projects.length === 0) {
    return <p className="muted">Nothing assigned to you yet.</p>;
  }
  return (
    <div className="mywork-table-wrap">
      <table className="mywork-table">
        <thead>
          <tr>
            <th>Priority</th>
            <th>Project</th>
            <th>Team</th>
            <th>Brand</th>
            <th>Status</th>
            <th>Due</th>
            <th>Tasks</th>
            <th>Next</th>
            <th>With</th>
            <th>Campaigns</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => {
            const status = p.status ?? "active";
            const closed = status === "completed" || status === "cancelled";
            const overdue = !!p.dueDate && p.dueDate < today && !closed && status !== "planning";
            const done = p.milestones.filter((m) => m.done).length;
            const next = p.milestones.find((m) => !m.done);
            const team = workspaces.find((w) => w.id === p.workspaceId)?.name ?? p.workspaceId;
            const people = p.assigneeIds.map((id) => designers.find((d) => d.id === id)).filter((d): d is Designer => !!d);
            const camps = campaignsByProject.get(p.id) ?? [];
            const types = projectContentTypes(p);
            const open = () => onOpen(p.id);
            return (
              <tr key={p.id} className={closed ? "closed" : ""}>
                <td onClick={open}>
                  <span className={`priority-badge ${priorityClassName(p.priority)}`}>{p.priority}</span>
                </td>
                <td className="mywork-title" onClick={open}>
                  <button type="button" className="link-btn mywork-open" onClick={open}>
                    {p.title || "Untitled project"}
                  </button>
                  <span className="mywork-sub">
                    {[p.client, types.join(", ")].filter(Boolean).join(" · ")}
                  </span>
                </td>
                <td className="mono" onClick={open}>
                  {team}
                </td>
                <td className="mono" onClick={open}>
                  {p.brand || "—"}
                </td>
                <td>
                  <select
                    className={`status-select status-${status}`}
                    value={status}
                    aria-label={`Status of ${p.title}`}
                    title={projectStatusLabel(status)}
                    onChange={(e) => onStatusChange(p.id, e.target.value as ProjectStatus)}
                  >
                    {PROJECT_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className={`mono ${overdue ? "late" : ""}`} onClick={open}>
                  {p.dueDate ? formatShort(p.dueDate) : "—"}
                  {overdue && <span className="mywork-late">overdue</span>}
                </td>
                <td onClick={open}>
                  {p.milestones.length ? (
                    <span className="card-mstrip-row mywork-strip" title={`${done} of ${p.milestones.length} tasks done`}>
                      <span className="card-mstrip" style={{ gridTemplateColumns: `repeat(${p.milestones.length}, 1fr)` }}>
                        {p.milestones.map((m) => (
                          <i key={m.id} className={m.done ? "done" : ""} />
                        ))}
                      </span>
                      <span className="card-mstrip-count">
                        {done}/{p.milestones.length}
                      </span>
                    </span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td className="mywork-next" onClick={open}>
                  {next ? next.label : p.milestones.length ? <span className="muted">All done</span> : <span className="muted">—</span>}
                </td>
                <td onClick={open}>
                  <span className="mywork-people">
                    {people.slice(0, 4).map((d) => (
                      <Avatar key={d.id} designer={d} size={22} />
                    ))}
                    {people.length > 4 && <span className="card-assignee-extra">+{people.length - 4}</span>}
                  </span>
                </td>
                <td>
                  {camps.length ? (
                    <span className="mywork-camps">
                      {camps.slice(0, 2).map((c) => (
                        <button key={c.id} type="button" className="link-btn" onClick={() => onOpenCampaign(c.id)} title={c.name}>
                          {c.name}
                        </button>
                      ))}
                      {camps.length > 2 && <span className="muted">+{camps.length - 2}</span>}
                    </span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
