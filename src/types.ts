export type Priority = "Urgent" | "High" | "Normal" | "Low";

// Lifecycle order is Planning → Active → On hold → Completed. Note that the
// stored value "paused" is displayed as "On hold": the value is already
// persisted on live project docs, and renaming it would need a migration
// where any missed doc would fall through the `?? "active"` default and
// silently reappear as active work. Always render these through
// projectStatusLabel() in constants.ts rather than printing the raw value.
export type ProjectStatus = "planning" | "active" | "paused" | "completed";

// An office location and the time zone it keeps. Managed by super users in
// Settings → Locations & time zones, and shared by everyone: adding one puts
// a clock in every teammate's sidebar.
//
// Deliberately stores an IANA zone id ("Australia/Sydney") rather than a UTC
// offset, so daylight saving is the browser's problem rather than ours —
// Sydney and Chicago are between 15 and 17 hours apart depending on the month.
export type Hub = {
  id: string;
  // Display name, e.g. "Sydney". Free text — it doesn't have to match the
  // city in the zone id.
  name: string;
  // IANA time zone identifier, e.g. "Australia/Sydney".
  timeZone: string;
  // Local hours between which people here are considered contactable. Used
  // only to grey out a clock, never to block anything. A range that wraps
  // past midnight (22 → 6) is valid.
  workStartHour: number;
  workEndHour: number;
};

export type Designer = {
  id: string;
  name: string;
  initials: string;
  color: string;
  email?: string;
  // Which Hub this person sits in. Missing means unassigned — they simply
  // don't get a "you" marker on any clock.
  hubId?: string;
  // User-supplied headshot URL pasted from Settings. Empty / missing falls
  // back to the initials chip.
  photoUrl?: string;
  // Super users are admins: they manage team membership, promote / demote
  // other super users and reviewers, and view the by-designer analytics
  // chart. SUPER_USER_EMAILS in src/constants.ts is the bootstrap so
  // there's always at least one super user who can grant the flag.
  isSuperUser?: boolean;
  // Reviewers appear in the Reviewer picker on every project. Independent
  // from isSuperUser — a designer can be one, both, or neither. Toggled
  // from Settings by a super user.
  isReviewer?: boolean;
};

// A named container that scopes projects + notifications (Design, Video,
// Marketing). Designers stay global; per-workspace membership is opt-in via
// `memberIds` — an empty/missing list means the workspace is open to
// everyone, populating it restricts visibility to listed users (plus
// super-users, who always see every workspace).
export type Workspace = {
  id: string;
  name: string;
  memberIds?: string[];
};

export type Milestone = {
  id: string;
  label: string;
  done: boolean;
};

export type Comment = {
  id: string;
  author: string;
  text: string;
  createdAt: string;
  likes?: string[];
  parentId?: string | null;
};

export type Project = {
  id: string;
  workspaceId: string;
  title: string;
  overview: string;
  client: string;
  brand: string;
  // Legacy single-value content type, kept only so projects written before
  // the field went multi-value still render. Never written to any more —
  // always read through projectContentTypes() in contentTypes.ts, which
  // prefers `contentTypes` and falls back to this.
  contentType?: string;
  contentTypes?: string[];
  briefUrl: string;
  dueDate: string;
  priority: Priority;
  assigneeIds: string[];
  // Designer UIDs of super users who've been asked to review this project.
  // Empty / missing means no review requested. Replaces the old boolean
  // `flaggedForReview` — a project is "flagged" iff reviewerIds is non-empty,
  // and each reviewer only sees projects where their own UID is in this list.
  reviewerIds?: string[];
  status?: ProjectStatus;
  archived?: boolean;
  milestones: Milestone[];
  comments: Comment[];
  createdAt: string;
  source?: "manual" | "outlook" | "teams";
};

export type Notification = {
  id: string;
  workspaceId: string;
  recipientId: string;
  fromName: string;
  projectId: string;
  kind: "comment" | "milestone" | "like" | "reply";
  snippet: string;
  createdAt: string;
  read: boolean;
};

