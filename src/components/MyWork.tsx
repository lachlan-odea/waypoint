import { useState } from "react";
import type { Campaign, Designer, Project, ProjectStatus, Workspace } from "../types";
import { PROJECT_STATUSES } from "../constants";
import { projectStatusTone } from "../statusTone";
import { readDraggedProjectId } from "../dnd";
import { ProjectCard } from "./ProjectCard";
import { MyWorkTable } from "./MyWorkTable";

// My work: everything assigned to you across every team, on My Desk. A grid
// of your active projects, a kanban of everything by status (drag a card
// between columns to change its status), or a dense table. The layout
// choice is a per-browser preference.

type MyWorkView = "grid" | "kanban" | "list";

const VIEW_KEY = "waypoint.board.myWorkView";

type Props = {
  // Active projects assigned to you, high priority first.
  projects: Project[];
  // Everything assigned to you, whatever its status, for the kanban and list.
  allProjects: Project[];
  designers: Designer[];
  workspaces: Workspace[];
  campaignsByProject: Map<string, Campaign[]>;
  onOpen: (projectId: string) => void;
  onStatusChange: (projectId: string, status: ProjectStatus) => void;
  onOpenCampaign: (campaignId: string) => void;
};

export function MyWork({
  projects,
  allProjects,
  designers,
  workspaces,
  campaignsByProject,
  onOpen,
  onStatusChange,
  onOpenCampaign,
}: Props) {
  const [view, setViewState] = useState<MyWorkView>(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      return saved === "kanban" || saved === "list" ? saved : "grid";
    } catch {
      return "grid";
    }
  });
  function setView(next: MyWorkView) {
    setViewState(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // per-browser preference only
    }
  }

  // Which kanban column a dragged card is hovering over.
  const [dropOver, setDropOver] = useState<ProjectStatus | null>(null);

  function statusDropHandlers(status: ProjectStatus) {
    return {
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        setDropOver(status);
      },
      onDragLeave: () => setDropOver((cur) => (cur === status ? null : cur)),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDropOver(null);
        const pid = readDraggedProjectId(e);
        if (pid) onStatusChange(pid, status);
      },
    };
  }

  // Every card says which team it belongs to: the desk spans all of them.
  const teamName = (p: Project) =>
    workspaces.find((w) => w.id === p.workspaceId)?.name ?? p.workspaceId;

  return (
    <section className="workspace-section mywork-section">
      <div className="section-head">
        <div className="section-head-title">
          <h2>My work</h2>
          <div className="view-seg" role="group" aria-label="My work layout">
            <button type="button" aria-pressed={view === "grid"} onClick={() => setView("grid")}>
              Grid
            </button>
            <button type="button" aria-pressed={view === "kanban"} onClick={() => setView("kanban")}>
              Kanban
            </button>
            <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>
              List
            </button>
          </div>
        </div>
        <span className="muted small">
          {view === "kanban"
            ? "Everything assigned to you, by status · drag a card between columns to change its status"
            : view === "list"
              ? "Everything assigned to you, one line each · change a status in place, click a row to open it"
              : "Your active projects across every team · high priority first"}
        </span>
      </div>
      {view === "kanban" ? (
        <div className="kanban">
          {PROJECT_STATUSES.map((s) => {
            const cards = allProjects.filter((p) => (p.status ?? "active") === s.value);
            return (
              <div
                key={s.value}
                className={`kanban-col drop-target ${dropOver === s.value ? "drop-over" : ""}`}
                {...statusDropHandlers(s.value)}
              >
                <header className="kanban-col-head">
                  <span className={`wp-status ${projectStatusTone(s.value)}`}>{s.label}</span>
                  <span className="kanban-col-count">{cards.length}</span>
                </header>
                <div className="kanban-col-cards">
                  {cards.length === 0 && <p className="muted small kanban-empty">Drop a card here</p>}
                  {cards.map((p) => (
                    <ProjectCard
                      key={p.id}
                      project={p}
                      designers={designers}
                      campaigns={campaignsByProject.get(p.id)}
                      onClick={() => onOpen(p.id)}
                      compact
                      teamBadge={teamName(p)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : view === "list" ? (
        <MyWorkTable
          projects={allProjects}
          designers={designers}
          workspaces={workspaces}
          campaignsByProject={campaignsByProject}
          onOpen={onOpen}
          onStatusChange={onStatusChange}
          onOpenCampaign={onOpenCampaign}
        />
      ) : projects.length === 0 ? (
        <p className="muted">
          Nothing assigned to you yet. Hit + New → Project, drag a card onto your
          column on a team board, or wait for an Outlook brief to arrive.
        </p>
      ) : (
        <div className="workspace-grid">
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              designers={designers}
              campaigns={campaignsByProject.get(p.id)}
              onClick={() => onOpen(p.id)}
              teamBadge={teamName(p)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
