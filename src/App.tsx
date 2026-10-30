import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMediaQuery } from "./hooks/useMediaQuery";
import type {
  Campaign,
  ActivityShare,
  MarketingEvent,
  Notification,
  Speaker,
  Project,
  ProjectStatus,
  SocialConfig,
  SocialPost,
  WorkspaceData,
} from "./types";
import { auth, observeAuth, signOut as fbSignOut } from "./firebase";
import { APP_VERSION, markSessionEpoch, sessionEpochChanged } from "./version";
import {
  deleteNotification as firestoreDeleteNotification,
  deleteNotificationsForRecipient as firestoreDeleteNotificationsForRecipient,
  deleteProject as firestoreDeleteProject,
  createPlaceholderDesigner as firestoreCreatePlaceholderDesigner,
  deleteDesigner as firestoreDeleteDesigner,
  seedHubsIfMissing,
  seedSocialPostsIfMissing,
  seedWorkspacesIfMissing,
  setHub as firestoreSetHub,
  deleteHub as firestoreDeleteHub,
  setDesignerHub as firestoreSetDesignerHub,
  setDesignerPhotoUrl as firestoreSetDesignerPhotoUrl,
  setDesignerReviewer as firestoreSetDesignerReviewer,
  setDesignerSuperUser as firestoreSetDesignerSuperUser,
  setNotification as firestoreSetNotification,
  setProject as firestoreSetProject,
  setWorkspaceMembers as firestoreSetWorkspaceMembers,
  relabelSocialPostCategory as firestoreRelabelSocialPostCategory,
  setSocialConfig as firestoreSetSocialConfig,
  setCampaign as firestoreSetCampaign,
  deleteCampaign as firestoreDeleteCampaign,
  deleteCampaignPage as firestoreDeleteCampaignPage,
  setSocialPost as firestoreSetSocialPost,
  moveSocialPost as firestoreMoveSocialPost,
  deleteSocialPost as firestoreDeleteSocialPost,
  setEvent as firestoreSetEvent,
  deleteEvent as firestoreDeleteEvent,
  deleteItineraryPage as firestoreDeleteItineraryPage,
  seedEventsIfMissing,
  subscribeEvents,
  subscribeSpeakers,
  subscribeActivityShare,
  setActivityShare as firestoreSetActivityShare,
  setSpeaker as firestoreSetSpeaker,
  deleteSpeaker as firestoreDeleteSpeaker,
  subscribeCampaigns,
  subscribeSocialConfig,
  subscribeSocialPosts,
  subscribeWorkspace,
} from "./firestore";
import { duplicateCampaign as copyCampaign, isSocialMilestone, milestoneSocialPost } from "./campaigns";
import { publishCampaignPage } from "./campaignExport";
import { ACTIVITY_PAGE_FILE_NAME, activityPageData, downloadActivityPage, newShareToken, publishActivityPage } from "./activityExport";
import { SharePointGuideModal } from "./components/SharePointGuideModal";
import { publishItineraryPage } from "./itineraryExport";
import { Sidebar, type SidebarView } from "./components/Sidebar";
import { ProjectCard } from "./components/ProjectCard";
import { MyWorkTable } from "./components/MyWorkTable";
import { NotificationsPanel } from "./components/NotificationsPanel";
import { CreateProjectModal } from "./components/CreateProjectModal";
import { SettingsModal } from "./components/SettingsModal";
import { Analytics } from "./components/Analytics";
import { Dashboard } from "./components/Dashboard";
import { MyDesk } from "./components/MyDesk";
import { SocialCalendar } from "./components/SocialCalendar";
import { CampaignsView } from "./components/CampaignsView";
import { CampaignsPanel } from "./components/CampaignsPanel";
import { EventsView } from "./components/EventsView";
import { NewMenu, type NewKind } from "./components/NewMenu";
import { Login } from "./components/Login";
import { ProjectPage } from "./components/pages/ProjectPage";
import { CampaignPage } from "./components/pages/CampaignPage";
import { EventPage } from "./components/pages/EventPage";
import { closeItem, openItem, replaceItemTab, useItemRoute } from "./router";
import { HelpTour } from "./components/HelpTour";
import { showDesktopAlert } from "./desktopNotifications";
import { tourFor } from "./helpTours";
import { allSeries, kitOf } from "./webinarKit";
import { NewWebinarModal } from "./components/webinar/NewWebinarModal";
import { Icon } from "./components/Icon";
import { ProfileSetup } from "./components/ProfileSetup";
import { Avatar } from "./components/Avatar";
import { readDraggedProjectId } from "./dnd";
import { contentTypesSearchText } from "./contentTypes";
import {
  PROJECT_STATUSES,
  resolveSocialConfig,
  DEFAULT_WORKSPACE_ID,
  SUPER_USER_EMAILS,
} from "./constants";
import { projectStatusTone } from "./statusTone";
import "./App.css";
import "./pages.css";
import "./help.css";
import "./exec.css";
import "./webinar.css";
import "./analytics.css";

const PRIORITY_ORDER: Record<string, number> = {
  Urgent: 0,
  High: 1,
  Normal: 2,
  Low: 3,
};

// Sentinel for the Archive's "All teams" pill. Not a workspace id.
const ARCHIVE_ALL_TEAMS = "__all__";

function sortByPriorityThenDue(a: Project, b: Project): number {
  const dp = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  if (dp !== 0) return dp;
  return (a.dueDate || "9999").localeCompare(b.dueDate || "9999");
}

