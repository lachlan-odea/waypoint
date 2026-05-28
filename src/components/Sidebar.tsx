import type { Designer } from "../types";

export type SidebarView = "workspace" | "analytics";

type Props = {
  currentDesigner: Designer;
  collapsed: boolean;
  view: SidebarView;
  onToggleCollapsed: () => void;
  onSelectView: (view: SidebarView) => void;
  onNewProject: () => void;
  onOpenSettings: () => void;
  onChangePin: () => void;
  onLogout: () => void;
};

export function Sidebar({
  currentDesigner,
  collapsed,
  view,
  onToggleCollapsed,
  onSelectView,
  onNewProject,
  onOpenSettings,
  onChangePin,
  onLogout,
}: Props) {
  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="sidebar-head">
        {!collapsed && <span className="brand-mark">Design&nbsp;PM</span>}
        <button className="icon-btn" onClick={onToggleCollapsed} aria-label="Toggle sidebar">
          ☰
        </button>
      </div>

      <div className="sidebar-user">
        <span
          className="dot-avatar"
          style={{ background: currentDesigner.color }}
          title={currentDesigner.name}
        >
          {currentDesigner.initials}
        </span>
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

        {!collapsed && <div className="nav-section">View</div>}
        <ul className="designer-list">
          <li>
            <button
              className={`designer-btn ${view === "workspace" ? "active" : ""}`}
              onClick={() => onSelectView("workspace")}
              title="Workspace"
            >
              <span className="dot-avatar" style={{ background: "#1f2937" }}>
                ▦
              </span>
              {!collapsed && <span className="designer-name">Workspace</span>}
            </button>
          </li>
          <li>
            <button
              className={`designer-btn ${view === "analytics" ? "active" : ""}`}
              onClick={() => onSelectView("analytics")}
              title="Analytics"
            >
              <span className="dot-avatar" style={{ background: "#0ea5e9" }}>
                ⌬
              </span>
              {!collapsed && <span className="designer-name">Analytics</span>}
            </button>
          </li>
        </ul>
      </nav>

      <div className="sidebar-foot">
        <button className="icon-btn" onClick={onChangePin} title="Change PIN">
          🔑
        </button>
        <button className="icon-btn" onClick={onOpenSettings} title="Storage settings">
          ⚙
        </button>
        <button className="icon-btn" onClick={onLogout} title="Log out">
          ⎋
        </button>
      </div>
    </aside>
  );
}
