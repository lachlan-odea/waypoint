import { useEffect } from "react";
import type { Notification, Project } from "../types";

type Props = {
  notifications: Notification[];
  projects: Project[];
  onClose: () => void;
  onOpenProject: (projectId: string, notificationId: string) => void;
  onClearAll: () => void;
};

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return "";
  const diff = Date.now() - then;
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function NotificationsPanel({
  notifications,
  projects,
  onClose,
  onOpenProject,
  onClearAll,
}: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sorted = [...notifications].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal notifications-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <div>
            <h2 className="modal-title">Notifications</h2>
            <div className="modal-sub">
              {sorted.length === 0
                ? "All caught up"
                : `${sorted.length} pending`}
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="modal-body">
          {sorted.length === 0 ? (
            <p className="muted">
              You'll see a notification here when someone @-mentions you.
            </p>
          ) : (
            <ul className="notif-list">
              {sorted.map((n) => {
                const project = projects.find((p) => p.id === n.projectId);
                return (
                  <li
                    key={n.id}
                    className={`notif ${n.read ? "read" : "unread"}`}
                  >
                    <button
                      className="notif-btn"
                      onClick={() => onOpenProject(n.projectId, n.id)}
                    >
                      <div className="notif-head">
                        <span>
                          <strong>{n.fromName}</strong>{" "}
                          {n.kind === "like"
                            ? "liked your comment"
                            : n.kind === "reply"
                              ? "replied to your comment"
                              : `mentioned you in a ${n.kind}`}
                          {project ? (
                            <>
                              {" · "}
                              <span className="muted">{project.title}</span>
                            </>
                          ) : null}
                        </span>
                        <span className="muted small">
                          {timeAgo(n.createdAt)}
                        </span>
                      </div>
                      <p className="notif-snippet">{n.snippet}</p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {sorted.length > 0 && (
          <footer className="modal-foot">
            <button onClick={onClearAll}>Clear all</button>
          </footer>
        )}
      </div>
    </div>
  );
}
