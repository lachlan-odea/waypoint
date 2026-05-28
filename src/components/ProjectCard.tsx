import { useState } from "react";
import type { Designer, Project } from "../types";
import { writeDraggedProjectId } from "../dnd";

type Props = {
  project: Project;
  designers: Designer[];
  onClick: () => void;
  compact?: boolean;
};

const priorityClass: Record<string, string> = {
  Urgent: "card-priority urgent",
  High: "card-priority high",
  Normal: "card-priority normal",
  Low: "card-priority low",
};

function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ProjectCard({ project, designers, onClick, compact }: Props) {
  const assignee = designers.find((d) => d.id === project.assigneeId);
  const doneCount = project.milestones.filter((m) => m.done).length;
  const [dragging, setDragging] = useState(false);
  return (
    <button
      className={`project-card ${compact ? "compact" : ""} ${dragging ? "dragging" : ""}`}
      onClick={onClick}
      draggable
      onDragStart={(e) => {
        writeDraggedProjectId(e, project.id);
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
    >
      <div className="card-row">
        <span className={priorityClass[project.priority]}>{project.priority}</span>
        <span className="card-due">Due {formatDate(project.dueDate)}</span>
      </div>
      <h4 className="card-title">{project.title}</h4>
      {!compact && <p className="card-client">{project.client}</p>}
      <div className="card-row card-foot">
        <span className="card-brand">{project.brand}</span>
        {assignee && (
          <span className="card-assignee" style={{ background: assignee.color }} title={assignee.name}>
            {assignee.initials}
          </span>
        )}
      </div>
      {project.milestones.length > 0 && (
        <div className="card-progress">
          <div
            className="card-progress-bar"
            style={{ width: `${(doneCount / project.milestones.length) * 100}%` }}
          />
        </div>
      )}
    </button>
  );
}
