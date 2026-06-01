import { useState } from "react";
import type { Designer, Project } from "../types";
import { Avatar } from "./Avatar";
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

const MAX_VISIBLE_ASSIGNEES = 3;

export function ProjectCard({ project, designers, onClick, compact }: Props) {
  const assignees = project.assigneeIds
    .map((id) => designers.find((d) => d.id === id))
    .filter((d): d is Designer => Boolean(d));
  const visibleAssignees = assignees.slice(0, MAX_VISIBLE_ASSIGNEES);
  const extraAssignees = assignees.length - visibleAssignees.length;
  const doneCount = project.milestones.filter((m) => m.done).length;
  const nextMilestone = project.milestones.find((m) => !m.done);
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
      <p className="card-client">{project.client}</p>
      {nextMilestone && (
        <p className="card-next-milestone" title={nextMilestone.label}>
          <span className="card-next-milestone-dot" aria-hidden />
          Next: {nextMilestone.label}
        </p>
      )}
      <div className="card-row card-foot">
        <span className="card-brand">{project.brand}</span>
        {assignees.length > 0 && (
          <span className="card-assignees" title={assignees.map((a) => a.name).join(", ")}>
            {visibleAssignees.map((a) => (
              <Avatar key={a.id} designer={a} className="card-assignee" />
            ))}
            {extraAssignees > 0 && (
              <span className="card-assignee-extra">+{extraAssignees}</span>
            )}
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
      {project.flaggedForReview && (
        <span className="flag-indicator" title="Flagged for review">
          <span className="flag-dot" aria-hidden />
          <span>For review</span>
        </span>
      )}
    </button>
  );
}
