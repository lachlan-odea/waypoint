import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  Campaign,
  Designer,
  Hub,
  MarketingEvent,
  Project,
  Workspace,
} from "../types";
import { Avatar } from "./Avatar";
import { Icon } from "./Icon";
import { contentTypesSearchText } from "../contentTypes";

type Props = {
  currentDesigner: Designer;
  hubs: Hub[];
  unreadNotifications: number;
  // Everything the global search looks through.
  projects: Project[];
  campaigns: Campaign[];
  events: MarketingEvent[];
  workspaces: Workspace[];
  onOpenProject: (id: string) => void;
  onOpenCampaign: (id: string) => void;
  onOpenEvent: (id: string) => void;
  onOpenNotifications: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
  // The phone's drawer toggle lives here now (the ☰ button).
  onOpenNav: () => void;
  // The current page's own buttons (Help, + New, Export CSV …), folded up
  // into the header beside the user menu.
  actions?: ReactNode;
};

type Result =
  | { kind: "project"; id: string; label: string; sub: string }
  | { kind: "campaign"; id: string; label: string; sub: string }
  | { kind: "event"; id: string; label: string; sub: string };

const KIND_LABEL: Record<Result["kind"], string> = {
  project: "Project",
  campaign: "Campaign",
  event: "Event",
};

const MAX_RESULTS = 8;

