export type Priority = "Urgent" | "High" | "Normal" | "Low";

export type ProjectStatus = "active" | "completed" | "paused";

export type Designer = {
  id: string;
  name: string;
  initials: string;
  color: string;
  pin: string;
  avatar?: string;
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
  title: string;
  overview: string;
  client: string;
  brand: string;
  contentType: string;
  briefUrl: string;
  dueDate: string;
  priority: Priority;
  assigneeId: string | null;
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
  recipientId: string;
  fromName: string;
  projectId: string;
  kind: "comment" | "milestone" | "like" | "reply";
  snippet: string;
  createdAt: string;
  read: boolean;
};

export type Workspace = {
  designers: Designer[];
  projects: Project[];
  currentDesignerId: string;
  notifications: Notification[];
};

export type StorageConfig = {
  mode: "jsonbin" | "local";
  binId?: string;
  apiKey?: string;
  accessKey?: string;
};
