import { useState } from "react";
import type { Designer, Hub, Workspace } from "../types";
import { workspaceIcon } from "../workspaceIcon";
import { HubClocks } from "./HubClocks";
import { Icon, type IconName } from "./Icon";
import { WaypointLogo } from "./brand/WaypointLogo";
import { readDraggedProjectId } from "../dnd";
import { NewMenu, type NewKind } from "./NewMenu";

export type SidebarView =
  | "myDesk"
  | "executiveDashboard"
  | "bigRocks"
  | "board"
  | "campaigns"
  | "events"
  | "socialCalendar"
  | "analytics"
  | "archived"
  | "tools"
  // Opened from the header's account menu, not a sidebar row.
  | "settings";

type Props = {
  currentDesigner: Designer;
  collapsed: boolean;
  view: SidebarView;
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
  // The + New menu: a project, a campaign, an event or a social post.
  onNew: (kind: NewKind) => void;
  // Campaigns → Webinars: the Campaigns page opened straight on its
  // Webinars tab.
  onOpenWebinars: () => void;
};

// The shell nav (design system §7 "Tiles & app navigation"): plain line
// icons, no coloured tiles. Each team board is a folder. A view with
// `children` carries a caret and shows them in a flyout beside the row on
// hover, focus or →, like the + New menu's Webinar; it stays highlighted
// while a child is open. A child with `webinars` isn't a view of its own:
// it opens its parent's page on the Webinars tab.
type NavItem = { view: SidebarView; label: string; icon: IconName; hint?: string; webinars?: true; children?: NavItem[] };
const VIEW_NAV: NavItem[] = [
  {
    view: "executiveDashboard",
    label: "Executive Dashboard",
    icon: "presentation-board-chart-graph",
    children: [{ view: "bigRocks", label: "Big Rocks", icon: "flag", hint: "The team's priorities, and what serves each" }],
  },
  {
    view: "campaigns",
    label: "Campaigns",
    icon: "target",
    children: [{ view: "campaigns", label: "Webinars", icon: "video-camera", hint: "The webinar pipeline, worked through the 2026 kit", webinars: true }],
  },
  { view: "events", label: "Events", icon: "calendar" },
  { view: "socialCalendar", label: "Social calendar", icon: "file" },
  { view: "archived", label: "Archived", icon: "archive-documents-box-big" },
  { view: "tools", label: "Tools", icon: "browser" },
];

function NavIcon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <span className="nav-icon" aria-hidden>
      <Icon name={name} size={size} />
    </span>
  );
}

