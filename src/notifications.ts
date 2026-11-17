import type { Notification } from "./types";

// Phrasing for a notification, shared by the bell panel and the My Desk
// Notifications section so the two can't describe the same event differently.
export function describeNotification(kind: Notification["kind"]): string {
  switch (kind) {
    case "like":
      return "liked your comment";
    case "reply":
      return "replied to your comment";
    case "milestone":
      return "mentioned you in a milestone";
    case "task":
      return "assigned you a task";
    case "comment":
    default:
      return "mentioned you in a comment";
  }
}

// Short label for the kind chip on a notification row.
export function notificationTag(kind: Notification["kind"]): string {
  switch (kind) {
    case "like":
      return "Like";
    case "reply":
      return "Reply";
    case "milestone":
      return "Milestone";
    case "task":
      return "Task";
    case "comment":
    default:
      return "Mention";
  }
}

// Newest first. Notifications carry an ISO createdAt, so a string compare is
// a valid chronological sort.
export function sortNotifications(list: Notification[]): Notification[] {
  return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
