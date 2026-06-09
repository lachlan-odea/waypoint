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

// Designers who can be selected as reviewers from the "Flag for review" picker
// and who get a "For review" section in their workspace.
export const REVIEWER_IDS = ["d-jess", "d-oliver"] as const;

// Emails that should be treated as super-users in the app: they see every
// workspace regardless of membership, and get the "Manage workspaces"
// section in Settings. Add more entries to grant admin access to other
// designers.
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
] as const;

export const DEFAULT_WORKSPACE_ID = SEED_WORKSPACES[0].id;

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