// A single line on somebody's personal My Desk checklist. Private to its
// owner — nothing here is shared with the team, and ticking an item off
// never touches the project it was created from.
//
// The three panels on My Desk are all views over this one list:
//   Today     — !done && !remind && date <= today
//   Upcoming  — !done && (remind || date > today)
//   Completed — done (swept 14 days after completedOn)
//
// `remind: true` parks an item in Upcoming with a countdown instead of
// silently waiting for its date; when remindTime arrives on remindDate the
// sweep in MyDesk converts it into a plain item for today.
export type DeskItem = {
  id: string;
  // Designer id (= Firebase UID) this item belongs to.
  ownerId: string;
  text: string;
  // YYYY-MM-DD, local. The day this item lands on the owner's Today list.
  date: string;
  done: boolean;
  completedOn?: string;
  // How many times this rolled over from an earlier day untouched. Surfaced
  // in the UI because an item that's rolled five times usually needs
  // breaking up rather than doing.
  rolled?: number;
  remind?: boolean;
  // HH:MM, 24h, local. Only meaningful when remind is true.
  remindTime?: string;
  // Set when the sweep promoted a reminder onto the Today list, so the row
  // can explain where it came from.
  fromReminder?: boolean;
  // Optional link back to a project. Purely a shortcut — completing the
  // desk item leaves the project's status alone.
  projectId?: string;
  createdAt: string;
};

// Where a social post is in its life. Mirrors the colour code the marketing
// team used in the original spreadsheet: green cells were published, pink
// pending, red pulled. "backlog" is reserved for the evergreen library —
// reusable copy that isn't tied to any date until someone schedules it.
export type SocialPostStatus =
  | "backlog"
  | "draft"
  | "pending"
  | "scheduled"
  | "published"
  | "cancelled";

// One entry on the shared Social calendar: a LinkedIn post going out on a
// brand channel (CargoWise, WiseTech). Shared by everyone, not scoped to a
// workspace — the calendar is the marketing team's single plan, and the
// designers producing the assets need to see the same view.
//
// Imported from "Social Media Calendar 2026.xlsx" by
// scripts/social-calendar-xlsx-to-seed.py; the field names follow that
// sheet's columns so the two stay easy to reconcile.
export type SocialPost = {
  id: string;
  // YYYY-MM the post is planned for. Always set, even while `date` is empty,
  // so an unscheduled post still lands in the right month's tray instead of
  // disappearing.
  month: string;
  // YYYY-MM-DD publish date, local. Empty while the post is unscheduled.
  date: string;
  // Brand account it goes out on. Free text with suggestions rather than an
  // enum: the sheet had "CargoWise" and "WiseTech", but a new channel
  // shouldn't need a deploy.
  channel: string;
  topic: string;
  // Full post copy, newlines preserved.
  copy: string;
  // Links (or occasionally bare file names) as they appeared in the sheet.
  // Not validated as URLs — an asset can legitimately be "Video when ready".
  screenshot: string;
  asset: string;
  ctaLink: string;
  status: SocialPostStatus;
  notes: string;
  // Who's driving the post. Free text ("Maddie", "Jess R.") because the
  // marketing team isn't necessarily on Waypoint as designers.
  owner: string;
  // True for reusable posts in the evergreen library. They keep their
  // `month` (the month they were written) and normally have no `date`; one
  // that does get scheduled shows on the calendar and stays in the library.
  evergreen: boolean;
  createdAt: string;
  source?: "import" | "manual";
};

// The in-memory snapshot of everything App.tsx needs to render. Loaded
// progressively via the Firestore subscriptions in firestore.ts.
export type WorkspaceData = {
  designers: Designer[];
  workspaces: Workspace[];
  projects: Project[];
  notifications: Notification[];
  hubs: Hub[];
};