export function Sidebar({
  currentDesigner,
  collapsed,
  view,
  workspaces,
  hubs,
  currentWorkspaceId,
  onSelectWorkspace,
  onDropProjectOnWorkspace,
  onToggleCollapsed,
  onSelectView,
  onNew,
  onOpenWebinars,
}: Props) {
  // Which workspace item the dragged project is currently hovering over.
  // Local state so the highlight stays in sync without round-tripping through
  // the parent.
  const [dropOverWorkspaceId, setDropOverWorkspaceId] = useState<string | null>(
    null,
  );
  // The view whose flyout the keyboard has opened. Hover opens one through
  // CSS (:hover on the row keeps it open across the gap); this is for → and
  // focus, where there's nothing to hover.
  const [flyout, setFlyout] = useState<SidebarView | null>(null);
  // The row whose flyout was just used: clicking the row or one of its
  // children closes the flyout, even though the pointer is still over it
  // and focus is still inside. It comes back when the pointer returns to
  // the row or focus leaves it.
  const [dismissed, setDismissed] = useState<SidebarView | null>(null);
  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="sidebar-head">
        <span className="brand-mark">
          {collapsed ? (
            <WaypointLogo variant="mark" color="white" height={26} />
          ) : (
            <WaypointLogo variant="horizontal" color="white" height={26} />
          )}
        </span>
        <button className="icon-btn" onClick={onToggleCollapsed} aria-label="Toggle sidebar">
          <Icon name="menu" size={18} />
        </button>
      </div>

      <HubClocks
        hubs={hubs}
        myHubId={currentDesigner.hubId}
        collapsed={collapsed}
      />

      <nav className="sidebar-nav">
        <NewMenu variant="nav" collapsed={collapsed} onPick={onNew} />

        {!collapsed && <div className="nav-section">Navigation</div>}
        <ul className="designer-list">
          <li>
            <button
              className={`designer-btn ${view === "myDesk" ? "active" : ""}`}
              onClick={() => onSelectView("myDesk")}
              title="My Desk"
            >
              <NavIcon name="chart-square" />
              {!collapsed && <span className="designer-name">My Desk</span>}
            </button>
          </li>
        </ul>

        {!collapsed && <div className="nav-section">Teams</div>}
        <ul className="designer-list">
          {workspaces.map((w) => {
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
                  <NavIcon name={workspaceIcon(w)} />
                  {!collapsed && <span className="designer-name">{w.name}</span>}
                </button>
              </li>
            );
          })}
        </ul>

        {!collapsed && <div className="nav-section">View</div>}
        <ul className="designer-list">
          {VIEW_NAV.map((item) => {
            const childOpen = item.children?.some((c) => !c.webinars && c.view === view) ?? false;
            return (
              <li
                key={item.view}
                className={`nav-li ${item.children ? "has-children" : ""} ${flyout === item.view ? "flyout-open" : ""} ${dismissed === item.view ? "flyout-dismissed" : ""}`}
                onMouseEnter={() => {
                  if (dismissed === item.view) setDismissed(null);
                }}
                onBlur={(e) => {
                  // Leaving the row and its flyout altogether closes it.
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                    setFlyout(null);
                    setDismissed(null);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape" && flyout === item.view) setFlyout(null);
                }}
              >
                <button
                  className={`designer-btn ${view === item.view || childOpen ? "active" : ""}`}
                  onClick={() => {
                    if (item.children) {
                      setFlyout(null);
                      setDismissed(item.view);
                    }
                    onSelectView(item.view);
                  }}
                  title={item.children ? `${item.label} · ${item.children.map((c) => c.label).join(", ")} beside it` : item.label}
                  aria-haspopup={item.children ? "menu" : undefined}
                  aria-expanded={item.children ? flyout === item.view || undefined : undefined}
                  onKeyDown={(e) => {
                    if (item.children && e.key === "ArrowRight") {
                      e.preventDefault();
                      setFlyout(item.view);
                      setDismissed(null);
                      // The flyout is in the DOM already; it just needs a
                      // paint with the class on before it can take focus.
                      window.requestAnimationFrame(() =>
                        e.currentTarget.parentElement?.querySelector<HTMLButtonElement>(".nav-flyout button")?.focus(),
                      );
                    }
                  }}
                >
                  <NavIcon name={item.icon} />
                  {!collapsed && <span className="designer-name">{item.label}</span>}
                  {item.children && !collapsed && (
                    <Icon name="chevron-right" size={14} className="nav-caret" />
                  )}
                </button>
                {item.children && (
                  <ul className="new-menu-list new-menu-flyout flyout-right nav-flyout" role="menu" aria-label={`${item.label} views`}>
                    {item.children.map((c) => {
                      // Webinars is a tab of its parent's page, so it never
                      // shows as the open view itself.
                      const current = !c.webinars && view === c.view;
                      return (
                      <li key={c.label} role="none">
                        <button
                          type="button"
                          role="menuitem"
                          className={`new-menu-item ${current ? "active" : ""}`}
                          aria-current={current ? "page" : undefined}
                          onClick={() => {
                            setFlyout(null);
                            setDismissed(item.view);
                            if (c.webinars) onOpenWebinars();
                            else onSelectView(c.view);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "ArrowLeft") {
                              e.preventDefault();
                              setFlyout(null);
                              e.currentTarget.closest(".nav-li")?.querySelector<HTMLButtonElement>(".designer-btn")?.focus();
                            }
                          }}
                        >
                          <span className="new-menu-label">
                            <Icon name={c.icon} size={14} className="nav-flyout-icon" />
                            {c.label}
                          </span>
                          {c.hint && <span className="new-menu-hint">{c.hint}</span>}
                        </button>
                      </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
