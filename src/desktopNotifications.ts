import type { Notification, Project } from "./types";
import { describeNotification } from "./notifications";

// Desktop alerts through the browser's Notification API: a Windows (or
// macOS) notification with the Waypoint icon when someone @-mentions you,
// replies to you, likes your comment or hands you a task while the app is
// open. Clicking it brings Waypoint to the front and opens the project.
//
// Browsers only grant the permission from a click, so the switch lives in
// the Notifications panel; the preference is per browser.

const PREF_KEY = "waypoint.desktopAlerts";

export function desktopAlertsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function desktopAlertsPermission(): NotificationPermission | "unsupported" {
  return desktopAlertsSupported() ? Notification.permission : "unsupported";
}

// On when the person has switched it on here and the browser allows it.
export function desktopAlertsEnabled(): boolean {
  if (!desktopAlertsSupported() || Notification.permission !== "granted") return false;
  try {
    return localStorage.getItem(PREF_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setDesktopAlertsPreference(on: boolean): void {
  try {
    localStorage.setItem(PREF_KEY, on ? "on" : "off");
  } catch {
    // per-browser preference only
  }
}

// Ask the browser, from a click. Resolves to whether alerts are now on.
export async function enableDesktopAlerts(): Promise<boolean> {
  if (!desktopAlertsSupported()) return false;
  let permission = Notification.permission;
  if (permission === "default") permission = await Notification.requestPermission();
  if (permission !== "granted") return false;
  setDesktopAlertsPreference(true);
  return true;
}

function iconUrl(): string {
  const base = import.meta.env.BASE_URL || "/";
  return `${window.location.origin}${base}app-icon.png`;
}

// Show one alert for a Waypoint notification. The title is who did what,
// the body the snippet and the project.
export function showDesktopAlert(
  n: Notification,
  project: Project | undefined,
  onClick: () => void,
): void {
  if (!desktopAlertsEnabled()) return;
  const title = `${n.fromName} ${describeNotification(n.kind)}`;
  const body = [n.snippet, project?.title ? `Waypoint · ${project.title}` : "Waypoint"].filter(Boolean).join("\n");
  try {
    const alert = new Notification(title, {
      body,
      icon: iconUrl(),
      badge: iconUrl(),
      tag: `waypoint-${n.id}`,
      silent: false,
    });
    alert.onclick = () => {
      window.focus();
      onClick();
      alert.close();
    };
  } catch (err) {
    console.warn("Couldn't show a desktop alert", err);
  }
}
