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
  seedWorkspacesIfMissing,
  setDesignerPhotoUrl as firestoreSetDesignerPhotoUrl,
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
import { Login } from "./components/Login";
import { ProfileSetup } from "./components/ProfileSetup";
import { Avatar } from "./components/Avatar";
import { readDraggedProjectId } from "./dnd";
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
  const [view, setView] = useState<SidebarView>("workspace");
  const [openProjectId, setOpenProjectId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createInitial, setCreateInitial] = useState<Partial<Project> | undefined>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState<string>("");
  const [dropOverColumn, setDropOverColumn] = useState<string | null>(null);
  // Transient banner shown after a project is moved between workspaces.
  // `undo` reverts the move and clears the toast.
  const [toast, setToast] = useState<{
    message: string;
    undo: () => void;
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
  }, [sessionDesignerId]);

  // Live-subscribe to Firestore once we have a signed-in user. The
  // subscription stays up for the lifetime of the session and tears down on
  // sign-out.
  useEffect(() => {
    if (!sessionDesignerId) {
      setWorkspace(null);
      return;
    }
    setStatus("Loading workspace…");
    const unsubscribe = subscribeWorkspace(
      (ws) => {
        setWorkspace({
          currentDesignerId: "",
          designers: ws.designers,
          workspaces: ws.workspaces,
          projects: ws.projects,
          notifications: ws.notifications,
        });
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
      [p.title, p.client, p.brand, p.contentType]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [workspaceProjects, filter]);

  const isAdmin = useMemo(() => {
    const email = currentDesigner?.email?.toLowerCase();
    return !!email && (SUPER_USER_EMAILS as readonly string[]).includes(email);
  }, [currentDesigner]);

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

  const archivedProjects = useMemo(
    () =>
      visibleProjects
        .filter((p) => p.archived)
        .sort(sortByPriorityThenDue),
    [visibleProjects],
  );

  const myProjects = useMemo(
    () =>
      activeProjects
        .filter((p) =>
          sessionDesignerId ? p.assigneeIds.includes(sessionDesignerId) : false,
        )
        .sort(sortByPriorityThenDue),
    [activeProjects, sessionDesignerId]
  );

  const otherDesigners = useMemo(
    () => workspaceDesigners.filter((d) => d.id !== sessionDesignerId),
    [workspaceDesigners, sessionDesignerId],
  );

  const myNotifications = useMemo(
    () =>
      workspace
        ? workspace.notifications.filter(
            (n) =>
              n.recipientId === sessionDesignerId &&
              n.workspaceId === currentWorkspaceId,
          )
        : [],
    [workspace, sessionDesignerId, currentWorkspaceId],
  );

  const unreadNotifications = myNotifications.length;

  // Super user is the canonical "elevated permissions" role: super users see
  // by-designer analytics and can be picked as reviewers on any project. The
  // flag lives on the Designer doc, with SUPER_USER_EMAILS as a bootstrap so
  // there's always at least one super user able to grant the flag to others.
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

  // A project lands in your "For review" queue when your own UID is in its
  // reviewerIds list. No separate role check needed — non-super-users never
  // appear in any project's reviewerIds anyway.
  const reviewProjects = useMemo(
    () =>
      sessionDesignerId
        ? activeProjects
            .filter((p) => p.reviewerIds?.includes(sessionDesignerId))
            .sort(sortByPriorityThenDue)
        : [],
    [activeProjects, sessionDesignerId],
  );

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
    setView("workspace");
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
        <p>{status || "Loading workspace…"}</p>
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
        currentWorkspaceId={currentWorkspaceId}
        onSelectWorkspace={(id) => {
          setCurrentWorkspaceId(id);
          setView("workspace");
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
                ? "Filter by workspace, date range, and export — see the filter row below"
                : view === "archived"
                  ? `${archivedProjects.length} archived project${archivedProjects.length === 1 ? "" : "s"} in ${currentWorkspaceName}`
                  : `${myProjects.length} project${myProjects.length === 1 ? "" : "s"} assigned · ${currentWorkspaceName}`}
              {" · live"}
            </p>
          </div>
          <div className="topbar-actions">
            {(view === "workspace" || view === "archived") && (
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
                Open a project and click Unarchive to bring it back.
              </span>
            </div>
            {archivedProjects.length === 0 ? (
              <p className="muted">
                Nothing archived yet. Archive a project from its detail window
                to tuck it out of the way.
              </p>
            ) : (
              <div className="workspace-grid">
                {archivedProjects.map((p) => (
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
        ) : (
          <>
            <section
              className={`workspace-section drop-target ${
                dropOverColumn === sessionDesignerId ? "drop-over" : ""
              }`}
              {...dropHandlers(sessionDesignerId)}
            >
              <div className="section-head">
                <h2>My workspace</h2>
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
                        {projects.length === 0 && (
                          <p className="muted small">No projects.</p>
                        )}
                        {projects.map((p) => (
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
                    {unassigned.map((p) => (
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

            {pausedProjects.length > 0 && (
              <section className="workspace-section paused-section">
                <div className="section-head">
                  <h2>Paused</h2>
                  <span className="muted small">
                    {pausedProjects.length} project
                    {pausedProjects.length === 1 ? "" : "s"} on hold · open one
                    to resume
                  </span>
                </div>
                <div className="workspace-grid">
                  {pausedProjects.map((p) => (
                    <ProjectCard
                      key={p.id}
                      project={p}
                      designers={workspace.designers}
                      onClick={() => setOpenProjectId(p.id)}
                    />
                  ))}
                </div>
              </section>
            )}

            {completedProjects.length > 0 && (
              <section className="workspace-section completed-section">
                <div className="section-head">
                  <h2>Completed</h2>
                  <span className="muted small">
                    {completedProjects.length} project
                    {completedProjects.length === 1 ? "" : "s"} done
                  </span>
                </div>
                <div className="workspace-grid">
                  {completedProjects.map((p) => (
                    <ProjectCard
                      key={p.id}
                      project={p}
                      designers={workspace.designers}
                      onClick={() => setOpenProjectId(p.id)}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      {openProject && (
        <ProjectDetailModal
          project={openProject}
          designers={workspace.designers}
          assignableDesigners={workspaceDesigners}
          superUsers={superUsers}
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
        />
      )}

      {creating && (
        <CreateProjectModal
          designers={workspaceDesigners}
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
          isAdmin={isAdmin}
          isSuperUser={isSuperUser}
          designers={workspace.designers}
          superUsers={superUsers}
          workspaces={availableWorkspaces}
          onUpdateWorkspaceMembers={firestoreSetWorkspaceMembers}
          onUpdatePhotoUrl={(url) =>
            firestoreSetDesignerPhotoUrl(currentDesigner.id, url)
          }
          onUpdateDesignerSuperUser={firestoreSetDesignerSuperUser}
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
          <button className="toast-undo" onClick={toast.undo}>
            Undo
          </button>
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
