import { useEffect, useState } from "react";
import type { Notification, Project } from "../types";
import { timeAgo } from "../dates";
import { describeNotification, sortNotifications } from "../notifications";
import {
  desktopAlertsEnabled,
  desktopAlertsPermission,
  desktopAlertsSupported,
  enableDesktopAlerts,
  setDesktopAlertsPreference,
} from "../desktopNotifications";

type Props = {
  notifications: Notification[];
  projects: Project[];
  onClose: () => void;
  onOpenProject: (projectId: string, notificationId: string) => void;
  onClearAll: () => void;
  // Membership emails (Designer.emailAlerts): sent when you're added to a
  // project, campaign, webinar or event. The address they go to, if the
  // profile has one.
  emailAlertsOn: boolean;
  emailAddress?: string;
  onSetEmailAlerts: (on: boolean) => Promise<void>;
};

export function NotificationsPanel({
  notifications,
  projects,
  onClose,
  onOpenProject,
  onClearAll,
  emailAlertsOn,
  emailAddress,
  onSetEmailAlerts,
}: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sorted = sortNotifications(notifications);
  // Desktop alerts: the browser permission plus a per-browser preference.
  const [alertsOn, setAlertsOn] = useState(desktopAlertsEnabled());
  const [alertsBusy, setAlertsBusy] = useState(false);
  const permission = desktopAlertsPermission();
  async function toggleAlerts() {
    if (alertsOn) {
      setDesktopAlertsPreference(false);
      setAlertsOn(false);
      return;
    }
    setAlertsBusy(true);
    const ok = await enableDesktopAlerts();
    setAlertsOn(ok);
    setAlertsBusy(false);
  }

  // Email alerts: a flag on the designer doc, read by the Cloud Functions.
  const [emailBusy, setEmailBusy] = useState(false);
  async function toggleEmail() {
    setEmailBusy(true);
    try {
      await onSetEmailAlerts(!emailAlertsOn);
    } catch (err) {
      console.error(err);
    } finally {
      setEmailBusy(false);
    }
  }

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
          {desktopAlertsSupported() && (
            <div className="notif-alerts">
              <div>
                <b>Desktop alerts</b>
                <span className="muted small">
                  {permission === "denied"
                    ? "Blocked by the browser. Allow notifications for this site in its settings to turn them on."
                    : alertsOn
                      ? "A Windows notification when someone mentions you, replies to you, likes your comment or hands you a task while Waypoint is open. Click one to jump to the project."
                      : "Get a Windows notification when someone mentions you while Waypoint is open."}
                </span>
              </div>
              <button
                type="button"
                className={`btn btn-sm ${alertsOn ? "btn-secondary" : "btn-primary"}`}
                onClick={toggleAlerts}
                disabled={alertsBusy || permission === "denied"}
                aria-pressed={alertsOn}
              >
                {alertsOn ? "Turn off" : "Turn on"}
              </button>
            </div>
          )}
          <div className="notif-alerts">
            <div>
              <b>Email alerts</b>
              <span className="muted small">
                {emailAlertsOn
                  ? `An email${emailAddress ? ` to ${emailAddress}` : ""} when someone assigns you a project, asks you to review one, or adds you to a campaign, webinar or event.`
                  : "Get an email when you're added to a project, campaign, webinar or event."}
              </span>
            </div>
            <button
              type="button"
              className={`btn btn-sm ${emailAlertsOn ? "btn-secondary" : "btn-primary"}`}
              onClick={toggleEmail}
              disabled={emailBusy}
              aria-pressed={emailAlertsOn}
            >
              {emailAlertsOn ? "Turn off" : "Turn on"}
            </button>
          </div>
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