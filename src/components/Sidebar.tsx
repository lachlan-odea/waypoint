import { useState } from "react";
import type { Designer, Hub, Workspace } from "../types";
import { Avatar } from "./Avatar";
import { HubClocks } from "./HubClocks";
import { readDraggedProjectId } from "../dnd";

export type SidebarView =
  | "myDesk"
  | "executiveDashboard"
  | "board"
  | "socialCalendar"
  | "analytics"
  | "archived";

type Props = {
  currentDesigner: Designer;
  collapsed: boolean;
  view: SidebarView;
  unreadNotifications: number;
  workspaces: Workspace[];
  // Configured office locations, rendered as a live clock strip.
  hubs: Hub[];
  currentWorkspaceId: string;
  onSelectWorkspace: (id: string) => void;
  // Fired when a project card is dropped on a workspace nav item. Receives
  // the project id and the destination workspace id.
  onDropProjectOnWorkspace: (projectId: string, workspaceId: string) => void;
  onToggleCollapsed: () => void;
  onSelectView: (view: SidebarView) => void;
  onNewProject: () => void;
  onOpenNotifications: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
};

const iconProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function BellIcon() {
  return (
    <svg {...iconProps} aria-hidden>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg {...iconProps} aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

const navGlyphProps = {
  width: 14,
  height: 14,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function WorkspaceGlyph() {
  return (
    <svg {...navGlyphProps}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function BrushGlyph() {
  return (
    <svg {...navGlyphProps}>
      <path d="M9.06 11.9l8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08" />
      <path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z" />
    </svg>
  );
}

function VideoGlyph() {
  return (
    <svg {...navGlyphProps}>
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" />
    </svg>
  );
}

function MegaphoneGlyph() {
  return (
    <svg {...navGlyphProps}>
      <path d="m3 11 18-5v12L3 14v-3z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </svg>
  );
}

function SpeechGlyph() {
  return (
    <svg {...navGlyphProps}>
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.9 8.9 0 0 1-3.6-.8L3 21l1.9-4.6A8.3 8.3 0 0 1 3 11.5a8.4 8.4 0 0 1 9-8.4 8.4 8.4 0 0 1 9 8.4z" />
      <path d="M8 11h8M8 14h5" />
    </svg>
  );
}

const WORKSPACE_VISUALS: Record<
  string,
  { color: string; Glyph: () => React.ReactElement }
> = {
  design: { color: "#4f46e5", Glyph: BrushGlyph },
  video: { color: "#ef4444", Glyph: VideoGlyph },
  marketing: { color: "#10b981", Glyph: MegaphoneGlyph },
  comms: { color: "#f59e0b", Glyph: SpeechGlyph },
};

function AnalyticsGlyph() {
  return (
    <svg {...navGlyphProps}>
      <line x1="6" y1="20" x2="6" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="18" y1="20" x2="18" y2="14" />
      <line x1="3" y1="20" x2="21" y2="20" />
    </svg>
  );
}

function DashboardGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}

function CalendarGlyph() {
  return (
    <svg {...navGlyphProps}>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <rect x="7" y="12" width="3" height="3" rx="0.5" fill="currentColor" stroke="none" />
      <rect x="14" y="12" width="3" height="3" rx="0.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ArchiveGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="3" width="18" height="5" rx="1" />
      <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
      <line x1="10" y1="13" x2="14" y2="13" />
    </svg>
  );
}

function LogOutIcon() {
  return (
    <svg {...iconProps} aria-hidden>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

export function Sidebar({
  currentDesigner,
  collapsed,
  view,
  unreadNotifications,
  workspaces,
  hubs,
  currentWorkspaceId,
  onSelectWorkspace,
  onDropProjectOnWorkspace,
  onToggleCollapsed,
  onSelectView,
  onNewProject,
  onOpenNotifications,
  onOpenSettings,
  onLogout,
}: Props) {
  // Which workspace item the dragged project is currently hovering over.
  // Local state so the highlight stays in sync without round-tripping through
  // the parent.
  const [dropOverWorkspaceId, setDropOverWorkspaceId] = useState<string | null>(
    null,
  );
  const myHub = hubs.find((h) => h.id === currentDesigner.hubId);
  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="sidebar-head">
        {!collapsed && <span className="brand-mark">Waypoint</span>}
        <button className="icon-btn" onClick={onToggleCollapsed} aria-label="Toggle sidebar">
          ☰
        </button>
      </div>

      <div className="sidebar-user">
        <Avatar designer={currentDesigner} />
        {!collapsed && (
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{currentDesigner.name}</div>
            {myHub ? (
              <div className="hub-tag" title={myHub.timeZone}>
                {myHub.name}
              </div>
            ) : (
              <div className="muted small">Signed in</div>
            )}
          </div>
        )}
      </div>

      <HubClocks
        hubs={hubs}
        myHubId={currentDesigner.hubId}
        collapsed={collapsed}
      />

      <nav className="sidebar-nav">
        <button className="nav-primary" onClick={onNewProject} title="New project">
          {collapsed ? "+" : "+ New project"}
        </button>

        {!collapsed && <div className="nav-section">Navigation</div>}
        <ul className="designer-list">
          <li>
            <button
              className={`designer-btn ${view === "myDesk" ? "active" : ""}`}
              onClick={() => onSelectView("myDesk")}
              title="My Desk"
            >
              <span className="dot-avatar" style={{ background: "#6366f1" }}>
                <DashboardGlyph />
              </span>
              {!collapsed && <span className="designer-name">My Desk</span>}
            </button>
          </li>
        </ul>

        {!collapsed && <div className="nav-section">Teams</div>}
        <ul className="designer-list">
          {workspaces.map((w) => {
            const v = WORKSPACE_VISUALS[w.id] ?? {
              color: "#64748b",
              Glyph: WorkspaceGlyph,
            };
            const active = view === "board" && currentWorkspaceId === w.id;
            const isDropTarget = dropOverWorkspaceId === w.id;
            // Dragging onto the workspace you're already viewing is a no-op,
            // so don't highlight or accept the drop there — keeps the gesture
            // honest.
            const canDrop = w.id !== currentWorkspaceId;
            return (
              <li key={w.id}>
                <button
                  className={`designer-btn ${active ? "active" : ""} ${
                    isDropTarget && canDrop ? "drop-over" : ""
                  }`}
                  onClick={() => {
                    onSelectWorkspace(w.id);
                    onSelectView("board");
                  }}
                  onDragOver={(e) => {
                    if (!canDrop) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDropOverWorkspaceId(w.id);
                  }}
                  onDragLeave={() =>
                    setDropOverWorkspaceId((cur) => (cur === w.id ? null : cur))
                  }
                  onDrop={(e) => {
                    if (!canDrop) return;
                    e.preventDefault();
                    setDropOverWorkspaceId(null);
                    const pid = readDraggedProjectId(e);
                    if (pid) onDropProjectOnWorkspace(pid, w.id);
                  }}
                  title={w.name}
                >
                  <span className="dot-avatar" style={{ background: v.color }}>
                    <v.Glyph />
                  </span>
                  {!collapsed && <span className="designer-name">{w.name}</span>}
                </button>
              </li>
            );
          })}
        </ul>

        {!collapsed && <div className="nav-section">View</div>}
        <ul className="designer-list">
          <li>
            <button
              className={`designer-btn ${view === "executiveDashboard" ? "active" : ""}`}
              onClick={() => onSelectView("executiveDashboard")}
              title="Executive Dashboard"
            >
              <span className="dot-avatar" style={{ background: "#8b5cf6" }}>
                <DashboardGlyph />
              </span>
              {!collapsed && <span className="designer-name">Executive Dashboard</span>}
            </button>
          </li>
          <li>
            <button
              className={`designer-btn ${view === "socialCalendar" ? "active" : ""}`}
              onClick={() => onSelectView("socialCalendar")}
              title="Social calendar"
            >
              <span className="dot-avatar" style={{ background: "#ec4899" }}>
                <CalendarGlyph />
              </span>
              {!collapsed && <span className="designer-name">Social calendar</span>}
            </button>
          </li>
          <li>
            <button
              className={`designer-btn ${view === "analytics" ? "active" : ""}`}
              onClick={() => onSelectView("analytics")}
              title="Analytics"
            >
              <span className="dot-avatar" style={{ background: "#0ea5e9" }}>
                <AnalyticsGlyph />
              </span>
              {!collapsed && <span className="designer-name">Analytics</span>}
            </button>
          </li>
          <li>
            <button
              className={`designer-btn ${view === "archived" ? "active" : ""}`}
              onClick={() => onSelectView("archived")}
              title="Archived projects"
            >
              <span className="dot-avatar" style={{ background: "#64748b" }}>
                <ArchiveGlyph />
              </span>
              {!collapsed && <span className="designer-name">Archived</span>}
            </button>
          </li>
        </ul>
      </nav>

      <div className="sidebar-foot">
        <button
          className="icon-btn notif-bell"
          onClick={onOpenNotifications}
          title={
            unreadNotifications > 0
              ? `${unreadNotifications} unread notification${unreadNotifications === 1 ? "" : "s"}`
              : "Notifications"
          }
          aria-label="Notifications"
        >
          <BellIcon />
          {unreadNotifications > 0 && (
            <span className="notif-badge" aria-label="Unread notifications">
              {unreadNotifications > 9 ? "9+" : unreadNotifications}
            </span>
          )}
        </button>
        <button
          className="icon-btn"
          onClick={onOpenSettings}
          title="Settings"
          aria-label="Settings"
        >
          <SettingsIcon />
        </button>
        <button
          className="icon-btn"
          onClick={onLogout}
          title="Log out"
          aria-label="Log out"
        >
          <LogOutIcon />
        </button>
      </div>
    </aside>
  );
}
