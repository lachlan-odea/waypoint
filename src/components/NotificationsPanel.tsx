import { useEffect } from "react";
import type { Notification, Project } from "../types";
import { timeAgo } from "../dates";
import { describeNotification, sortNotifications } from "../notifications";

type Props = {
  notifications: Notification[];
  projects: Project[];
  onClose: () => void;
  onOpenProject: (projectId: string, notificationId: string) => void;
  onClearAll: () => void;
};

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

  const sorted = sortNotifications(notifications);

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
            <Icon name="close" size={16} />
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
                          {describeNotification(n.kind)}
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

import { Icon } from "./Icon";