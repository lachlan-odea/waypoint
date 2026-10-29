import type {
  MilestoneType,
  ProjectStatus,
  SocialCategory,
  SocialConfig,
  SocialHashtag,
  SocialPostStatus,
} from "./types";

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
// there, taken from the brand palette: Cherry for pink, the Mint/Pine
// family for green, Peach for amber. Single source of truth for the status picker, the card pills and
// the legend.
export const SOCIAL_POST_STATUSES: {
  value: SocialPostStatus;
  label: string;
  color: string;
}[] = [
  { value: "draft", label: "Draft", color: "#6b6d88" },
  // Stored as "pending" — see the note on SocialPostStatus.
  { value: "pending", label: "Ready to publish", color: "#c2335f" },
  { value: "scheduled", label: "Scheduled", color: "#b4501f" },
  { value: "onHold", label: "On hold", color: "#371ee1" },
  { value: "published", label: "Published", color: "#1f7a4d" },
  { value: "cancelled", label: "Cancelled", color: "#651d32" },
  { value: "backlog", label: "Backlog", color: "#3b4a66" },
];

export function socialStatusMeta(status: SocialPostStatus | undefined) {
  return (
    SOCIAL_POST_STATUSES.find((s) => s.value === status) ??
    SOCIAL_POST_STATUSES[0]
  );
}

// What a social post is about. The pill on each card uses `short` so it
// fits a calendar cell; the full `label` is the picker option and the
// tooltip. Colours come from the same brand-derived set as everything else,
// every one dark enough for white text. The brand has fewer hues than there
// are categories and statuses, so some share a hue family with a status;
// the text on each pill is what tells them apart.
//
// These are the starting set. Super users edit the live list from
// Settings → Social calendar, which writes /socialConfig/default; until
// that document exists the app runs on these.
export const DEFAULT_SOCIAL_CATEGORIES: SocialCategory[] = [
  { id: "product-cargowise", label: "Product - CargoWise", short: "Product · CW", color: "#371ee1" },
  { id: "product-other", label: "Product - Other", short: "Product · Other", color: "#6a5cd8" },
  { id: "thought-leadership", label: "Thought Leadership", short: "Thought leadership", color: "#244349" },
  { id: "people", label: "People", short: "People", color: "#a3294d" },
  { id: "event", label: "Event", short: "Event", color: "#b4501f" },
  { id: "digital-event", label: "Digital Event", short: "Digital event", color: "#2f6fb0" },
  { id: "industry", label: "Industry", short: "Industry", color: "#1f7a4d" },
  { id: "wisetech-academy", label: "WiseTech Academy", short: "Academy", color: "#1d1765" },
  // Predefined for the webinar programme: a campaign of this type is a
  // webinar, from brief to on-demand recording.
  { id: "webinar", label: "Webinar", short: "Webinar", color: "#3a4a66" },
];

// Company hashtags to start with — the two brand tags. Edited in the same
// Settings window as the categories.
export const DEFAULT_SOCIAL_HASHTAGS: SocialHashtag[] = [
  { id: "cargowise", tag: "#CargoWise", note: "Every CargoWise channel post" },
  { id: "wisetechglobal", tag: "#WiseTechGlobal", note: "Every WiseTech channel post" },
];

// What a campaign milestone can be, to start with. The label is stored on
// the milestone as text, so renaming a type leaves existing milestones on
// the old wording (the editor still shows it as an extra option).
export const DEFAULT_MILESTONE_TYPES: MilestoneType[] = [
  { id: "organic-social-post", label: "Organic Social Post", social: true },
  { id: "sponsored-social-post", label: "Sponsored Social Post", social: true },
  { id: "edm", label: "EDM", social: false },
  { id: "landing-page", label: "Landing Page", social: false },
  { id: "press-release", label: "Press Release", social: false },
  // The webinar itself — the go-live date inside a webinar campaign.
  { id: "webinar", label: "Webinar", social: false },
];