// The universal header across the top of the content area (§9 Shell): a
// global search on the left, then the notifications bell and the signed-in
// user's menu on the right. The user's name opens a dropdown with Settings
// and Log out. Lifted here out of the sidebar so it's on every screen.
export function AppHeader({
  currentDesigner,
  hubs,
  unreadNotifications,
  projects,
  campaigns,
  events,
  workspaces,
  onOpenProject,
  onOpenCampaign,
  onOpenEvent,
  onOpenNotifications,
  onOpenSettings,
  onLogout,
  onOpenNav,
  actions,
}: Props) {
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const searchRoot = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const menuRoot = useRef<HTMLDivElement>(null);
  const listId = useId();
  const menuId = useId();

  // ⌘K / Ctrl+K from anywhere jumps to the search.
  const isMac =
    typeof navigator !== "undefined" && /Mac|iP(hone|ad|od)/.test(navigator.platform);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        searchInput.current?.focus();
        searchInput.current?.select();
        setSearchOpen(true);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const myHub = hubs.find((h) => h.id === currentDesigner.hubId);
  const workspaceName = useMemo(() => {
    const map = new Map(workspaces.map((w) => [w.id, w.name]));
    return (id: string) => map.get(id) ?? id;
  }, [workspaces]);

  // Match the same project fields the old board search covered, plus a
  // campaign/event name match. Capped so the dropdown stays a glance, not a
  // scroll.
  const results = useMemo<Result[]>(() => {
    // Match on each word independently, so word order doesn't matter: "video
    // ebl" finds "eBL Video update" just as "ebl video" does. Every term must
    // appear somewhere in the item's text.
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];
    const matches = (text: string) => {
      const hay = text.toLowerCase();
      return terms.every((t) => hay.includes(t));
    };
    const out: Result[] = [];
    for (const p of projects) {
      if (out.length >= MAX_RESULTS) break;
      const hay = [p.title, p.client, p.brand, contentTypesSearchText(p)].join(" ");
      if (matches(hay)) {
        out.push({
          kind: "project",
          id: p.id,
          label: p.title,
          sub: workspaceName(p.workspaceId),
        });
      }
    }
    for (const c of campaigns) {
      if (out.length >= MAX_RESULTS) break;
      if (matches(c.name)) {
        out.push({ kind: "campaign", id: c.id, label: c.name, sub: "Campaign" });
      }
    }
    for (const e of events) {
      if (out.length >= MAX_RESULTS) break;
      if (matches(e.name)) {
        out.push({ kind: "event", id: e.id, label: e.name, sub: "Event" });
      }
    }
    return out;
  }, [query, projects, campaigns, events, workspaceName]);

  // Close the search dropdown on an outside click or Escape.
  useEffect(() => {
    if (!searchOpen) return;
    function onDown(e: MouseEvent) {
      if (!searchRoot.current?.contains(e.target as Node)) setSearchOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSearchOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [searchOpen]);

  // Same for the user menu.
  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (!menuRoot.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  function pick(r: Result) {
    setSearchOpen(false);
    setQuery("");
    if (r.kind === "project") onOpenProject(r.id);
    else if (r.kind === "campaign") onOpenCampaign(r.id);
    else onOpenEvent(r.id);
  }

  const showResults = searchOpen && query.trim().length > 0;

  return (
    <header className="app-header">
      <button
        type="button"
        className="icon-btn mobile-nav-btn"
        onClick={onOpenNav}
        aria-label="Open menu"
      >
        ☰
      </button>

      <div className="app-search" ref={searchRoot}>
        <Icon name="search" size={18} className="app-search-icon" />
        <input
          ref={searchInput}
          type="text"
          className="app-search-input"
          placeholder="Search projects, campaigns and events…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSearchOpen(true);
          }}
          onFocus={() => {
            setSearchFocused(true);
            setSearchOpen(true);
          }}
          onBlur={() => setSearchFocused(false)}
          role="combobox"
          aria-expanded={showResults}
          aria-controls={showResults ? listId : undefined}
          aria-autocomplete="list"
        />
        {!searchFocused && !query && (
          <kbd className="app-search-hint" aria-hidden>
            {isMac ? "⌘K" : "Ctrl K"}
          </kbd>
        )}
        {showResults && (
          <ul id={listId} className="app-search-results" role="listbox">
            {results.length === 0 ? (
              <li className="app-search-empty" role="presentation">
                No matches for “{query.trim()}”
              </li>
            ) : (
              results.map((r) => (
                <li key={`${r.kind}-${r.id}`} role="none">
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    className="app-search-result"
                    onClick={() => pick(r)}
                  >
                    <span className="app-search-result-label">{r.label}</span>
                    <span className={`app-search-kind kind-${r.kind}`}>
                      {r.sub || KIND_LABEL[r.kind]}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      <div className="app-header-right">
        {actions && <div className="app-header-actions">{actions}</div>}
        <button
          type="button"
          className="icon-btn notif-bell"
          onClick={onOpenNotifications}
          title={
            unreadNotifications > 0
              ? `${unreadNotifications} unread notification${unreadNotifications === 1 ? "" : "s"}`
              : "Notifications"
          }
          aria-label="Notifications"
        >
          <Icon name="bell-notification" size={18} />
          {unreadNotifications > 0 && (
            <span className="notif-badge" aria-label="Unread notifications">
              {unreadNotifications > 9 ? "9+" : unreadNotifications}
            </span>
          )}
        </button>

        <div className="app-user-menu" ref={menuRoot}>
          <button
            type="button"
            className="app-user-trigger"
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls={menuOpen ? menuId : undefined}
            title={currentDesigner.name}
          >
            <Avatar designer={currentDesigner} />
            <span className="app-user-info">
              <span className="app-user-name">{currentDesigner.name}</span>
              {myHub ? (
                <span className="app-user-hub" title={myHub.timeZone}>
                  {myHub.name}
                </span>
              ) : (
                <span className="app-user-hub muted">Signed in</span>
              )}
            </span>
            <Icon name="chevron-down" size={14} className="app-user-caret" />
          </button>
          {menuOpen && (
            <ul id={menuId} className="app-user-dropdown" role="menu">
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  className="app-user-item"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenSettings();
                  }}
                >
                  <Icon name="settings" size={16} />
                  Settings
                </button>
              </li>
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  className="app-user-item"
                  onClick={() => {
                    setMenuOpen(false);
                    onLogout();
                  }}
                >
                  <Icon name="log-out" size={16} />
                  Log out
                </button>
              </li>
            </ul>
          )}
        </div>
      </div>
    </header>
  );
}
