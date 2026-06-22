import { useState } from "react";
import type { Designer, Project } from "../types";
import { Avatar } from "./Avatar";
import { writeDraggedProjectId } from "../dnd";

type Props = {
  project: Project;
  designers: Designer[];
  onClick: () => void;
  compact?: boolean;
  // Optional team-origin label. Set when this card is rendered in a
  // section (e.g. "My work") that shows projects from a different team
  // than the one currently being viewed, so the cross-team origin is
  // visible at a glance.
  teamBadge?: string;
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

// True if `iso` (a YYYY-MM-DD due date) is strictly before today in local
// time. An empty / invalid date is not overdue.
function isPastDue(iso: string): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d.getTime() < today.getTime();
}

const MAX_VISIBLE_ASSIGNEES = 3;

export function ProjectCard({
  project,
  designers,
  onClick,
  compact,
  teamBadge,
}: Props) {
  const assignees = project.assigneeIds
    .map((id) => designers.find((d) => d.id === id))
    .filter((d): d is Designer => Boolean(d));
  const visibleAssignees = assignees.slice(0, MAX_VISIBLE_ASSIGNEES);
  const extraAssignees = assignees.length - visibleAssignees.length;
  const doneCount = project.milestones.filter((m) => m.done).length;
  const nextMilestone = project.milestones.find((m) => !m.done);
  const [dragging, setDragging] = useState(false);
  // Only living work can be overdue — completed and archived projects keep a
  // neutral due date so the column doesn't scream at finished items.
  const overdue =
    isPastDue(project.dueDate) &&
    project.status !== "completed" &&
    !project.archived;
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
        <span className={`card-due ${overdue ? "overdue" : ""}`}>
          {overdue && <span className="card-overdue-chip">Overdue</span>}
          Due {formatDate(project.dueDate)}
        </span>
      </div>
      <h4 className="card-title">{project.title}</h4>
      <p className="card-client">{project.client}</p>
      {teamBadge && (
        <span className="card-team-badge" title={`Team: ${teamBadge}`}>
          {teamBadge}
        </span>
      )}
      {nextMilestone && (
        <p className="card-next-milestone" title={nextMilestone.label}>
          <span className="card-next-milestone-dot" aria-hidden />
          <span className="card-next-milestone-label">
            Next: {nextMilestone.label}
          </span>
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
      {(project.reviewerIds?.length ?? 0) > 0 && (
        <span className="flag-indicator" title="Flagged for review">
          <span className="flag-dot" aria-hidden />
          <span>For review</span>
        </span>
      )}
    </button>
  );
}
