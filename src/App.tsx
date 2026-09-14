import { useEffect, useMemo, useState } from "react";
import type {
  Notification,
  Project,
  ProjectStatus,
  WorkspaceData,
} from "./types";
import { auth, observeAuth, signOut as fbSignOut } from "./firebase";
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
  subscribeWorkspace,
} from "./firestore";
import { Sidebar, type SidebarView } from "./components/Sidebar";
import { ProjectCard } from "./components/ProjectCard";
import { ProjectDetailModal } from "./components/ProjectDetailModal";
import { NotificationsPanel } from "./components/NotificationsPanel";
import { CreateProjectModal } from "./components/CreateProjectModal";
import { SettingsModal } from "./components/SettingsModal";
import { Analytics } from "./components/Analytics";
import { Dashboard } from "./components/Dashboard";
import { MyDesk } from "./components/MyDesk";
import { SocialCalendar } from "./components/SocialCalendar";
import { Login } from "./components/Login";
import { ProfileSetup } from "./components/ProfileSetup";
import { Avatar } from "./components/Avatar";
import { readDraggedProjectId } from "./dnd";
import { contentTypesSearchText } from "./contentTypes";
import {
  DEFAULT_WORKSPACE_ID,
  SUPER_USER_EMAILS,
} from "./constants";
import "./App.css";

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
  const [view, setView] = useState<SidebarView>("myDesk");
  const [openProjectId, setOpenProjectId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createInitial, setCreateInitial] = useState<Partial<Project> | undefined>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
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
  useEffect(() => {
    return observeAuth((user) => {
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
      const url = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
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
      setOpenProjectId(id);
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
      const url = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
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
    setOpenProjectId(null);
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
    setOpenProjectId(project.id);
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
    setOpenProjectId(null);
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
    return <Login onSignedIn={() => { /* auth state listener does the rest */ }} />;
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

  const openProject = openProjectId
    ? workspace.projects.find((p) => p.id === openProjectId)
    : null;

  const unassigned = activeProjects
    .filter((p) => p.assigneeIds.length === 0)
    .sort(sortByPriorityThenDue);

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
    <div className="app">
      <Sidebar
        currentDesigner={currentDesigner}
        collapsed={collapsed}
        view={view}
        unreadNotifications={unreadNotifications}
        workspaces={availableWorkspaces}
        hubs={workspace.hubs}
        currentWorkspaceId={currentWorkspaceId}
        onSelectWorkspace={(id) => {
          setCurrentWorkspaceId(id);
          setView("board");
        }}
        onDropProjectOnWorkspace={moveProjectToWorkspace}
        onToggleCollapsed={() => setCollapsed((c) => !c)}
        onSelectView={setView}
        onNewProject={() => {
          setCreateInitial({ workspaceId: currentWorkspaceId });
          setCreating(true);
        }}
        onOpenNotifications={() => setNotificationsOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onLogout={logout}
      />

      <main className="main">
        <header className="topbar">
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
                ? "Filter by team, date range, and export — see the filter row below"
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
                      ? "View all projects, deadlines, and recent activity"
                      : view === "socialCalendar"
                        ? "Plan and track posts across the CargoWise and WiseTech channels"
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
            <button
              className="primary"
              onClick={() => {
                setCreateInitial({ workspaceId: currentWorkspaceId });
                setCreating(true);
              }}
            >
              + New project
            </button>
          </div>
        </header>

        {status && <div className="banner">{status}</div>}

        {view === "analytics" ? (
          <Analytics
            allProjects={workspace.projects}
            allDesigners={workspace.designers}
            workspaces={availableWorkspaces}
            canViewByDesigner={isSuperUser}
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
                    onClick={() => setOpenProjectId(p.id)}
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
            onOpenProject={setOpenProjectId}
            notifications={myNotifications}
            reviewProjects={reviewProjects}
            onOpenNotification={(projectId, notificationId) => {
              deleteNotification(notificationId);
              setOpenProjectId(projectId);
            }}
            onClearNotifications={clearAllNotifications}
          />
        ) : view === "executiveDashboard" ? (
          <Dashboard
            workspace={workspace}
            currentDesignerId={sessionDesignerId}
            onOpenProject={setOpenProjectId}
          />
        ) : view === "socialCalendar" ? (
          <SocialCalendar
            designers={workspace.designers}
            projects={workspace.projects}
            workspaces={availableWorkspaces}
            onOpenProject={setOpenProjectId}
            focusPostId={focusSocialPostId}
            onFocusHandled={() => setFocusSocialPostId(null)}
          />
        ) : view === "board" ? (
          <>
            <section
              className={`workspace-section drop-target ${
                dropOverColumn === sessionDesignerId ? "drop-over" : ""
              }`}
              {...dropHandlers(sessionDesignerId)}
            >
              <div className="section-head">
                <h2>My work</h2>
                <span className="muted small">
                  High priority first · drop cards here to claim
                </span>
              </div>
              {myProjects.length === 0 ? (
                <p className="muted">
                  Nothing assigned to you yet. Hit + New project, drag a card from a teammate,
                  or wait for an Outlook brief to arrive.
                </p>
              ) : (
                <div className="workspace-grid">
                  {myProjects.map((p) => (
                    <ProjectCard
                      key={p.id}
                      project={p}
                      designers={workspace.designers}
                      onClick={() => setOpenProjectId(p.id)}
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
                      onClick={() => setOpenProjectId(p.id)}
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

            <section className="team-section">
              <div className="section-head">
                <h2>Team</h2>
                <span className="muted small">Drag a card to reassign it</span>
              </div>
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
                            onClick={() => setOpenProjectId(p.id)}
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
                    <span className="dot-avatar" style={{ background: "#94a3b8" }}>
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
                        onClick={() => setOpenProjectId(p.id)}
                        compact
                      />
                    ))}
                  </div>
                </div>
              </div>
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
                        onClick={() => setOpenProjectId(p.id)}
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
                        onClick={() => setOpenProjectId(p.id)}
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
                        onClick={() => setOpenProjectId(p.id)}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        ) : null}
      </main>

      {openProject && (
        <ProjectDetailModal
          project={openProject}
          designers={workspace.designers}
          reviewers={reviewers}
          workspaces={availableWorkspaces}
          currentDesignerId={currentDesigner.id}
          currentDesignerName={currentDesigner.name}
          onClose={() => setOpenProjectId(null)}
          onChange={(updater) => updateProject(openProject.id, updater)}
          onSetReviewers={(reviewerIds) =>
            setProjectReviewers(openProject.id, reviewerIds)
          }
          onStatusChange={(status) => setProjectStatus(openProject.id, status)}
          onArchiveToggle={(archived) => {
            setProjectArchived(openProject.id, archived);
            if (archived) setOpenProjectId(null);
          }}
          onDelete={() => deleteProject(openProject.id)}
          onNotify={addNotifications}
          onMoveToWorkspace={(workspaceId) =>
            moveProjectToWorkspace(openProject.id, workspaceId)
          }
          onOpenSocialPost={(postId) => {
            setOpenProjectId(null);
            setFocusSocialPostId(postId);
            setView("socialCalendar");
          }}
        />
      )}

      {creating && (
        <CreateProjectModal
          designers={workspace.designers}
          workspaces={availableWorkspaces}
          defaultWorkspaceId={currentWorkspaceId}
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
            setOpenProjectId(projectId);
            setNotificationsOpen(false);
          }}
          onClearAll={clearAllNotifications}
        />
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
