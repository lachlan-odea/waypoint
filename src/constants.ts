import type { ProjectStatus, SocialPostStatus } from "./types";

// The status picker's options, in lifecycle order. Single source of truth for
// both the dropdown and every label rendered elsewhere — see the note on
// ProjectStatus for why "paused" is stored but shown as "On hold".
export const PROJECT_STATUSES: { value: ProjectStatus; label: string }[] = [
  { value: "planning", label: "Planning" },
  { value: "active", label: "Active" },
  { value: "paused", label: "On hold" },
  { value: "completed", label: "Completed" },
];

// A project with no status set predates the field and is treated as active.
export function projectStatusLabel(status: ProjectStatus | undefined): string {
  const value = status ?? "active";
  return PROJECT_STATUSES.find((s) => s.value === value)?.label ?? "Active";
}

export const BRANDS = [
  "CargoWise",
  "CargoWise Landside",
  "WiseTech Global",
  "WiseTech Academy",
  "e2open",
  "Blume",
  "BorderWise",
  "No brand",
] as const;

// Bootstrap super users. Anyone whose Firebase Auth email matches an entry
// here is treated as a super user regardless of the `isSuperUser` flag on
// their Designer doc — this guarantees there's always at least one person
// who can grant the flag to others from the Settings UI. Designers can also
// be promoted at runtime via the Super users section in Settings (writes
// /designers/{uid}.isSuperUser to true). The reviewer pool and the
// "Manage workspaces" admin section are both gated on super-user status.
export const SUPER_USER_EMAILS = [
  "lachlan.odea@wisetechglobal.com",
] as const;

// Seed workspaces written into Firestore on first load. Once they exist
// they're managed in the /workspaces collection; this list only acts as
// the initial set. The first id is treated as the default workspace for
// pre-existing projects that don't yet have a workspaceId field.
export const SEED_WORKSPACES = [
  { id: "design", name: "Design" },
  { id: "video", name: "Video" },
  { id: "marketing", name: "Marketing" },
  // Added Sept 2026. seedWorkspacesIfMissing creates any id listed here that
  // isn't in /workspaces yet, so a new team is a one-line addition — plus a
  // colour + glyph in WORKSPACE_VISUALS (Sidebar.tsx) and, for the Teams
  // ingest, ALLOWED_WORKSPACE_IDS in functions/src/index.ts.
  { id: "comms", name: "Comms" },
] as const;

export const DEFAULT_WORKSPACE_ID = SEED_WORKSPACES[0].id;

// The two offices we start with. Written into /hubs on first load the same
// way SEED_WORKSPACES is, then managed from Settings → Locations & time
// zones — super users can add, rename, retime or remove any of them, and the
// change lands in everyone's sidebar. This list only supplies the initial
// pair, so editing a seeded hub in the UI sticks; it won't be reset on the
// next boot.
export const SEED_HUBS = [
  {
    id: "sydney",
    name: "Sydney",
    timeZone: "Australia/Sydney",
    workStartHour: 8,
    workEndHour: 18,
  },
  {
    id: "chicago",
    name: "Chicago",
    timeZone: "America/Chicago",
    workStartHour: 8,
    workEndHour: 18,
  },
] as const;

// Social calendar statuses in lifecycle order, with the colour each renders
// in. The greens and pinks deliberately echo the cell fills the marketing
// team used in their spreadsheet so the calendar reads the same way it did
// there. Single source of truth for the status picker, the card pills and
// the legend.
export const SOCIAL_POST_STATUSES: {
  value: SocialPostStatus;
  label: string;
  color: string;
}[] = [
  { value: "draft", label: "Draft", color: "#6b7280" },
  { value: "pending", label: "Pending", color: "#c2417f" },
  { value: "scheduled", label: "Scheduled", color: "#d97706" },
  { value: "published", label: "Published", color: "#16a34a" },
  { value: "cancelled", label: "Cancelled", color: "#dc2626" },
  { value: "backlog", label: "Backlog", color: "#64748b" },
];

export function socialStatusMeta(status: SocialPostStatus | undefined) {
  return (
    SOCIAL_POST_STATUSES.find((s) => s.value === status) ??
    SOCIAL_POST_STATUSES[0]
  );
}

// Brand channels a post can go out on. Suggestions, not a closed list: the
// channel field accepts any text, and the calendar's filter pills are built
// from whatever channels are actually in use plus these.
export const SOCIAL_CHANNELS = ["CargoWise", "WiseTech"] as const;

const SOCIAL_CHANNEL_COLORS: Record<string, string> = {
  cargowise: "#2563eb",
  wisetech: "#0f766e",
};

// Colour for a channel chip. Unknown channels fall back to a neutral slate
// so a new channel is legible before anyone has picked it a colour.
export function socialChannelColor(channel: string): string {
  return SOCIAL_CHANNEL_COLORS[channel.trim().toLowerCase()] ?? "#64748b";
}

export const CONTENT_TYPES = [
  "Web",
  "Landing page",
  "Social",
  "Email",
  "Print",
  "Event",
  "Mobile",
  "Video",
  "Presentation",
  "Brand",
  "Illustration",
  "Internal comms",
] as const;
