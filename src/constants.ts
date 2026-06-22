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
