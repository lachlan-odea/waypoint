import { useEffect, useMemo, useState } from "react";
import type {
  Notification,
  Project,
  ProjectStatus,
  StorageConfig,
  Workspace,
} from "./types";
import {
  clearSession,
  loadConfig,
  loadSession,
  loadWorkspace,
  saveConfig,
  saveSession,
} from "./storage";
import { ensureSignedIn } from "./firebase";
import {
  deleteNotification as firestoreDeleteNotification,
  deleteNotificationsForRecipient as firestoreDeleteNotificationsForRecipient,
  deleteProject as firestoreDeleteProject,
  firestoreIsEmpty,
  seedFirestore,
  setDesigner as firestoreSetDesigner,
  setNotification as firestoreSetNotification,
  setProject as firestoreSetProject,
  subscribeWorkspace,
} from "./firestore";
import { seedWorkspace } from "./seed";
import { Sidebar, type SidebarView } from "./components/Sidebar";
import { ProjectCard } from "./components/ProjectCard";
import { ProjectDetailModal } from "./components/ProjectDetailModal";
import { NotificationsPanel } from "./components/NotificationsPanel";
import { CreateProjectModal } from "./components/CreateProjectModal";
import { SettingsModal } from "./components/SettingsModal";
import { Analytics } from "./components/Analytics";
import { Login } from "./components/Login";
import { Avatar } from "./components/Avatar";
import { readDraggedProjectId } from "./dnd";
import { REVIEWER_IDS } from "./constants";
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
  const [config, setConfig] = useState<StorageConfig>(() => loadConfig());
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [sessionDesignerId, setSessionDesignerId] = useState<string | null>(
    () => loadSession()?.designerId ?? null
  );
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

  // Sign in to Firestore, run the one-off JSONBin migration if Firestore is
  // empty, then live-subscribe to designers / projects / notifications.
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    setStatus("Connecting…");

    (async () => {
      try {
        await ensureSignedIn();
        if (cancelled) return;

        if (await firestoreIsEmpty()) {
          if (cancelled) return;
          // First-run seed: prefer existing JSONBin data so the team keeps
          // their history; fall back to the bundled seed for new installs.
          if (config.mode === "jsonbin" && config.binId && config.apiKey) {
            setStatus("Migrating from JSONBin…");
            try {
              const imported = await loadWorkspace(config);
              await seedFirestore(imported);
            } catch (err) {
              console.error("JSONBin migration failed; seeding defaults.", err);
              await seedFirestore(seedWorkspace);
            }
          } else {
            await seedFirestore(seedWorkspace);
          }
        }

        if (cancelled) return;
        unsubscribe = subscribeWorkspace(
          (ws) => {
            if (cancelled) return;
            setWorkspace({
              currentDesignerId: "",
              designers: ws.designers,
              projects: ws.projects,
              notifications: ws.notifications,
            });
            setStatus("");
          },
          (err) => {
            if (cancelled) return;
            console.error(err);
            setStatus(`Sync error: ${err.message}`);
          },
        );
      } catch (err) {
        if (cancelled) return;
        console.error(err);
        setStatus(
          `Sign-in failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    })();

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [config]);

  // If the workspace gets reloaded and the session points at a designer that
  // no longer exists, drop the session.
  useEffect(() => {
    if (!workspace || !sessionDesignerId) return;
    const exists = workspace.designers.some((d) => d.id === sessionDesignerId);
    if (!exists) {
      clearSession();
      setSessionDesignerId(null);
    }
  }, [workspace, sessionDesignerId]);

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

  const visibleProjects = useMemo(() => {
    if (!workspace) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return workspace.projects;
    return workspace.projects.filter((p) =>
      [p.title, p.client, p.brand, p.contentType]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [workspace, filter]);

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
    () => workspace?.designers.filter((d) => d.id !== sessionDesignerId) ?? [],
    [workspace, sessionDesignerId]
  );

  const myNotifications = useMemo(
    () =>
      workspace
        ? workspace.notifications.filter((n) => n.recipientId === sessionDesignerId)
        : [],
    [workspace, sessionDesignerId],
  );

  const unreadNotifications = myNotifications.length;

  const isReviewer = useMemo(
    () =>
      sessionDesignerId
        ? (REVIEWER_IDS as readonly string[]).includes(sessionDesignerId)
        : false,
    [sessionDesignerId],
  );

  const reviewProjects = useMemo(
    () =>
      isReviewer
        ? activeProjects
            .filter((p) => p.flaggedForReview)
            .sort(sortByPriorityThenDue)
        : [],
    [activeProjects, isReviewer],
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

  function flagForReview(projectId: string, flagged: boolean) {
    const project = findProject(projectId);
    if (!project) return;
    firestoreSetProject({ ...project, flaggedForReview: flagged }).catch(
      writeError,
    );
  }

  function login(designerId: string) {
    saveSession({ designerId });
    setSessionDesignerId(designerId);
    setView("workspace");
  }

  function logout() {
    clearSession();
    setSessionDesignerId(null);
    setOpenProjectId(null);
    setCreating(false);
    setSettingsOpen(false);
    setView("workspace");
  }

  function updateDesignerPin(newPin: string) {
    if (!sessionDesignerId) return;
    const designer = workspace?.designers.find(
      (d) => d.id === sessionDesignerId,
    );
    if (!designer) return;
    firestoreSetDesigner({ ...designer, pin: newPin }).catch(writeError);
  }

  if (!workspace) {
    return (
      <div className="boot">
        <p>{status || "Loading workspace…"}</p>
      </div>
    );
  }

  if (!currentDesigner) {
    return <Login designers={workspace.designers} onLogin={login} />;
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
        onToggleCollapsed={() => setCollapsed((c) => !c)}
        onSelectView={setView}
        onNewProject={() => {
          setCreateInitial(undefined);
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
                  <span className="topbar-sub"> — workspace</span>
                </>
              )}
            </h1>
            <p className="muted small">
              {view === "analytics"
                ? `${workspace.projects.length} project${workspace.projects.length === 1 ? "" : "s"} across the team`
                : view === "archived"
                  ? `${archivedProjects.length} archived project${archivedProjects.length === 1 ? "" : "s"}`
                  : `${myProjects.length} project${myProjects.length === 1 ? "" : "s"} assigned`}
              {" · "}
              {config.mode === "jsonbin" && config.binId ? "JSONBin synced" : "local only"}
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
                setCreateInitial(undefined);
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
            projects={workspace.projects}
            designers={workspace.designers}
            canViewByDesigner={isReviewer}
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
          currentDesignerId={currentDesigner.id}
          currentDesignerName={currentDesigner.name}
          onClose={() => setOpenProjectId(null)}
          onChange={(updater) => updateProject(openProject.id, updater)}
          onFlagForReview={(flagged) => flagForReview(openProject.id, flagged)}
          onStatusChange={(status) => setProjectStatus(openProject.id, status)}
          onArchiveToggle={(archived) => {
            setProjectArchived(openProject.id, archived);
            if (archived) setOpenProjectId(null);
          }}
          onDelete={() => deleteProject(openProject.id)}
          onNotify={addNotifications}
        />
      )}

      {creating && (
        <CreateProjectModal
          designers={workspace.designers}
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
          config={config}
          currentDesigner={currentDesigner}
          onSaveStorage={(cfg) => {
            saveConfig(cfg);
            setConfig(cfg);
          }}
          onChangePin={updateDesignerPin}
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
    </div>
  );
}
