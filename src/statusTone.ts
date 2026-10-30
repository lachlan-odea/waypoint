import type {
  EventStatus,
  Priority,
  ProjectStatus,
  SocialPostStatus,
} from "./types";
import type { CampaignPhase } from "./campaigns";

// The design system's eight work statuses (`.wp-status.<tone>` in App.css,
// `--wp-status-*` tokens), and how each of the app's own status sets maps
// onto them. Pills take a light background with dark ink from these; the
// darker swatch colours on the status constants stay for dots, edges and
// chart fills.
export type WpTone =
  | "draft"
  | "planning"
  | "in-progress"
  | "review"
  | "scheduled"
  | "live"
  | "complete"
  | "blocked";

export function socialStatusTone(status: SocialPostStatus | undefined): WpTone {
  switch (status) {
    case "pending":
      return "review";
    case "scheduled":
      return "scheduled";
    case "published":
      return "live";
    case "cancelled":
      return "blocked";
    case "onHold":
    case "backlog":
    case "draft":
    default:
      return "draft";
  }
}

export function eventStatusTone(status: EventStatus | undefined): WpTone {
  switch (status) {
    case "planning":
      return "planning";
    case "confirmed":
      return "scheduled";
    case "live":
      return "live";
    case "done":
      return "complete";
    case "cancelled":
      return "blocked";
    case "prospect":
    default:
      return "draft";
  }
}

export function projectStatusTone(status: ProjectStatus | undefined): WpTone {
  switch (status ?? "active") {
    case "planning":
      return "planning";
    case "paused":
      return "draft";
    case "completed":
      return "complete";
    case "cancelled":
      return "blocked";
    case "active":
    default:
      return "in-progress";
  }
}

export function campaignPhaseTone(phase: CampaignPhase): WpTone {
  switch (phase) {
    case "live":
      return "live";
    case "finished":
      return "complete";
    case "evergreen":
      return "in-progress";
    case "upcoming":
    default:
      return "planning";
  }
}

// Priorities aren't statuses, but they wear the same chip shape. The CSS
// classes `.card-priority.<p>` / `.priority-badge.<p>` carry the colours.
export function priorityClassName(priority: Priority): string {
  return priority.toLowerCase();
}
