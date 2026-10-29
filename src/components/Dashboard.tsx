import { useMemo } from "react";
import type { Project, WorkspaceData } from "../types";
import { ProjectCard } from "./ProjectCard";
import { Avatar } from "./Avatar";
import { projectStatusLabel } from "../constants";
import { projectStatusTone } from "../statusTone";

interface DashboardProps {
  workspace: WorkspaceData;
  currentDesignerId: string;
  onOpenProject: (id: string) => void;
}

const PRIORITY_ORDER: Record<string, number> = {
  Urgent: 0,
  High: 1,
  Normal: 2,
  Low: 3,
};

function sortByPriorityThenDue(a: Project, b: Project): number {
  const dp = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  if (dp !== 0) return dp;
  return (a.dueDate || "9999").localeCompare(b.dueDate || "9999");
}

export function Dashboard({ workspace, currentDesignerId, onOpenProject }: DashboardProps) {
  const allActiveProjects = useMemo(
    () =>
      workspace.projects.filter(
        (p) => (p.status ?? "active") === "active" && !p.archived
      ),
    [workspace.projects]
  );

  const myProjects = useMemo(
    () =>
      allActiveProjects
        .filter((p) => p.assigneeIds.includes(currentDesignerId))
        .sort(sortByPriorityThenDue),
    [allActiveProjects, currentDesignerId]
  );

  const recentProjects = useMemo(
    () => allActiveProjects.sort(sortByPriorityThenDue).slice(0, 8),
    [allActiveProjects]
  );

  const overdueTasks = useMemo(
    () => {
      const today = new Date().toISOString().split("T")[0];
      return allActiveProjects
        .filter((p) => p.dueDate && p.dueDate < today)
        .sort(sortByPriorityThenDue)
        .slice(0, 5);
    },
    [allActiveProjects]
  );

  const completedCount = workspace.projects.filter(
    (p) => p.status === "completed"
  ).length;
  const pausedCount = workspace.projects.filter(
    (p) => p.status === "paused"
  ).length;
  const planningCount = workspace.projects.filter(
    (p) => p.status === "planning"
  ).length;
  const activeCount = allActiveProjects.length;

  const recentActivity = useMemo(() => {
    return allActiveProjects.sort((a, b) => {
      const aDate = a.dueDate || "";
      const bDate = b.dueDate || "";
      return bDate.localeCompare(aDate);
    }).slice(0, 10);
  }, [allActiveProjects]);

  const upcomingDeadlines = useMemo(() => {
    const today = new Date();
    const twoWeeksOut = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    const todayStr = today.toISOString().split("T")[0];

    return allActiveProjects
      .filter((p) => p.dueDate && p.dueDate >= todayStr && p.dueDate <= twoWeeksOut)
      .sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""))
      .slice(0, 6);
  }, [allActiveProjects]);

  return (
    <div className="dashboard">
      <div className="dashboard-grid">
        {/* Metrics Row */}
        <div className="dashboard-metrics">
          {/* Same order as the Analytics status row. */}
          <div className="metric-card">
            <div className="metric-label">Planning</div>
            <div className="metric-value">{planningCount}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">On hold</div>
            <div className="metric-value">{pausedCount}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Active Projects</div>
            <div className="metric-value">{activeCount}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Completed</div>
            <div className="metric-value">{completedCount}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">My Projects</div>
            <div className="metric-value">{myProjects.length}</div>
          </div>
        </div>

        {/* Main Content */}
        <div className="dashboard-main">
          {/* Left Column */}
          <div className="dashboard-column-left">
            {/* Recent Projects */}
            <section className="dashboard-section">
              <div className="dashboard-section-head">
                <h3>Recent Projects</h3>
              </div>
              <div className="dashboard-projects-grid">
                {recentProjects.length === 0 ? (
                  <p className="muted small">No active projects yet.</p>
                ) : (
                  recentProjects.slice(0, 4).map((p) => (
                    <ProjectCard
                      key={p.id}
                      project={p}
                      designers={workspace.designers}
                      onClick={() => onOpenProject(p.id)}
                    />
                  ))
                )}
              </div>
            </section>

            {/* Overdue Tasks */}
            {overdueTasks.length > 0 && (
              <section className="dashboard-section dashboard-overdue">
                <div className="dashboard-section-head">
                  <h3><Icon name="clock-circle" size={16} /> Overdue tasks</h3>
                </div>
                <div className="dashboard-task-list">
                  {overdueTasks.map((p) => (
                    <div
                      key={p.id}
                      className="dashboard-task-item"
                      onClick={() => onOpenProject(p.id)}
                    >
                      <div className="task-info">
                        <div className="task-title">{p.title}</div>
                        <div className="task-meta">{p.client}</div>
                      </div>
                      <div className="task-priority">
                        <span className={`priority-badge ${p.priority?.toLowerCase()}`}>
                          {p.priority}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Right Column */}
          <div className="dashboard-column-right">
            {/* My Work */}
            <section className="dashboard-section">
              <div className="dashboard-section-head">
                <h3>My Work</h3>
              </div>
              {myProjects.length === 0 ? (
                <p className="muted small">No projects assigned to you.</p>
              ) : (
                <div className="dashboard-task-list">
                  {myProjects.slice(0, 5).map((p) => (
                    <div
                      key={p.id}
                      className="dashboard-task-item"
                      onClick={() => onOpenProject(p.id)}
                    >
                      <div className="task-info">
                        <div className="task-title">{p.title}</div>
                        <div className="task-meta">
                          {p.dueDate ? `Due ${p.dueDate}` : "No due date"}
                        </div>
                      </div>
                      <span className={`priority-badge ${p.priority?.toLowerCase()}`}>
                        {p.priority}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Upcoming Deadlines */}
            <section className="dashboard-section">
              <div className="dashboard-section-head">
                <h3>Upcoming Deadlines</h3>
              </div>
              {upcomingDeadlines.length === 0 ? (
                <p className="muted small">No upcoming deadlines in the next 2 weeks.</p>
              ) : (
                <div className="dashboard-deadline-list">
                  {upcomingDeadlines.map((p) => {
                    const assignees = workspace.designers.filter((d) =>
                      p.assigneeIds.includes(d.id)
                    );
                    return (
                      <div
                        key={p.id}
                        className="dashboard-deadline-item"
                        onClick={() => onOpenProject(p.id)}
                      >
                        <div className="deadline-date">
                          <div className="deadline-day">
                            {new Date(p.dueDate!).getDate()}
                          </div>
                          <div className="deadline-month">
                            {new Date(p.dueDate!).toLocaleDateString("en-US", {
                              month: "short",
                            })}
                          </div>
                        </div>
                        <div className="deadline-info">
                          <div className="deadline-title">{p.title}</div>
                          <div className="deadline-meta">
                            {assignees.length > 0 && (
                              <div className="deadline-assignees">
                                {assignees.slice(0, 3).map((d) => (
                                  <Avatar key={d.id} designer={d} size={20} />
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>

        {/* Recent Activity */}
        <section className="dashboard-section dashboard-full-width">
          <div className="dashboard-section-head">
            <h3>Recent Activity</h3>
          </div>
          <div className="dashboard-activity-table">
            <div className="activity-header">
              <div className="activity-col-title">Title</div>
              <div className="activity-col-client">Client</div>
              <div className="activity-col-assigned">Assigned To</div>
              <div className="activity-col-status">Status</div>
              <div className="activity-col-due">Due Date</div>
            </div>
            {recentActivity.slice(0, 8).map((p) => {
              const assignees = workspace.designers.filter((d) =>
                p.assigneeIds.includes(d.id)
              );
              return (
                <div
                  key={p.id}
                  className="activity-row"
                  onClick={() => onOpenProject(p.id)}
                >
                  <div className="activity-col-title">
                    <span className={`priority-dot ${p.priority?.toLowerCase()}`} />
                    {p.title}
                  </div>
                  <div className="activity-col-client">{p.client || "—"}</div>
                  <div className="activity-col-assigned">
                    {assignees.length > 0 ? (
                      <div className="activity-assignees">
                        {assignees.slice(0, 2).map((d) => (
                          <Avatar key={d.id} designer={d} size={20} />
                        ))}
                        {assignees.length > 2 && (
                          <span className="activity-assignee-more">
                            +{assignees.length - 2}
                          </span>
                        )}
                      </div>
                    ) : (
                      "—"
                    )}
                  </div>
                  <div className="activity-col-status">
                    <span className={`activity-status-badge wp-status ${projectStatusTone(p.status)}`}>
                      {projectStatusLabel(p.status)}
                    </span>
                  </div>
                  <div className="activity-col-due">
                    {p.dueDate ? (
                      <span className="activity-due-date">{p.dueDate}</span>
                    ) : (
                      "—"
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

import { Icon } from "./Icon";