export default function App() {
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  // null = not signed in. undefined = still waiting for the initial auth
  // state-change callback (Firebase persists across reloads but the
  // restoration is async). We distinguish so the login screen doesn't
  // flash before the persisted user is restored.
  const [sessionDesignerId, setSessionDesignerId] = useState<
    string | null | undefined
  >(undefined);
  const [collapsed, setCollapsed] = useState(false);
  // On phones the sidebar is a drawer opened from the top bar (the ≤720px
  // block in App.css does the layout). navOpen only matters while the
  // viewport is that narrow, so widening the window simply drops it.
  const isMobile = useMediaQuery("(max-width: 720px)");
  const [navOpen, setNavOpen] = useState(false);
  const drawerOpen = isMobile && navOpen;
  const [view, setView] = useState<SidebarView>("myDesk");
  // The project, campaign or event open as a page, from the address bar.
  const route = useItemRoute();
  // The Help button's guided tour of the page on screen. Closes when the
  // page changes under it.
  const [tourOpen, setTourOpen] = useState(false);
  // + New → Campaign → Webinar: the Start a webinar form, from anywhere.
  const [newWebinarOpen, setNewWebinarOpen] = useState(false);
  useEffect(() => {
    setTourOpen(false);
  }, [route?.kind, route?.id, view]);
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [route?.kind, route?.id]);
  const [creating, setCreating] = useState(false);
  const [createInitial, setCreateInitial] = useState<Partial<Project> | undefined>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  // Escape closes the drawer.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState<string>("");
  const [dropOverColumn, setDropOverColumn] = useState<string | null>(null);
  const [planningExpanded, setPlanningExpanded] = useState(true);
  // Which team the Archive is narrowed to. Independent of the board's
  // currently-selected team, since the Archive spans all of them.
  const [archiveTeamFilter, setArchiveTeamFilter] =
    useState<string>(ARCHIVE_ALL_TEAMS);
  // A social post the project window asked to open. Handed to the Social
  // calendar, which clears it once the editor is up.
  const [focusSocialPostId, setFocusSocialPostId] = useState<string | null>(
    null,
  );
  const [pausedExpanded, setPausedExpanded] = useState(true);
  const [completedExpanded, setCompletedExpanded] = useState(true);
  const [cancelledExpanded, setCancelledExpanded] = useState(false);
  // The Team section folds away so the board is just your own work.
  // Per-browser, like the other view preferences.
  const [teamCollapsed, setTeamCollapsedState] = useState(() => {
    try {
      return localStorage.getItem("waypoint.board.teamCollapsed") === "1";
    } catch {
      return false;
    }
  });
  function setTeamCollapsed(next: boolean) {
    setTeamCollapsedState(next);
    try {
      localStorage.setItem("waypoint.board.teamCollapsed", next ? "1" : "0");
    } catch {
      // per-browser preference only
    }
  }
  // My work as a grid of your active projects, or a kanban of everything
  // assigned to you by status.
  const [myWorkView, setMyWorkViewState] = useState<"grid" | "kanban" | "list">(() => {
    try {
      const saved = localStorage.getItem("waypoint.board.myWorkView");
      return saved === "kanban" || saved === "list" ? saved : "grid";
    } catch {
      return "grid";
    }
  });
  function setMyWorkView(next: "grid" | "kanban" | "list") {
    setMyWorkViewState(next);
    try {
      localStorage.setItem("waypoint.board.myWorkView", next);
    } catch {
      // per-browser preference only
    }
  }
  const [darkMode, setDarkMode] = useState(() =>
    localStorage.getItem("waypoint.darkMode") === "true"
  );
  const [textSize, setTextSize] = useState<"small" | "default" | "large">(() => {
    const saved = localStorage.getItem("waypoint.textSize");
    return (saved as "small" | "default" | "large") || "default";
  });
  // Transient banner shown after a project is moved between workspaces.
  // `undo` reverts the move and clears the toast.
  const [toast, setToast] = useState<{
    message: string;
    // Optional: a toast can be a plain notice with nothing to reverse.
    undo?: () => void;
  } | null>(null);
  // Which workspace tab is currently active (Design / Video / Marketing).
  // Persisted per browser so a refresh keeps you on the same workspace.
  const [currentWorkspaceId, setCurrentWorkspaceIdState] = useState<string>(
    () => localStorage.getItem("waypoint.workspaceId") || DEFAULT_WORKSPACE_ID,
  );
  function setCurrentWorkspaceId(id: string) {
    setCurrentWorkspaceIdState(id);
    localStorage.setItem("waypoint.workspaceId", id);
  }

  // Persist dark mode preference
  useEffect(() => {
    localStorage.setItem("waypoint.darkMode", String(darkMode));
    if (darkMode) {
      document.documentElement.classList.add("dark-mode");
    } else {
      document.documentElement.classList.remove("dark-mode");
    }
  }, [darkMode]);

  // Persist text size preference
  useEffect(() => {
    localStorage.setItem("waypoint.textSize", textSize);
    const scale = textSize === "small" ? 0.9 : textSize === "large" ? 1.1 : 1;
    document.documentElement.style.zoom = String(scale);
  }, [textSize]);

  // Watch Firebase auth state. Sets the session designer id to the user's
  // UID (which is also their Designer doc id) when signed in, or null when
  // signed out. The Login screen calls signIn/signUp directly and the
  // resulting auth change flows back through here.
  //
  // A release can ask everyone to sign in again (SESSION_EPOCH in
  // version.ts). The first time this browser boots on such a build with a
  // restored user, that user is signed out and the login page says why.
  const [signedOutForUpdate, setSignedOutForUpdate] = useState(false);
  useEffect(() => {
    return observeAuth((user) => {
      if (user && sessionEpochChanged()) {
        markSessionEpoch();
        setSignedOutForUpdate(true);
        fbSignOut().catch((err) => {
          console.error(err);
          setSessionDesignerId(user.uid);
        });
        return;
      }
      markSessionEpoch();
      setSessionDesignerId(user ? user.uid : null);
    });
  }, []);

  // Make sure the seeded workspaces (Design / Video / Marketing) exist in
  // Firestore once we're signed in. Idempotent — only creates docs that
  // aren't already there.
  useEffect(() => {
    if (!sessionDesignerId) return;
    seedWorkspacesIfMissing().catch((err) => {
      console.warn("Couldn't seed workspaces", err);
    });
    // Creates Sydney + Chicago on a brand-new install only; never resurrects
    // a location an admin has deleted.
    seedHubsIfMissing().catch((err) => {
      console.warn("Couldn't seed locations", err);
    });
    // Loads the marketing team's 2026 calendar into an empty /socialPosts
    // collection. Checks the server, not the cache, so this quietly fails
    // when offline rather than queueing a re-import.
    seedSocialPostsIfMissing().catch((err) => {
      console.warn("Couldn't seed the social calendar", err);
    });
    // Likewise the CargoWise Event Portal export into an empty /events.
    seedEventsIfMissing().catch((err) => {
      console.warn("Couldn't seed the events", err);
    });
  }, [sessionDesignerId]);

  // Live-subscribe to Firestore once we have a signed-in user. The
  // subscription stays up for the lifetime of the session and tears down on
  // sign-out.
  useEffect(() => {
    if (!sessionDesignerId) {
      setWorkspace(null);
      return;
    }
    setStatus("Loading…");
    const unsubscribe = subscribeWorkspace(
      (ws) => {
        setWorkspace(ws);
        setStatus("");
      },
      (err) => {
        console.error(err);
        setStatus(`Sync error: ${err.message}`);
      },
    );
    return unsubscribe;
  }, [sessionDesignerId]);

  // Social calendar configuration: categories + company hashtags. Falls back
  // to the built-in defaults until a super user has saved the document.
  const [socialConfigDoc, setSocialConfigDoc] = useState<SocialConfig | null>(
    null,
  );
  // No reset on sign-out: the Login screen replaces everything below, and
  // the next sign-in's snapshot overwrites whatever was here.
  useEffect(() => {
    if (!sessionDesignerId) return;
    return subscribeSocialConfig(setSocialConfigDoc, (err) => {
      console.warn("Couldn't load social calendar settings", err);
    });
  }, [sessionDesignerId]);
  const socialConfig = useMemo(
    () => resolveSocialConfig(socialConfigDoc),
    [socialConfigDoc],
  );

  // Marketing campaigns. Shared by the Campaigns view (its own page) and
  // the Social calendar (overlay on the post grid), so they live here.
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  useEffect(() => {
    if (!sessionDesignerId) return;
    return subscribeCampaigns(setCampaigns, (err) => {
      console.warn("Couldn't load campaigns", err);
      setStatus(`Sync error: ${err.message}`);
    });
  }, [sessionDesignerId]);

  // Trade shows and conferences, for the Events page.
  const [events, setEvents] = useState<MarketingEvent[]>([]);
  useEffect(() => {
    if (!sessionDesignerId) return;
    return subscribeEvents(setEvents, (err) => {
      console.warn("Couldn't load events", err);
      setStatus(`Sync error: ${err.message}`);
    });
  }, [sessionDesignerId]);

  // The webinar speaker directory, for the Webinars view and the speaker
  // rows on every webinar's page.
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  useEffect(() => {
    if (!sessionDesignerId) return;
    return subscribeSpeakers(setSpeakers, (err) => {
      console.warn("Couldn't load speakers", err);
    });
  }, [sessionDesignerId]);

  // The marketing activity page on SharePoint: its token and link.
  const [activityShare, setActivityShare] = useState<ActivityShare>({});
  const [activityGuideOpen, setActivityGuideOpen] = useState(false);
  useEffect(() => {
    if (!sessionDesignerId) return;
    return subscribeActivityShare(setActivityShare, (err) => {
      console.warn("Couldn't load the activity page settings", err);
    });
  }, [sessionDesignerId]);

  // Requests from the header's + New menu and Export CSV button to the
  // Campaigns, Events and Social pages, which own their editors and export
  // dialogs. Each is a fresh number per click (so a repeat click fires
  // again) that the page acts on and then asks to have cleared, so a
  // request never replays when the page is next shown.
  const [newCampaignRequest, setNewCampaignRequest] = useState(0);
  const [newEventRequest, setNewEventRequest] = useState(0);
  const [newPostRequest, setNewPostRequest] = useState(0);
  const [exportRequest, setExportRequest] = useState(0);
  // The dashboard opens the Campaigns page straight onto its Webinars view.
  const [campaignsViewRequest, setCampaignsViewRequest] = useState<{ view: "cards" | "calendar" | "webinars"; seq: number } | undefined>();
  const requestSeq = useRef(0);
  const nextRequest = () => ++requestSeq.current;

  // The + New menu, from the sidebar or the header. A project opens its
  // window here; a campaign, an event or a post goes to its page with the
  // editor up.
  function startNew(kind: NewKind) {
    setNavOpen(false);
    if (kind === "project") {
      setCreateInitial({ workspaceId: currentWorkspaceId });
      setCreating(true);
      return;
    }
    if (kind === "webinar") {
      setNewWebinarOpen(true);
      return;
    }
    closeItem();
    if (kind === "campaign") {
      setNewCampaignRequest(nextRequest());
      setView("campaigns");
    } else if (kind === "event") {
      setNewEventRequest(nextRequest());
      setView("events");
    } else {
      setNewPostRequest(nextRequest());
      setView("socialCalendar");
    }
  }

  // Every social post, for Analytics and for the Settings editor's "N posts"
  // hints and delete warnings. Cheap enough to keep live.
  const [socialPostsForUsage, setSocialPostsForUsage] = useState<SocialPost[]>(
    [],
  );
  useEffect(() => {
    if (!sessionDesignerId) return;
    return subscribeSocialPosts(setSocialPostsForUsage, (err) => {
      console.warn("Couldn't load social posts for settings", err);
    });
  }, [sessionDesignerId]);
  const socialCategoryUsage = useMemo(() => {
    const counts = new Map<string, number>();
    socialPostsForUsage.forEach((p) => {
      if (p.category) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    });
    return counts;
  }, [socialPostsForUsage]);

  // If the workspace loads and the signed-in user has no Designer doc, give
  // signup a short grace period to finish writing the doc (race window
  // between observeAuth and the claim/create batch). After that, surface a
  // ProfileSetup recovery screen so an orphan account can be repaired.
  const designerExists = !!workspace?.designers.some(
    (d) => d.id === sessionDesignerId,
  );
  const [profileSetupNeeded, setProfileSetupNeeded] = useState(false);
  useEffect(() => {
    if (!sessionDesignerId || !workspace || designerExists) {
      setProfileSetupNeeded(false);
      return;
    }
    const timer = window.setTimeout(() => setProfileSetupNeeded(true), 3000);
    return () => window.clearTimeout(timer);
  }, [sessionDesignerId, workspace, designerExists]);

  // Auto-dismiss the move-project toast after a few seconds so it doesn't
  // linger. Clicking Undo dismisses earlier.
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Outlook plugin can send: { type: "pmtool:create-project", payload: <Partial<Project>> }
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const data = e.data;
      if (!data || data.type !== "pmtool:create-project") return;
      if (!sessionDesignerId) return;
      setCreateInitial({ ...data.payload, source: "outlook" });
      setCreating(true);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [sessionDesignerId]);

  // Outlook plugin can also deep-link: ?new=<base64-json>
  useEffect(() => {
    if (!sessionDesignerId) return;
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("new");
    if (!raw) return;
    try {
      const payload = JSON.parse(atob(raw));
      setCreateInitial({ ...payload, source: "outlook" });
      setCreating(true);
      params.delete("new");
      const url = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`;
      window.history.replaceState({}, "", url);
    } catch (err) {
      console.warn("Bad ?new payload", err);
    }
  }, [sessionDesignerId]);

  // Project id handed to an already-running installed app by the PWA launch
  // queue, parked here until the workspace has loaded and we can resolve it.
  const [pendingLaunchProjectId, setPendingLaunchProjectId] = useState<
    string | null
  >(null);

  // With launch_handler.client_mode "focus-existing", a captured link focuses
  // the open app window and delivers the URL here rather than navigating —
  // so without this consumer the window would come to the front and do
  // nothing. Registered once on mount and never torn down: launchQueue
  // buffers launches until a consumer exists, but only hands the backlog to
  // the first one, so re-registering would drop it.
  useEffect(() => {
    const queue = (
      window as unknown as {
        launchQueue?: {
          setConsumer: (c: (params: { targetURL?: string }) => void) => void;
        };
      }
    ).launchQueue;
    if (!queue) return;
    queue.setConsumer((params) => {
      if (!params?.targetURL) return;
      try {
        const id = new URL(
          params.targetURL,
          window.location.href,
        ).searchParams.get("project");
        if (id) setPendingLaunchProjectId(id);
      } catch {
        // A target URL we can't parse is nothing we can act on.
      }
    });
  }, []);

  // Open a specific project from ?project=<id>. Reached three ways: a cold
  // start on a shared link, the reviewer notification email, and a captured
  // link arriving via the launch queue above. Waits until workspace data is
  // loaded so we can resolve the id and also flip to the project's team —
  // otherwise the modal would be sitting over a confusingly different board.
  useEffect(() => {
    if (!sessionDesignerId || !workspace) return;
    const params = new URLSearchParams(window.location.search);
    const fromAddressBar = params.get("project");
    const id = pendingLaunchProjectId ?? fromAddressBar;
    if (!id) return;

    const project = workspace.projects.find((p) => p.id === id);
    if (project) {
      setCurrentWorkspaceId(project.workspaceId);
      openItem("project", id);
    } else {
      // Someone shared a link to a project that's since been deleted. Say so
      // — stripping the param and showing an ordinary board leaves the
      // recipient thinking the link worked and the project was empty.
      setToast({
        message: "That project link is no longer valid — it may have been deleted.",
      });
    }

    if (pendingLaunchProjectId) setPendingLaunchProjectId(null);
    // Only a cold start puts the param in the address bar; a launch-queue
    // hand-off doesn't navigate, so there's nothing to tidy there.
    if (fromAddressBar) {
      params.delete("project");
      // Keep the hash: openItem above just put the project's page route there.
      const url = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`;
      window.history.replaceState({}, "", url);
    }
  }, [sessionDesignerId, workspace, pendingLaunchProjectId]);

  const currentDesigner = useMemo(
    () =>
      workspace && sessionDesignerId
        ? workspace.designers.find((d) => d.id === sessionDesignerId)
        : null,
    [workspace, sessionDesignerId]
  );

  // Projects belonging to the currently-selected workspace tab.
  const workspaceProjects = useMemo(
    () =>
      workspace
        ? workspace.projects.filter((p) => p.workspaceId === currentWorkspaceId)
        : [],
    [workspace, currentWorkspaceId],
  );

  const visibleProjects = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return workspaceProjects;
    return workspaceProjects.filter((p) =>
      [p.title, p.client, p.brand, contentTypesSearchText(p)]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [workspaceProjects, filter]);

  // Every workspace is visible to everyone — workspace membership only
  // controls who shows up *inside* a workspace (the Team columns, assignee
  // pickers, by-designer analytics).
  const availableWorkspaces = useMemo(
    () =>
      (workspace?.workspaces ?? [])
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [workspace],
  );

  const currentWorkspace = useMemo(
    () => availableWorkspaces.find((w) => w.id === currentWorkspaceId) ?? null,
    [availableWorkspaces, currentWorkspaceId],
  );

  // Designers who belong in the current workspace. A workspace with no
  // explicit memberIds is "open" — everyone shows up.
  const workspaceDesigners = useMemo(() => {
    if (!workspace) return [];
    const members = currentWorkspace?.memberIds ?? [];
    if (members.length === 0) return workspace.designers;
    const memberSet = new Set(members);
    return workspace.designers.filter((d) => memberSet.has(d.id));
  }, [workspace, currentWorkspace]);

  const currentWorkspaceName = currentWorkspace?.name ?? currentWorkspaceId;

  // Safety net: if the selected workspace gets deleted entirely, snap back to
  // the first one we know about.
  useEffect(() => {
    if (availableWorkspaces.length === 0) return;
    if (availableWorkspaces.some((w) => w.id === currentWorkspaceId)) return;
    setCurrentWorkspaceId(availableWorkspaces[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableWorkspaces, currentWorkspaceId]);

  const nonArchived = useMemo(
    () => visibleProjects.filter((p) => !p.archived),
    [visibleProjects],
  );

  const activeProjects = useMemo(
    () => nonArchived.filter((p) => (p.status ?? "active") === "active"),
    [nonArchived],
  );

  // Pre-work: scoped but not started. Excluded from activeProjects (which
  // matches on "active"), so these never appear in the team columns.
  const planningProjects = useMemo(
    () =>
      nonArchived
        .filter((p) => p.status === "planning")
        .sort(sortByPriorityThenDue),
    [nonArchived],
  );

  const completedProjects = useMemo(
    () =>
      nonArchived
        .filter((p) => p.status === "completed")
        .sort(sortByPriorityThenDue),
    [nonArchived],
  );

  const pausedProjects = useMemo(
    () =>
      nonArchived
        .filter((p) => p.status === "paused")
        .sort(sortByPriorityThenDue),
    [nonArchived],
  );

  const cancelledProjects = useMemo(
    () =>
      nonArchived
        .filter((p) => p.status === "cancelled")
        .sort(sortByPriorityThenDue),
    [nonArchived],
  );

  // The Archive is deliberately global rather than scoped to the board you
  // came in from. Archived work is a reference library, and having to
  // remember which team a finished project lived on before you can find it
  // defeats the point of having an archive at all. The team filter below
  // narrows it for the cases where you do know.
  const archivedProjects = useMemo(() => {
    if (!workspace) return [];
    const q = filter.trim().toLowerCase();
    return workspace.projects
      .filter((p) => p.archived)
      .filter(
        (p) =>
          archiveTeamFilter === ARCHIVE_ALL_TEAMS ||
          p.workspaceId === archiveTeamFilter,
      )
      .filter(
        (p) =>
          !q ||
          [p.title, p.client, p.brand, contentTypesSearchText(p)]
            .join(" ")
            .toLowerCase()
            .includes(q),
      )
      .sort(sortByPriorityThenDue);
  }, [workspace, filter, archiveTeamFilter]);

  // Per-team totals for the filter pills, ignoring the team filter itself so
  // the counts don't collapse to zero as soon as you pick one. The search box
  // is honoured, so the pills tell you where your search actually matched.
  const archivedCountsByTeam = useMemo(() => {
    const counts = new Map<string, number>();
    if (!workspace) return counts;
    const q = filter.trim().toLowerCase();
    workspace.projects
      .filter((p) => p.archived)
      .filter(
        (p) =>
          !q ||
          [p.title, p.client, p.brand, contentTypesSearchText(p)]
            .join(" ")
            .toLowerCase()
            .includes(q),
      )
      .forEach((p) => {
        counts.set(p.workspaceId, (counts.get(p.workspaceId) ?? 0) + 1);
      });
    return counts;
  }, [workspace, filter]);

  const archivedTotal = useMemo(
    () => [...archivedCountsByTeam.values()].reduce((a, b) => a + b, 0),
    [archivedCountsByTeam],
  );

  // "My work" is global — every active project assigned to me regardless
  // of which team it lives under. Each card in this section gets a team
  // badge when it belongs to a different team than the one we're viewing,
  // so the cross-team origin is visible without switching boards.
  const myProjects = useMemo(() => {
    if (!workspace || !sessionDesignerId) return [];
    return workspace.projects
      .filter((p) => p.assigneeIds.includes(sessionDesignerId))
      .filter((p) => (p.status ?? "active") === "active")
      .filter((p) => !p.archived)
      .sort(sortByPriorityThenDue);
  }, [workspace, sessionDesignerId]);

  // Everything assigned to me, whatever its status, for the kanban.
  const myAllProjects = useMemo(() => {
    if (!workspace || !sessionDesignerId) return [];
    return workspace.projects
      .filter((p) => p.assigneeIds.includes(sessionDesignerId))
      .filter((p) => !p.archived)
      .sort(sortByPriorityThenDue);
  }, [workspace, sessionDesignerId]);

  const otherDesigners = useMemo(
    () => workspaceDesigners.filter((d) => d.id !== sessionDesignerId),
    [workspaceDesigners, sessionDesignerId],
  );

  // Notifications are global to the user — a mention or like on a
  // cross-team project still pings them regardless of which team's board
  // they're currently viewing. The notification's workspaceId is still
  // stored (so we could re-introduce per-team filtering later), but the
  // current panel shows everything addressed to me.
  const myNotifications = useMemo(
    () =>
      workspace
        ? workspace.notifications.filter(
            (n) => n.recipientId === sessionDesignerId,
          )
        : [],
    [workspace, sessionDesignerId],
  );

  const unreadNotifications = myNotifications.length;

  // Desktop alerts for notifications that arrive while the app is open.
  // The first batch after sign-in is what was already waiting, so it's
  // recorded, not announced; after that, anything new gets an alert.
  const seenNotificationIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    seenNotificationIds.current = null;
  }, [sessionDesignerId]);
  useEffect(() => {
    if (!sessionDesignerId || !workspace) return;
    const ids = new Set(myNotifications.map((n) => n.id));
    const seen = seenNotificationIds.current;
    seenNotificationIds.current = ids;
    if (!seen) return;
    for (const n of myNotifications) {
      if (seen.has(n.id)) continue;
      const project = workspace.projects.find((p) => p.id === n.projectId);
      showDesktopAlert(n, project, () => {
        firestoreDeleteNotification(n.id).catch(writeError);
        setNotificationsOpen(false);
        openItem("project", n.projectId, "comments");
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myNotifications, sessionDesignerId]);

  // Super users are admins: they manage teams, manage super users and
  // reviewers, and see the by-designer analytics chart. SUPER_USER_EMAILS
  // is the bootstrap so there's always at least one admin able to grant
  // the flag to others.
  const isSuperUser = useMemo(() => {
    if (currentDesigner?.isSuperUser) return true;
    const email = currentDesigner?.email?.toLowerCase();
    return !!email && (SUPER_USER_EMAILS as readonly string[]).includes(email);
  }, [currentDesigner]);

  const superUsers = useMemo(() => {
    if (!workspace) return [];
    const bootstrap = new Set(
      (SUPER_USER_EMAILS as readonly string[]).map((e) => e.toLowerCase()),
    );
    return workspace.designers.filter(
      (d) =>
        d.isSuperUser || (d.email && bootstrap.has(d.email.toLowerCase())),
    );
  }, [workspace]);

  // Reviewers are a separate, independent role. They populate the Reviewer
  // picker on every project. No bootstrap — admins toggle the flag from
  // Settings. A reviewer doesn't have to be a super user (and vice versa).
  const reviewers = useMemo(() => {
    if (!workspace) return [];
    return workspace.designers.filter((d) => d.isReviewer);
  }, [workspace]);

  // "For review" is global — every active project that has the current
  // user's UID in its reviewerIds list, regardless of which team it lives
  // under. Each card in this section gets a team badge when it belongs to
  // a different team than the one we're viewing, so the cross-team origin
  // is visible without switching boards.
  const reviewProjects = useMemo(() => {
    if (!workspace || !sessionDesignerId) return [];
    return workspace.projects
      .filter((p) => p.reviewerIds?.includes(sessionDesignerId))
      .filter((p) => (p.status ?? "active") === "active")
      .filter((p) => !p.archived)
      .sort(sortByPriorityThenDue);
  }, [workspace, sessionDesignerId]);

  // Every mutator writes the target doc to Firestore and relies on the live
  // subscription to update `workspace` — the SDK's offline persistence makes
  // the listener fire immediately from the IndexedDB cache, so the UI feels
  // instant while the server write happens in the background.
  function writeError(err: unknown) {
    console.error("Firestore write failed", err);
    setStatus(
      `Save failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  function findProject(id: string): Project | null {
    return workspace?.projects.find((p) => p.id === id) ?? null;
  }

  function updateProject(id: string, updater: (p: Project) => Project) {
    const project = findProject(id);
    if (!project) return;
    firestoreSetProject(updater(project)).catch(writeError);
  }

  function deleteProject(id: string) {
    firestoreDeleteProject(id).catch(writeError);
    closeItem();
  }

  function createProject(project: Project) {
    firestoreSetProject(project).catch(writeError);
    setCreating(false);
    setCreateInitial(undefined);
    // Now that the team is selectable, a new project can belong to a board
    // other than the one in view. Follow it across, or the detail modal that
    // opens next would be sitting over a board that doesn't contain it — and
    // closing it would look like the project vanished.
    if (project.workspaceId !== currentWorkspaceId) {
      setCurrentWorkspaceId(project.workspaceId);
    }
    // The board only lists active projects; if we're on a view that would
    // hide it, drop back to the board so the new project is actually visible
    // behind the modal.
    if (view !== "board") setView("board");
    openItem("project", project.id);
  }

  // Dropping a card on a kanban column sets its status; a card that isn't
  // mine yet is claimed on the way, since the kanban is My work.
  function dropProjectOntoStatus(projectId: string, status: ProjectStatus) {
    const project = findProject(projectId);
    if (!project || !sessionDesignerId) return;
    const assigneeIds = project.assigneeIds.includes(sessionDesignerId)
      ? project.assigneeIds
      : [...project.assigneeIds, sessionDesignerId];
    if ((project.status ?? "active") === status && assigneeIds === project.assigneeIds) return;
    firestoreSetProject({ ...project, status, assigneeIds }).catch(writeError);
  }

  // Drop semantics: dropping a card on a designer's column adds them as an
  // additional assignee (the card stays in any existing assignees' columns
  // too). Dropping on the Unassigned column clears all assignees.
  function dropProjectOnto(projectId: string, designerId: string | null) {
    const project = findProject(projectId);
    if (!project) return;
    let updated: Project;
    if (designerId === null) {
      if (project.assigneeIds.length === 0) return;
      updated = { ...project, assigneeIds: [] };
    } else {
      if (project.assigneeIds.includes(designerId)) return;
      updated = { ...project, assigneeIds: [...project.assigneeIds, designerId] };
    }
    firestoreSetProject(updated).catch(writeError);
  }

  // Every campaign save goes through here, so this is where social
  // milestones get their Social calendar post: one is created the first
  // time a milestone is saved as a social type, and moved along when the
  // milestone's date changes. A post someone has since deleted is left
  // deleted rather than recreated. `deletePostIds` are posts whose
  // milestones were removed in the editor with "delete the post too".
  // Refresh the marketing activity page's public copy after a campaign or
  // event changes. Nothing is written until the page has a token.
  function republishActivity(nextCampaigns: Campaign[], nextEvents: MarketingEvent[]) {
    if (!activityShare.shareToken || !workspace) return;
    publishActivityPage(activityShare.shareToken, nextCampaigns, nextEvents, socialPostsForUsage, workspace.designers).catch((err) =>
      console.warn("Couldn't update the marketing activity page", err),
    );
  }

  function saveCampaign(campaign: Campaign, deletePostIds: string[] = []) {
    deletePostIds.forEach((id) => firestoreDeleteSocialPost(id).catch(writeError));
    const before = campaigns.find((c) => c.id === campaign.id);
    const milestones = campaign.milestones.map((m) => {
      if (!m.socialPostId) {
        if (!isSocialMilestone(m, socialConfig.milestoneTypes)) return m;
        const post = milestoneSocialPost(campaign, m);
        firestoreSetSocialPost(post).catch(writeError);
        return { ...m, socialPostId: post.id };
      }
      const was = before?.milestones.find((x) => x.id === m.id);
      if (was && was.date !== m.date) {
        firestoreMoveSocialPost(m.socialPostId, m.date).catch((err) =>
          console.warn("Couldn't move the milestone's social post", err),
        );
      }
      return m;
    });
    const saved = { ...campaign, milestones };
    firestoreSetCampaign(saved).catch(writeError);
    // Keep the SharePoint page's public copy in step with the campaign.
    publishCampaignPage(saved, socialPostsForUsage).catch((err) =>
      console.warn("Couldn't update the campaign's SharePoint page", err),
    );
    republishActivity(campaigns.some((c) => c.id === saved.id) ? campaigns.map((c) => (c.id === saved.id ? saved : c)) : [...campaigns, saved], events);
  }

  // Jump to the Social calendar with one post's editor open.
  function openSocialPost(postId: string) {
    closeItem();
    setFocusSocialPostId(postId);
    setView("socialCalendar");
  }

  // Open a project, campaign or event as its own page.
  function openProject(projectId: string) {
    openItem("project", projectId);
  }
  function openEvent(eventId: string, tab?: string) {
    openItem("event", eventId, tab);
  }
  function openWebinars() {
    closeItem();
    setCampaignsViewRequest({ view: "webinars", seq: nextRequest() });
    setView("campaigns");
  }
  function openCampaign(campaignId: string, tab?: string) {
    openItem("campaign", campaignId, tab);
  }

  // Which campaigns each project contributes to, for the flag on its card.
  const campaignsByProject = useMemo(() => {
    const map = new Map<string, Campaign[]>();
    campaigns.forEach((c) =>
      (c.projectIds ?? []).forEach((id) => {
        const list = map.get(id) ?? [];
        list.push(c);
        map.set(id, list);
      }),
    );
    return map;
  }, [campaigns]);

  // Its SharePoint page's public copy goes too, so the page says the
  // campaign has been removed rather than showing it as it was.
  // An exact copy, opened straight away. Written directly so the copy's
  // social milestones don't create posts on the Social calendar.
  function duplicateCampaign(id: string) {
    const c = campaigns.find((x) => x.id === id);
    if (!c) {
      setToast({ message: "That campaign isn't loaded yet. Try again in a moment." });
      return;
    }
    try {
      const copy = copyCampaign(c, sessionDesignerId ?? undefined);
      firestoreSetCampaign(copy)
        .then(() => setToast({ message: `Created "${copy.name}" — you're now looking at the copy.` }))
        .catch((err) => {
          writeError(err);
          setToast({ message: `Couldn't save the copy: ${err instanceof Error ? err.message : String(err)}` });
        });
      openItem("campaign", copy.id);
    } catch (err) {
      console.error("Couldn't duplicate the campaign", err);
      setToast({ message: `Couldn't duplicate: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  const saveSpeaker = useCallback((speaker: Speaker) => {
    firestoreSetSpeaker(speaker).catch(writeError);
  }, []);
  function deleteSpeaker(id: string) {
    firestoreDeleteSpeaker(id).catch(writeError);
  }

  function deleteCampaign(id: string) {
    closeItem();
    const token = campaigns.find((c) => c.id === id)?.shareToken;
    firestoreDeleteCampaign(id).catch(writeError);
    republishActivity(campaigns.filter((c) => c.id !== id), events);
    if (token) {
      firestoreDeleteCampaignPage(token).catch((err) =>
        console.warn("Couldn't remove the campaign's SharePoint page", err),
      );
    }
  }

  // Saving an event also refreshes its itinerary's SharePoint page, if it
  // has one, since the page shows the event's name and dates.
  function saveEvent(event: MarketingEvent) {
    firestoreSetEvent(event).catch(writeError);
    publishItineraryPage(event).catch((err) =>
      console.warn("Couldn't update the itinerary's SharePoint page", err),
    );
    republishActivity(campaigns, events.some((e) => e.id === event.id) ? events.map((e) => (e.id === event.id ? event : e)) : [...events, event]);
  }

  // The itinerary page's public copy goes with the event, so the page says
  // the itinerary has been removed rather than showing it as it was.
  function deleteEvent(id: string) {
    closeItem();
    const token = events.find((e) => e.id === id)?.itineraryShareToken;
    firestoreDeleteEvent(id).catch(writeError);
    if (token) {
      firestoreDeleteItineraryPage(token).catch((err) =>
        console.warn("Couldn't remove the itinerary's SharePoint page", err),
      );
    }
    republishActivity(campaigns, events.filter((e) => e.id !== id));
  }

  function addNotifications(notifs: Notification[]) {
    if (notifs.length === 0) return;
    notifs.forEach((n) => firestoreSetNotification(n).catch(writeError));
  }

  function clearAllNotifications() {
    if (!sessionDesignerId) return;
    firestoreDeleteNotificationsForRecipient(sessionDesignerId).catch(
      writeError,
    );
  }

  function deleteNotification(id: string) {
    firestoreDeleteNotification(id).catch(writeError);
  }

  function setProjectArchived(projectId: string, archived: boolean) {
    const project = findProject(projectId);
    if (!project) return;
    firestoreSetProject({ ...project, archived }).catch(writeError);
  }

  function setProjectStatus(projectId: string, status: ProjectStatus) {
    const project = findProject(projectId);
    if (!project) return;
    firestoreSetProject({ ...project, status }).catch(writeError);
  }

  // Set the reviewer list on a project. Passing [] clears the flag (no
  // reviewers requested). Each reviewer in the list sees the project in
  // their own "For review" queue.
  function setProjectReviewers(projectId: string, reviewerIds: string[]) {
    const project = findProject(projectId);
    if (!project) return;
    firestoreSetProject({ ...project, reviewerIds }).catch(writeError);
  }

  // Move a project to another workspace. No-op if it's already there.
  // Surfaces a toast with an Undo that restores the original workspaceId.
  function moveProjectToWorkspace(projectId: string, workspaceId: string) {
    const project = findProject(projectId);
    if (!project) return;
    if (project.workspaceId === workspaceId) return;
    const fromId = project.workspaceId;
    const destName =
      availableWorkspaces.find((w) => w.id === workspaceId)?.name ??
      workspaceId;
    firestoreSetProject({ ...project, workspaceId }).catch(writeError);
    setToast({
      message: `Moved "${project.title}" to ${destName}`,
      undo: () => {
        firestoreSetProject({ ...project, workspaceId: fromId }).catch(
          writeError,
        );
        setToast(null);
      },
    });
  }

  // Sign-out resets local UI state; the observeAuth callback will clear
  // sessionDesignerId, which tears down the subscription.
  function logout() {
    closeItem();
    setCreating(false);
    setSettingsOpen(false);
    setView("myDesk");
    fbSignOut().catch(console.error);
  }

  // sessionDesignerId === undefined means we haven't heard from Firebase yet
  // (auth is restoring from IndexedDB). Show a brief boot screen instead of
  // flashing Login.
  if (sessionDesignerId === undefined) {
    return (
      <div className="boot">
        <p>Loading…</p>
      </div>
    );
  }

  if (!sessionDesignerId) {
    return (
      <Login
        notice={signedOutForUpdate ? `Waypoint has been updated to version ${APP_VERSION}. Please sign in again.` : undefined}
        onSignedIn={() => {
          setSignedOutForUpdate(false);
          /* auth state listener does the rest */
        }}
      />
    );
  }

  if (profileSetupNeeded && workspace && !designerExists) {
    return (
      <ProfileSetup
        uid={sessionDesignerId}
        email={auth.currentUser?.email ?? ""}
      />
    );
  }

  if (!workspace || !currentDesigner) {
    return (
      <div className="boot">
        <p>{status || "Loading…"}</p>
      </div>
    );
  }

  const routedProject =
    route?.kind === "project"
      ? (workspace.projects.find((p) => p.id === route.id) ?? null)
      : null;
  const routedCampaign =
    route?.kind === "campaign" ? (campaigns.find((c) => c.id === route.id) ?? null) : null;
  const routedEvent =
    route?.kind === "event" ? (events.find((e) => e.id === route.id) ?? null) : null;
  // Which sidebar row the open page belongs to.
  const navView: SidebarView = route
    ? route.kind === "project"
      ? "board"
      : route.kind === "campaign"
        ? "campaigns"
        : "events"
    : view;
  const listFor = (kind: "project" | "campaign" | "event"): SidebarView =>
    kind === "project" ? "board" : kind === "campaign" ? "campaigns" : "events";
  const tourKey = route
    ? route.kind === "campaign" && routedCampaign && kitOf(routedCampaign)
      ? "webinar"
      : route.kind
    : view;
  const tour = tourFor(tourKey);

  const unassigned = activeProjects
    .filter((p) => p.assigneeIds.length === 0)
    .sort(sortByPriorityThenDue);

  function statusDropHandlers(status: ProjectStatus) {
    const key = `status:${status}`;
    return {
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        setDropOverColumn(key);
      },
      onDragLeave: () => setDropOverColumn((cur) => (cur === key ? null : cur)),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDropOverColumn(null);
        const pid = readDraggedProjectId(e);
        if (pid) dropProjectOntoStatus(pid, status);
      },
    };
  }

  function dropHandlers(targetId: string | null) {
    return {
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDropOverColumn(targetId ?? "__unassigned__");
      },
      onDragLeave: () =>
        setDropOverColumn((cur) =>
          cur === (targetId ?? "__unassigned__") ? null : cur
        ),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        setDropOverColumn(null);
        const pid = readDraggedProjectId(e);
        if (pid) dropProjectOnto(pid, targetId);
      },
    };
  }

  return (
    <div className={`app ${drawerOpen ? "nav-open" : ""}`}>
      <Sidebar
        currentDesigner={currentDesigner}
        collapsed={isMobile ? false : collapsed}
        view={navView}
        unreadNotifications={unreadNotifications}
        workspaces={availableWorkspaces}
        hubs={workspace.hubs}
        currentWorkspaceId={currentWorkspaceId}
        onSelectWorkspace={(id) => {
          closeItem();
          setCurrentWorkspaceId(id);
          setView("board");
          setNavOpen(false);
        }}
        onDropProjectOnWorkspace={moveProjectToWorkspace}
        onToggleCollapsed={() =>
          isMobile ? setNavOpen(false) : setCollapsed((c) => !c)
        }
        onSelectView={(v) => {
          closeItem();
          setView(v);
          setNavOpen(false);
        }}
        onNew={startNew}
        onOpenNotifications={() => {
          setNotificationsOpen(true);
          setNavOpen(false);
        }}
        onOpenSettings={() => {
          setSettingsOpen(true);
          setNavOpen(false);
        }}
        onLogout={logout}
      />
      {drawerOpen && (
        <div className="nav-scrim" onClick={() => setNavOpen(false)} aria-hidden />
      )}

      <main className="main" ref={mainRef}>
        {route ? (
          <>
            <header className="topbar topbar-item">
              <button
                type="button"
                className="icon-btn mobile-nav-btn"
                onClick={() => setNavOpen(true)}
                aria-label="Open menu"
                aria-expanded={drawerOpen}
              >
                ☰
              </button>
              <span className="topbar-item-kind">{route.kind}</span>
              <div className="topbar-actions">
                <HelpButton onClick={() => setTourOpen(true)} />
                <NewMenu variant="primary" onPick={startNew} />
              </div>
            </header>
            {status && <div className="banner">{status}</div>}
            {route.kind === "project" && routedProject ? (
              <ProjectPage
                key={routedProject.id}
                project={routedProject}
                designers={workspace.designers}
                reviewers={reviewers}
                workspaces={availableWorkspaces}
                campaigns={campaigns}
                socialPosts={socialPostsForUsage}
                contentTypeOptions={socialConfig.contentTypes}
                currentDesignerId={currentDesigner.id}
                currentDesignerName={currentDesigner.name}
                tab={route.tab}
                onTab={(t) => replaceItemTab("project", routedProject.id, t)}
                onBack={() => {
                  setCurrentWorkspaceId(routedProject.workspaceId);
                  setView("board");
                  closeItem();
                }}
                onChange={(updater) => updateProject(routedProject.id, updater)}
                onSetReviewers={(reviewerIds) =>
                  setProjectReviewers(routedProject.id, reviewerIds)
                }
                onStatusChange={(s) => setProjectStatus(routedProject.id, s)}
                onArchiveToggle={(archived) => setProjectArchived(routedProject.id, archived)}
                onDelete={() => deleteProject(routedProject.id)}
                onNotify={addNotifications}
                onMoveToWorkspace={(workspaceId) =>
                  moveProjectToWorkspace(routedProject.id, workspaceId)
                }
                onOpenSocialPost={openSocialPost}
                onOpenCampaign={openCampaign}
              />
            ) : route.kind === "campaign" && routedCampaign ? (
              <CampaignPage
                key={routedCampaign.id}
                campaign={routedCampaign}
                campaigns={campaigns}
                currentDesignerId={currentDesigner.id}
                speakers={speakers}
                onSaveSpeaker={saveSpeaker}
                onOpenCampaign={openCampaign}
                categories={socialConfig.categories}
                milestoneTypes={socialConfig.milestoneTypes}
                designers={workspace.designers}
                projects={workspace.projects}
                workspaces={availableWorkspaces}
                socialPosts={socialPostsForUsage}
                tab={route.tab}
                onTab={(t) => replaceItemTab("campaign", routedCampaign.id, t)}
                onBack={() => {
                  setView("campaigns");
                  closeItem();
                }}
                onSave={saveCampaign}
                onDelete={() => deleteCampaign(routedCampaign.id)}
                onDuplicate={() => duplicateCampaign(routedCampaign.id)}
                onOpenProject={openProject}
                onOpenSocialPost={openSocialPost}
              />
            ) : route.kind === "event" && routedEvent ? (
              <EventPage
                key={routedEvent.id}
                event={routedEvent}
                events={events}
                campaigns={campaigns}
                designers={workspace.designers}
                projects={workspace.projects}
                workspaces={availableWorkspaces}
                tab={route.tab}
                onTab={(t) => replaceItemTab("event", routedEvent.id, t)}
                onBack={() => {
                  setView("events");
                  closeItem();
                }}
                onSave={saveEvent}
                onDelete={() => deleteEvent(routedEvent.id)}
                onOpenProject={openProject}
                onOpenCampaign={openCampaign}
              />
            ) : (
              <section className="item-missing">
                <h2>This {route.kind} isn’t here</h2>
                <p className="muted">
                  It may have been deleted, or the link is incomplete.
                </p>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setView(listFor(route.kind));
                    closeItem();
                  }}
                >
                  Back to {route.kind === "project" ? "the board" : route.kind === "campaign" ? "Campaigns" : "Events"}
                </button>
              </section>
            )}
          </>
        ) : (
          <>
        <header className="topbar">
          <button
            type="button"
            className="icon-btn mobile-nav-btn"
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
            aria-expanded={drawerOpen}
          >
            ☰
          </button>
          <div>
            <h1 className="page-title">
              {view === "analytics" ? (
                "Analytics"
              ) : view === "archived" ? (
                "Archived projects"
              ) : view === "myDesk" ? (
                <>
                  My Desk
                  <span className="topbar-sub">
                    {" "}
                    — your work at a glance
                  </span>
                </>
              ) : view === "executiveDashboard" ? (
                "Executive Dashboard"
              ) : view === "socialCalendar" ? (
                "Social calendar"
              ) : view === "campaigns" ? (
                "Campaigns"
              ) : view === "events" ? (
                "Events"
              ) : (
                <>
                  {currentDesigner.name}
                  <span className="topbar-sub">
                    {" "}
                    — {currentWorkspaceName.toLowerCase()}
                  </span>
                </>
              )}
            </h1>
            <p className="muted small">
              {view === "analytics"
                ? "Projects, the Social calendar and campaigns — filter by team and date range below"
                : view === "archived"
                  ? `${archivedProjects.length} archived project${archivedProjects.length === 1 ? "" : "s"} · ${
                      archiveTeamFilter === ARCHIVE_ALL_TEAMS
                        ? "all teams"
                        : (availableWorkspaces.find(
                            (w) => w.id === archiveTeamFilter,
                          )?.name ?? archiveTeamFilter)
                    }`
                  : view === "myDesk"
                    ? "Focus on your assigned projects, deadlines, and priorities"
                    : view === "executiveDashboard"
                      ? "Every team and programme on one page: what needs attention, the next fortnight, how teams are tracking and what moved"
                      : view === "socialCalendar"
                        ? "Plan and track posts across the CargoWise and WiseTech channels"
                        : view === "campaigns"
                          ? "Marketing campaigns and their milestones, month by month"
                          : view === "events"
                            ? "Trade shows and conferences — what's booked, what's on, what needs following up"
                            : `${myProjects.length} project${myProjects.length === 1 ? "" : "s"} assigned · ${currentWorkspaceName}`}
              {" · live"}
            </p>
          </div>
          <div className="topbar-actions">
            {(view === "board" || view === "archived") && (
              <input
                className="search"
                placeholder="Search projects…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            )}
            {(view === "campaigns" || view === "events" || view === "socialCalendar") && (
              <button
                className="btn-mini"
                onClick={() => setExportRequest(nextRequest())}
                disabled={
                  view === "campaigns"
                    ? campaigns.length === 0
                    : view === "events"
                      ? events.length === 0
                      : socialPostsForUsage.length === 0
                }
                title={
                  view === "campaigns"
                    ? "Download the campaigns in a date range as a CSV file"
                    : view === "events"
                      ? "Download the events in a date range as a CSV file"
                      : "Download the posts in a date range as a CSV file"
                }
              >
                Export CSV
              </button>
            )}
            {view === "executiveDashboard" && (
              <>
                {activityShare.sharePointUrl && (
                  <a className="btn btn-secondary" href={activityShare.sharePointUrl} target="_blank" rel="noopener noreferrer" title="The marketing activity page on SharePoint">
                    <Icon name="external-link" size={14} /> Activity page
                  </a>
                )}
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setActivityGuideOpen(true)}
                  title="A single page for SharePoint showing every campaign, webinar and event, each opening to its own information page. It keeps itself up to date."
                >
                  <Icon name="browser" size={14} /> {activityShare.sharePointUrl ? "Update activity page" : "Put activity on SharePoint"}
                </button>
              </>
            )}
            <HelpButton onClick={() => setTourOpen(true)} />
            <NewMenu variant="primary" onPick={startNew} />
          </div>
        </header>

        {status && <div className="banner">{status}</div>}

        {view === "analytics" ? (
          <Analytics
            allProjects={workspace.projects}
            allDesigners={workspace.designers}
            workspaces={availableWorkspaces}
            socialPosts={socialPostsForUsage}
            socialCategories={socialConfig.categories}
            campaigns={campaigns}
          />
        ) : view === "archived" ? (
          <section className="workspace-section archived-section">
            <div className="section-head">
              <h2>Archived</h2>
              <span className="muted small">
                Every team's archived work. Open a project and click Unarchive
                to bring it back.
              </span>
            </div>

            <div className="filter-quick archive-filter">
              <button
                className={
                  archiveTeamFilter === ARCHIVE_ALL_TEAMS ? "active" : ""
                }
                onClick={() => setArchiveTeamFilter(ARCHIVE_ALL_TEAMS)}
              >
                All teams ({archivedTotal})
              </button>
              {availableWorkspaces.map((w) => (
                <button
                  key={w.id}
                  className={archiveTeamFilter === w.id ? "active" : ""}
                  onClick={() => setArchiveTeamFilter(w.id)}
                >
                  {w.name} ({archivedCountsByTeam.get(w.id) ?? 0})
                </button>
              ))}
            </div>

            {archivedProjects.length === 0 ? (
              <p className="muted">
                {archivedTotal === 0
                  ? filter.trim()
                    ? `Nothing archived matches “${filter.trim()}”.`
                    : "Nothing archived yet. Archive a project from its detail window to tuck it out of the way."
                  : "Nothing archived for this team. Try All teams."}
              </p>
            ) : (
              <div className="workspace-grid">
                {archivedProjects.map((p) => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    designers={workspace.designers}
                    campaigns={campaignsByProject.get(p.id)}
                    onClick={() => openProject(p.id)}
                    // Only worth labelling when teams are mixed together —
                    // redundant once you've filtered to one.
                    teamBadge={
                      archiveTeamFilter === ARCHIVE_ALL_TEAMS
                        ? (availableWorkspaces.find(
                            (w) => w.id === p.workspaceId,
                          )?.name ?? p.workspaceId)
                        : undefined
                    }
                  />
                ))}
              </div>
            )}
          </section>
        ) : view === "myDesk" ? (
          <MyDesk
            workspace={workspace}
            currentDesignerId={sessionDesignerId}
            onOpenProject={openProject}
            notifications={myNotifications}
            reviewProjects={reviewProjects}
            onOpenNotification={(projectId, notificationId) => {
              deleteNotification(notificationId);
              openProject(projectId);
            }}
            onClearNotifications={clearAllNotifications}
            campaigns={campaigns}
            onOpenCampaign={openCampaign}
            onToggleMilestone={(campaign, milestoneId) =>
              saveCampaign({
                ...campaign,
                milestones: campaign.milestones.map((m) =>
                  m.id === milestoneId ? { ...m, done: !m.done } : m,
                ),
              })
            }
          />
        ) : view === "executiveDashboard" ? (
          <Dashboard
            workspace={workspace}
            campaigns={campaigns}
            events={events}
            socialPosts={socialPostsForUsage}
            currentDesignerId={sessionDesignerId}
            onOpenProject={openProject}
            onOpenCampaign={openCampaign}
            onOpenEvent={openEvent}
            onOpenSocialPost={openSocialPost}
            onOpenBoard={(id) => {
              setCurrentWorkspaceId(id);
              setView("board");
            }}
            onOpenView={setView}
            onOpenWebinars={openWebinars}
          />
        ) : view === "socialCalendar" ? (
          <SocialCalendar
            designers={workspace.designers}
            config={socialConfig}
            campaigns={campaigns}
            onOpenCampaign={openCampaign}
            projects={workspace.projects}
            workspaces={availableWorkspaces}
            onOpenProject={openProject}
            focusPostId={focusSocialPostId}
            onFocusHandled={() => setFocusSocialPostId(null)}
            createRequest={newPostRequest}
            onCreateHandled={() => setNewPostRequest(0)}
            exportRequest={exportRequest}
            onExportHandled={() => setExportRequest(0)}
          />
        ) : view === "events" ? (
          <EventsView
            events={events}
            campaigns={campaigns}
            designers={workspace.designers}
            projects={workspace.projects}
            workspaces={availableWorkspaces}
            onOpenProject={openProject}
            onOpenCampaign={openCampaign}
            onOpenEvent={openEvent}
            onSave={saveEvent}
            onDelete={deleteEvent}
            createRequest={newEventRequest}
            onCreateHandled={() => setNewEventRequest(0)}
            exportRequest={exportRequest}
            onExportHandled={() => setExportRequest(0)}
          />
        ) : view === "campaigns" ? (
          <CampaignsView
            campaigns={campaigns}
            categories={socialConfig.categories}
            milestoneTypes={socialConfig.milestoneTypes}
            designers={workspace.designers}
            projects={workspace.projects}
            workspaces={availableWorkspaces}
            onOpenProject={openProject}
            socialPosts={socialPostsForUsage}
            onOpenSocialPost={openSocialPost}
            onSave={saveCampaign}
            onDelete={deleteCampaign}
            onOpenCampaign={openCampaign}
            currentDesignerId={currentDesigner.id}
            speakers={speakers}
            onSaveSpeaker={saveSpeaker}
            onDeleteSpeaker={deleteSpeaker}
            createRequest={newCampaignRequest}
            onCreateHandled={() => setNewCampaignRequest(0)}
            exportRequest={exportRequest}
            onExportHandled={() => setExportRequest(0)}
            viewRequest={campaignsViewRequest}
          />
        ) : view === "board" ? (
          <>
            {/* Campaigns any of this team's live projects are feeding. */}
            <CampaignsPanel
              campaigns={campaigns}
              projects={nonArchived}
              title={`${currentWorkspaceName} campaigns`}
              subject="this team"
              onOpenCampaign={openCampaign}
              onOpenProject={openProject}
              storageKey={`waypoint.board.${currentWorkspaceId}.campaignsCollapsed`}
            />

            <section
              className={`workspace-section drop-target ${
                dropOverColumn === sessionDesignerId ? "drop-over" : ""
              }`}
              {...dropHandlers(sessionDesignerId)}
            >
              <div className="section-head">
                <div className="section-head-title">
                  <h2>My work</h2>
                  <div className="view-seg" role="group" aria-label="My work layout">
                    <button type="button" aria-pressed={myWorkView === "grid"} onClick={() => setMyWorkView("grid")}>
                      Grid
                    </button>
                    <button type="button" aria-pressed={myWorkView === "kanban"} onClick={() => setMyWorkView("kanban")}>
                      Kanban
                    </button>
                    <button type="button" aria-pressed={myWorkView === "list"} onClick={() => setMyWorkView("list")}>
                      List
                    </button>
                  </div>
                </div>
                <span className="muted small">
                  {myWorkView === "kanban"
                    ? "Everything assigned to you, by status · drag a card between columns to change its status"
                    : myWorkView === "list"
                      ? "Everything assigned to you, one line each · change a status in place, click a row to open it"
                      : "High priority first · drop cards here to claim"}
                </span>
              </div>
              {myWorkView === "kanban" ? (
                <div className="kanban">
                  {PROJECT_STATUSES.map((s) => {
                    const cards = myAllProjects.filter((p) => (p.status ?? "active") === s.value);
                    return (
                      <div
                        key={s.value}
                        className={`kanban-col drop-target ${dropOverColumn === `status:${s.value}` ? "drop-over" : ""}`}
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
                              designers={workspace.designers}
                              campaigns={campaignsByProject.get(p.id)}
                              onClick={() => openProject(p.id)}
                              compact
                              teamBadge={
                                p.workspaceId !== currentWorkspaceId
                                  ? availableWorkspaces.find((w) => w.id === p.workspaceId)?.name
                                  : undefined
                              }
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : myWorkView === "list" ? (
                <MyWorkTable
                  projects={myAllProjects}
                  designers={workspace.designers}
                  workspaces={availableWorkspaces}
                  campaignsByProject={campaignsByProject}
                  onOpen={openProject}
                  onStatusChange={setProjectStatus}
                  onOpenCampaign={openCampaign}
                />
              ) : myProjects.length === 0 ? (
                <p className="muted">
                  Nothing assigned to you yet. Hit + New → Project, drag a card from a teammate,
                  or wait for an Outlook brief to arrive.
                </p>
              ) : (
                <div className="workspace-grid">
                  {myProjects.map((p) => (
                    <ProjectCard
                      key={p.id}
                      project={p}
                      designers={workspace.designers}
                      campaigns={campaignsByProject.get(p.id)}
                      onClick={() => openProject(p.id)}
                      teamBadge={
                        p.workspaceId !== currentWorkspaceId
                          ? availableWorkspaces.find(
                              (w) => w.id === p.workspaceId,
                            )?.name
                          : undefined
                      }
                    />
                  ))}
                </div>
              )}
            </section>

            {reviewProjects.length > 0 && (
              <section className="workspace-section review-section">
                <div className="section-head">
                  <h2>For review</h2>
                  <span className="muted small">
                    Flagged for your review — still owned by the original
                    designer
                  </span>
                </div>
                <div className="workspace-grid">
                  {reviewProjects.map((p) => (
                    <ProjectCard
                      key={p.id}
                      project={p}
                      designers={workspace.designers}
                      campaigns={campaignsByProject.get(p.id)}
                      onClick={() => openProject(p.id)}
                      teamBadge={
                        p.workspaceId !== currentWorkspaceId
                          ? availableWorkspaces.find(
                              (w) => w.id === p.workspaceId,
                            )?.name
                          : undefined
                      }
                    />
                  ))}
                </div>
              </section>
            )}

            <section className={`team-section ${teamCollapsed ? "collapsed" : ""}`}>
              <div className="section-head">
                <div className="section-head-title">
                  <button
                    className="collapse-toggle"
                    onClick={() => setTeamCollapsed(!teamCollapsed)}
                    title={teamCollapsed ? "Show the team" : "Hide the team"}
                    aria-expanded={!teamCollapsed}
                  >
                    <span className={`collapse-icon ${teamCollapsed ? "" : "expanded"}`}>▶</span>
                  </button>
                  <h2>Team</h2>
                </div>
                <span className="muted small">
                  {teamCollapsed
                    ? `${otherDesigners.length} teammate${otherDesigners.length === 1 ? "" : "s"} · ${activeProjects.length} active project${activeProjects.length === 1 ? "" : "s"} · expand to reassign`
                    : "Drag a card to reassign it"}
                </span>
              </div>
              {!teamCollapsed && (
              <div className="team-columns">
                {otherDesigners.map((d) => {
                  const projects = activeProjects
                    .filter((p) => p.assigneeIds.includes(d.id))
                    .sort(sortByPriorityThenDue);
                  const visibleProjects = projects.slice(0, 5);
                  return (
                    <div
                      key={d.id}
                      className={`team-column drop-target ${
                        dropOverColumn === d.id ? "drop-over" : ""
                      }`}
                      {...dropHandlers(d.id)}
                    >
                      <header className="team-col-head">
                        <Avatar designer={d} />
                        <div>
                          <div className="team-col-name">{d.name}</div>
                          <div className="muted small">
                            {projects.length} project{projects.length === 1 ? "" : "s"}
                          </div>
                        </div>
                      </header>
                      <div className="team-col-cards">
                        {visibleProjects.length === 0 && (
                          <p className="muted small">No projects.</p>
                        )}
                        {visibleProjects.map((p) => (
                          <ProjectCard
                            key={p.id}
                            project={p}
                            designers={workspace.designers}
                            campaigns={campaignsByProject.get(p.id)}
                            onClick={() => openProject(p.id)}
                            compact
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
                <div
                  className={`team-column drop-target ${
                    dropOverColumn === "__unassigned__" ? "drop-over" : ""
                  }`}
                  {...dropHandlers(null)}
                >
                  <header className="team-col-head">
                    <span className="dot-avatar" style={{ background: "#a3a6c2" }}>
                      ??
                    </span>
                    <div>
                      <div className="team-col-name">Unassigned</div>
                      <div className="muted small">
                        {unassigned.length} project{unassigned.length === 1 ? "" : "s"}
                      </div>
                    </div>
                  </header>
                  <div className="team-col-cards">
                    {unassigned.length === 0 && (
                      <p className="muted small">Drop here to unassign.</p>
                    )}
                    {unassigned.slice(0, 5).map((p) => (
                      <ProjectCard
                        key={p.id}
                        project={p}
                        designers={workspace.designers}
                        campaigns={campaignsByProject.get(p.id)}
                        onClick={() => openProject(p.id)}
                        compact
                      />
                    ))}
                  </div>
                </div>
              </div>
              )}
            </section>

            {planningProjects.length > 0 && (
              <section className="workspace-section planning-section">
                <div className="section-head">
                  <div className="section-head-title">
                    <button
                      className="collapse-toggle"
                      onClick={() => setPlanningExpanded(!planningExpanded)}
                      title={planningExpanded ? "Collapse" : "Expand"}
                    >
                      <span className={`collapse-icon ${planningExpanded ? "expanded" : ""}`}>&#9654;</span>
                    </button>
                    <h2>Planning</h2>
                  </div>
                  <span className="muted small">
                    {planningProjects.length} project
                    {planningProjects.length === 1 ? "" : "s"} not started &middot;
                    open one to move it to Active
                  </span>
                </div>
                {planningExpanded && (
                  <div className="workspace-grid workspace-grid-scrollable">
                    {planningProjects.map((p) => (
                      <ProjectCard
                        key={p.id}
                        project={p}
                        designers={workspace.designers}
                        campaigns={campaignsByProject.get(p.id)}
                        onClick={() => openProject(p.id)}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            {pausedProjects.length > 0 && (
              <section className="workspace-section paused-section">
                <div className="section-head">
                  <div className="section-head-title">
                    <button
                      className="collapse-toggle"
                      onClick={() => setPausedExpanded(!pausedExpanded)}
                      title={pausedExpanded ? "Collapse" : "Expand"}
                    >
                      <span className={`collapse-icon ${pausedExpanded ? "expanded" : ""}`}>▶</span>
                    </button>
                    <h2>On hold</h2>
                  </div>
                  <span className="muted small">
                    {pausedProjects.length} project
                    {pausedProjects.length === 1 ? "" : "s"} on hold · open one
                    to resume
                  </span>
                </div>
                {pausedExpanded && (
                  <div className="workspace-grid workspace-grid-scrollable">
                    {pausedProjects.map((p) => (
                      <ProjectCard
                        key={p.id}
                        project={p}
                        designers={workspace.designers}
                        campaigns={campaignsByProject.get(p.id)}
                        onClick={() => openProject(p.id)}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            {completedProjects.length > 0 && (
              <section className="workspace-section completed-section">
                <div className="section-head">
                  <div className="section-head-title">
                    <button
                      className="collapse-toggle"
                      onClick={() => setCompletedExpanded(!completedExpanded)}
                      title={completedExpanded ? "Collapse" : "Expand"}
                    >
                      <span className={`collapse-icon ${completedExpanded ? "expanded" : ""}`}>▶</span>
                    </button>
                    <h2>Completed</h2>
                  </div>
                  <span className="muted small">
                    {completedProjects.length} project
                    {completedProjects.length === 1 ? "" : "s"} done
                  </span>
                </div>
                {completedExpanded && (
                  <div className="workspace-grid workspace-grid-scrollable">
                    {completedProjects.map((p) => (
                      <ProjectCard
                        key={p.id}
                        project={p}
                        designers={workspace.designers}
                        campaigns={campaignsByProject.get(p.id)}
                        onClick={() => openProject(p.id)}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            {cancelledProjects.length > 0 && (
              <section className="workspace-section cancelled-section">
                <div className="section-head">
                  <div className="section-head-title">
                    <button
                      className="collapse-toggle"
                      onClick={() => setCancelledExpanded(!cancelledExpanded)}
                      title={cancelledExpanded ? "Collapse" : "Expand"}
                    >
                      <span className={`collapse-icon ${cancelledExpanded ? "expanded" : ""}`}>▶</span>
                    </button>
                    <h2>Cancelled</h2>
                  </div>
                  <span className="muted small">
                    {cancelledProjects.length} project
                    {cancelledProjects.length === 1 ? "" : "s"} stopped before completion
                  </span>
                </div>
                {cancelledExpanded && (
                  <div className="workspace-grid workspace-grid-scrollable">
                    {cancelledProjects.map((p) => (
                      <ProjectCard
                        key={p.id}
                        project={p}
                        designers={workspace.designers}
                        campaigns={campaignsByProject.get(p.id)}
                        onClick={() => openProject(p.id)}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        ) : null}
          </>
        )}
      </main>

      {creating && (
        <CreateProjectModal
          designers={workspace.designers}
          workspaces={availableWorkspaces}
          defaultWorkspaceId={currentWorkspaceId}
          contentTypeOptions={socialConfig.contentTypes}
          defaultAssigneeId={sessionDesignerId}
          initial={createInitial}
          onCancel={() => {
            setCreating(false);
            setCreateInitial(undefined);
          }}
          onCreate={createProject}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          currentDesigner={currentDesigner}
          isSuperUser={isSuperUser}
          designers={workspace.designers}
          superUsers={superUsers}
          reviewers={reviewers}
          workspaces={availableWorkspaces}
          hubs={workspace.hubs}
          socialConfig={socialConfig}
          socialCategoryUsage={socialCategoryUsage}
          onSaveSocialConfig={firestoreSetSocialConfig}
          onRelabelSocialCategory={firestoreRelabelSocialPostCategory}
          darkMode={darkMode}
          onDarkModeChange={setDarkMode}
          textSize={textSize}
          onTextSizeChange={setTextSize}
          onUpdateWorkspaceMembers={firestoreSetWorkspaceMembers}
          onUpdatePhotoUrl={(url) =>
            firestoreSetDesignerPhotoUrl(currentDesigner.id, url)
          }
          onUpdateDesignerSuperUser={firestoreSetDesignerSuperUser}
          onUpdateDesignerReviewer={firestoreSetDesignerReviewer}
          onCreateDesigner={(name, email) =>
            firestoreCreatePlaceholderDesigner(name, email).then(() => {})
          }
          onDeleteDesigner={firestoreDeleteDesigner}
          onSaveHub={firestoreSetHub}
          onDeleteHub={firestoreDeleteHub}
          onUpdateDesignerHub={firestoreSetDesignerHub}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {notificationsOpen && (
        <NotificationsPanel
          notifications={myNotifications}
          projects={workspace.projects}
          onClose={() => setNotificationsOpen(false)}
          onOpenProject={(projectId, notificationId) => {
            deleteNotification(notificationId);
            openProject(projectId);
            setNotificationsOpen(false);
          }}
          onClearAll={clearAllNotifications}
        />
      )}

      {newWebinarOpen && (
        <NewWebinarModal
          designers={workspace.designers}
          currentDesignerId={currentDesigner.id}
          series={allSeries(campaigns)}
          onCancel={() => setNewWebinarOpen(false)}
          onCreate={(c) => {
            saveCampaign(c);
            setNewWebinarOpen(false);
            openItem("campaign", c.id, "brief");
          }}
        />
      )}

      {activityGuideOpen && (
        <SharePointGuideModal
          fileName={ACTIVITY_PAGE_FILE_NAME}
          initialUrl={activityShare.sharePointUrl}
          subject="marketing activity page"
          onDownload={() => {
            // Mint the token on the first download and publish before the
            // file goes out, so the page has something to fetch.
            const token = activityShare.shareToken ?? newShareToken();
            const data = activityPageData(campaigns, events, socialPostsForUsage, workspace.designers);
            if (!activityShare.shareToken) {
              setActivityShare((cur) => ({ ...cur, shareToken: token }));
              firestoreSetActivityShare({ shareToken: token }).catch(writeError);
            }
            publishActivityPage(token, campaigns, events, socialPostsForUsage, workspace.designers).catch(writeError);
            downloadActivityPage(token, data);
          }}
          onSave={(url) => {
            firestoreSetActivityShare({ sharePointUrl: url }).catch(writeError);
            setActivityGuideOpen(false);
          }}
          onCancel={() => setActivityGuideOpen(false)}
        />
      )}

      {tourOpen && tour && (
        <HelpTour key={tourKey} title={tour.title} steps={tour.steps} onClose={() => setTourOpen(false)} />
      )}

      {toast && (
        <div className="toast" role="status">
          <span>{toast.message}</span>
          {toast.undo && (
            <button className="toast-undo" onClick={toast.undo}>
              Undo
            </button>
          )}
          <button
            className="toast-close"
            onClick={() => setToast(null)}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

// The Help button beside + New: opens the guided tour of the page on screen.
function HelpButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="btn btn-secondary help-btn" onClick={onClick} title="How to use this page">
      <Icon name="lightbulb" size={16} /> Help
    </button>
  );
}
