export type Priority = "Urgent" | "High" | "Normal" | "Low";

export type ProjectStatus = "active" | "completed" | "paused";

export type Designer = {
  id: string;
  name: string;
  initials: string;
  color: string;
  email?: string;
  // Bundled seed photo (Vite-hashed asset URL). Not persisted to Firestore —
  // re-overlaid on read by overlayAvatar() so the URL stays in sync with the
  // current build.
  avatar?: string;
  // User-supplied headshot URL pasted from Settings. Persisted to Firestore
  // and takes precedence over `avatar` when rendering.
  photoUrl?: string;
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
  contentType: string;
  briefUrl: string;
  dueDate: string;
  priority: Priority;
  assigneeIds: string[];
  flaggedForReview?: boolean;
  status?: ProjectStatus;
  archived?: boolean;
  milestones: Milestone[];
  comments: Comment[];
  createdAt: string;
  source?: "manual" | "outlook";
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

// The in-memory snapshot of everything App.tsx needs to render. Loaded
// progressively via the Firestore subscriptions in firestore.ts.
export type WorkspaceData = {
  designers: Designer[];
  workspaces: Workspace[];
  projects: Project[];
  currentDesignerId: string;
  notifications: Notification[];
};
