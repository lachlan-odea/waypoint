import type { Designer, Workspace } from "../types";
import { Avatar } from "./Avatar";

export type SidebarView = "workspace" | "analytics" | "archived";

type Props = {
  currentDesigner: Designer;
  collapsed: boolean;
  view: SidebarView;
  unreadNotifications: number;
  workspaces: Workspace[];
  currentWorkspaceId: string;
  onSelectWorkspace: (id: string) => void;
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

const WORKSPACE_VISUALS: Record<
  string,
  { color: string; Glyph: () => React.ReactElement }
> = {
  design: { color: "#4f46e5", Glyph: BrushGlyph },
  video: { color: "#ef4444", Glyph: VideoGlyph },
  marketing: { color: "#10b981", Glyph: MegaphoneGlyph },
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
  currentWorkspaceId,
  onSelectWorkspace,
  onToggleCollapsed,
  onSelectView,
  onNewProject,
  onOpenNotifications,
  onOpenSettings,
  onLogout,
}: Props) {
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
            <div className="muted small">Signed in</div>
          </div>
        )}
      </div>

      <nav className="sidebar-nav">
        <button className="nav-primary" onClick={onNewProject} title="New project">
          {collapsed ? "+" : "+ New project"}
        </button>

        {!collapsed && <div className="nav-section">Workspaces</div>}
        <ul className="designer-list">
          {workspaces.map((w) => {
            const v = WORKSPACE_VISUALS[w.id] ?? {
              color: "#64748b",
              Glyph: WorkspaceGlyph,
            };
            const active = view === "workspace" && currentWorkspaceId === w.id;
            return (
              <li key={w.id}>
                <button
                  className={`designer-btn ${active ? "active" : ""}`}
                  onClick={() => onSelectWorkspace(w.id)}
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