// Webinar is a predefined option everywhere a campaign is typed: as a
// campaign type and as a milestone type. A /socialConfig document saved
// before it existed won't list it, so the resolved config always carries
// it, whatever the saved lists hold.
const WEBINAR_CATEGORY = DEFAULT_SOCIAL_CATEGORIES.find((c) => c.id === "webinar")!;
const WEBINAR_MILESTONE = DEFAULT_MILESTONE_TYPES.find((t) => t.id === "webinar")!;

function withPredefined<T extends { id: string; label: string }>(
  list: T[],
  required: T,
): T[] {
  const present = list.some(
    (x) => x.id === required.id || x.label.trim().toLowerCase() === required.label.toLowerCase(),
  );
  return present ? list : [...list, required];
}

// CONTENT_TYPES is declared further down; the function form keeps this
// independent of declaration order.
export function defaultSocialConfig(): Required<SocialConfig> {
  return {
    categories: DEFAULT_SOCIAL_CATEGORIES,
    hashtags: DEFAULT_SOCIAL_HASHTAGS,
    contentTypes: [...CONTENT_TYPES],
    milestoneTypes: DEFAULT_MILESTONE_TYPES,
  };
}

// The config as the app uses it: whatever has been saved, with the built-in
// defaults filling any field the saved document predates.
export function resolveSocialConfig(
  doc: SocialConfig | null | undefined,
): Required<SocialConfig> {
  const d = defaultSocialConfig();
  if (!doc) return d;
  return {
    categories: withPredefined(doc.categories ?? d.categories, WEBINAR_CATEGORY),
    hashtags: doc.hashtags ?? d.hashtags,
    contentTypes: doc.contentTypes ?? d.contentTypes,
    milestoneTypes: withPredefined(
      doc.milestoneTypes ?? d.milestoneTypes,
      WEBINAR_MILESTONE,
    ),
  };
}

// Pill text + colour for a stored category. A value that isn't in the list
// (deleted later, say) still renders, in a neutral grey, rather than vanishing.
export function socialCategoryMeta(
  category: string | undefined,
  categories: SocialCategory[] = DEFAULT_SOCIAL_CATEGORIES,
): Pick<SocialCategory, "label" | "short" | "color"> | null {
  if (!category) return null;
  return (
    categories.find((c) => c.label === category) ?? {
      label: category,
      short: category,
      color: "#6b6d88",
    }
  );
}

// One colour per brand, used wherever a campaign is drawn (timeline bars,
// day-cell strips, card edges). Brand palette steps dark enough for white
// text; CargoWise and WiseTech Global wear their own Blue and Navy.
const BRAND_COLORS: Record<string, string> = {
  CargoWise: "#371ee1",
  "CargoWise Landside": "#2f6fb0",
  "WiseTech Global": "#1d1765",
  "WiseTech Academy": "#b4501f",
  e2open: "#6a5cd8",
  Blume: "#a3294d",
  BorderWise: "#244349",
  "No brand": "#6b6d88",
};

export function brandColor(brand: string): string {
  return BRAND_COLORS[brand] ?? BRAND_COLORS["No brand"];
}

// Best-guess brand for a campaign that only has a social channel set — the
// default the editor offers, nothing more.
export function brandForChannel(channel: string): string {
  const c = channel.trim().toLowerCase();
  if (c === "cargowise") return "CargoWise";
  if (c === "wisetech") return "WiseTech Global";
  return "No brand";
}

// Brand channels a post can go out on. Suggestions, not a closed list: the
// channel field accepts any text, and the calendar's filter pills are built
// from whatever channels are actually in use plus these.
export const SOCIAL_CHANNELS = ["CargoWise", "WiseTech"] as const;

const SOCIAL_CHANNEL_COLORS: Record<string, string> = {
  cargowise: "#371ee1",
  wisetech: "#1d1765",
};

// Colour for a channel chip. Unknown channels fall back to a neutral grey
// so a new channel is legible before anyone has picked it a colour.
export function socialChannelColor(channel: string): string {
  return SOCIAL_CHANNEL_COLORS[channel.trim().toLowerCase()] ?? "#6b6d88";
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
