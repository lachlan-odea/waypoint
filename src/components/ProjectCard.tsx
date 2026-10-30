import { useState } from "react";
import type { Campaign, Designer, Project } from "../types";
import { Avatar } from "./Avatar";
import { writeDraggedProjectId } from "../dnd";
import { brandColor } from "../constants";

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
  // Marketing campaigns this project contributes to, shown as a small
  // flag line so the wider effort is visible from the board.
  campaigns?: Campaign[];
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
  campaigns,
}: Props) {
  const assignees = project.assigneeIds
    .map((id) => designers.find((d) => d.id === id))
    .filter((d): d is Designer => Boolean(d));
  const visibleAssignees = assignees.slice(0, MAX_VISIBLE_ASSIGNEES);
  const extraAssignees = assignees.length - visibleAssignees.length;
  const doneCount = project.milestones.filter((m) => m.done).length;
  const nextMilestone = project.milestones.find((m) => !m.done);
  const [dragging, setDragging] = useState(false);
  // Only live work can be overdue. Completed and archived projects keep a
  // neutral due date so the column doesn't scream at finished items, and
  // Planning is the same case from the other end — a date on unstarted work
  // is a target, not a miss.
  const overdue =
    isPastDue(project.dueDate) &&
    project.status !== "completed" &&
    project.status !== "cancelled" &&
    project.status !== "planning" &&
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
      {campaigns && campaigns.length > 0 && (
        <span
          className="card-campaigns"
          title={`Campaign${campaigns.length === 1 ? "" : "s"}: ${campaigns
            .map((c) => c.name)
            .join(", ")}`}
        >
          {campaigns.slice(0, 2).map((c) => (
            <span
              key={c.id}
              className="card-campaign"
              style={{ color: c.color || brandColor(c.brand || "No brand") }}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="currentColor"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M4 22V4a1 1 0 0 1 1-1h12l-2 4 2 4H5" />
              </svg>
              {c.name}
            </span>
          ))}
          {campaigns.length > 2 && (
            <span className="card-campaign more">+{campaigns.length - 2}</span>
          )}
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
        <div
          className="card-mstrip-row"
          role="img"
          aria-label={`${doneCount} of ${project.milestones.length} tasks done`}
          title={`${doneCount} of ${project.milestones.length} tasks done`}
        >
          {/* One segment per task, like the webinar cards' section strip. */}
          <div
            className="card-mstrip"
            style={{ gridTemplateColumns: `repeat(${project.milestones.length}, 1fr)` }}
          >
            {project.milestones.map((m) => (
              <i key={m.id} className={m.done ? "done" : ""} />
            ))}
          </div>
          <span className="card-mstrip-count">
            {doneCount}/{project.milestones.length}
          </span>
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
