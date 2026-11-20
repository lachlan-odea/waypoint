import { useMemo, useState } from "react";
import type { Project } from "../types";
import {
  basecampErrorMessage,
  basecampSyncNow,
  formatSyncTime,
  syncSummaryText,
  useBasecampProjects,
  useBasecampStatus,
  type BasecampProject,
} from "../basecamp";
import { Icon } from "./Icon";
import "../basecamp.css";

type Props = {
  // Every Waypoint project this person can see, to name the one a Basecamp
  // project was created from.
  projects: Project[];
  isSuperUser: boolean;
  onOpenProject: (projectId: string) => void;
  onOpenSettings: () => void;
};

type StatusFilter = "active" | "archived";

function day(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

// The other team's Basecamp projects, read hourly. Each row opens in
// Basecamp; one that came from a Waypoint project also links back to it.
export function BasecampView({ projects, isSuperUser, onOpenProject, onOpenSettings }: Props) {
  const { status, error: statusError } = useBasecampStatus();
  const { projects: mirrored, error: projectsError } = useBasecampProjects();
  const [filter, setFilter] = useState<StatusFilter>("active");
  const [search, setSearch] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);

  const all = useMemo(() => mirrored ?? [], [mirrored]);
  const counts = useMemo(
    () => ({
      active: all.filter((p) => p.status === "active").length,
      archived: all.filter((p) => p.status === "archived").length,
    }),
    [all],
  );
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all
      .filter((p) => p.status === filter)
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q))
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  }, [all, filter, search]);
  const waypointTitles = useMemo(() => new Map(projects.map((p) => [p.id, p.title])), [projects]);

  async function syncNow() {
    setSyncing(true);
    setNote(null);
    try {
      setNote({ text: syncSummaryText(await basecampSyncNow()), bad: false });
    } catch (err) {
      setNote({ text: basecampErrorMessage(err), bad: true });
    } finally {
      setSyncing(false);
    }
  }

  const error = statusError ?? projectsError;
  const connected = status?.connected === true;

  return (
    <section className="workspace-section bc-section">
      <div className="section-head">
        <h2>Basecamp projects</h2>
        <span className="muted small">
          {connected
            ? `${status.accountName ?? "Basecamp"} · ${
                status.lastSyncAt ? `last read ${formatSyncTime(status.lastSyncAt)}` : "not read yet"
              } · refreshed every hour`
            : "Projects from the team's Basecamp account"}
        </span>
        {connected && isSuperUser && (
          <button className="btn-mini bc-sync" onClick={() => void syncNow()} disabled={syncing}>
            {syncing ? "Reading Basecamp…" : "Sync now"}
          </button>
        )}
      </div>

      {note && (
        <p className={note.bad ? "soc-publish-error" : "soc-publish-note"} role={note.bad ? "alert" : "status"}>
          {note.text}
        </p>
      )}
      {connected && status.lastSyncError && !note && <p className="field-hint warn">{status.lastSyncError}</p>}

      {error ? (
        <p className="field-hint warn">
          Basecamp's projects couldn't be read ({error}). The Firestore rules for the Basecamp collections
          probably haven't been deployed yet.
        </p>
      ) : status === null || mirrored === null ? (
        <p className="muted">Loading Basecamp…</p>
      ) : !connected && all.length === 0 ? (
        <div className="bc-empty">
          <p className="muted">
            Basecamp isn't connected yet. Once it is, every project in the team's Basecamp account shows
            here, and Waypoint projects with Sync to Basecamp switched on are created there.
          </p>
          {isSuperUser ? (
            <button className="primary" onClick={onOpenSettings}>
              Connect in Settings →
            </button>
          ) : (
            <p className="muted small">A super user connects it from Settings.</p>
          )}
        </div>
      ) : (
        <>
          {!connected && (
            <p className="field-hint warn">
              Basecamp is disconnected, so this list is as it was when last read.
            </p>
          )}
          <div className="bc-controls">
            <div className="filter-quick">
              <button className={filter === "active" ? "active" : ""} onClick={() => setFilter("active")}>
                Active ({counts.active})
              </button>
              <button className={filter === "archived" ? "active" : ""} onClick={() => setFilter("archived")}>
                Archived ({counts.archived})
              </button>
            </div>
            <input
              className="search"
              placeholder="Filter Basecamp projects…"
              aria-label="Filter Basecamp projects"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {rows.length === 0 ? (
            <p className="muted">
              {search.trim()
                ? `No ${filter} Basecamp project matches “${search.trim()}”.`
                : filter === "active"
                  ? "There are no active projects in Basecamp."
                  : "Nothing is archived in Basecamp."}
            </p>
          ) : (
            <div className="li-table-wrap">
              <table className="li-table bc-table">
                <thead>
                  <tr>
                    <th scope="col">Project</th>
                    <th scope="col">In Waypoint</th>
                    <th scope="col">Dates</th>
                    <th scope="col">Updated</th>
                    <th scope="col" aria-label="Open in Basecamp" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <BasecampRow
                      key={p.id}
                      project={p}
                      waypointTitle={p.waypointProjectId ? waypointTitles.get(p.waypointProjectId) : undefined}
                      onOpenProject={onOpenProject}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function BasecampRow({
  project: p,
  waypointTitle,
  onOpenProject,
}: {
  project: BasecampProject;
  waypointTitle: string | undefined;
  onOpenProject: (projectId: string) => void;
}) {
  const dates = [day(p.startDate), day(p.endDate)].filter(Boolean).join(" – ");
  return (
    <tr>
      <td>
        <span className="bc-name">{p.name}</span>
        {p.description && <span className="bc-desc">{p.description}</span>}
      </td>
      <td>
        {p.waypointProjectId ? (
          waypointTitle !== undefined ? (
            <button type="button" className="link-btn" onClick={() => onOpenProject(p.waypointProjectId as string)}>
              {waypointTitle || "Untitled project"}
            </button>
          ) : (
            // Deleted here, or one this person can't see.
            <span className="muted">Linked project</span>
          )
        ) : (
          <span className="muted">—</span>
        )}
      </td>
      <td className="bc-nowrap">{dates || <span className="muted">—</span>}</td>
      <td className="bc-nowrap">{day(p.updatedAt)}</td>
      <td className="bc-nowrap">
        <a className="bc-open" href={p.appUrl} target="_blank" rel="noopener noreferrer">
          Open in Basecamp
          <Icon name="external-link" size={13} />
        </a>
      </td>
    </tr>
  );
}
