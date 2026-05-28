export type Priority = "Urgent" | "High" | "Normal" | "Low";

export type Designer = {
  id: string;
  name: string;
  initials: string;
  color: string;
  pin: string;
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
};

export type Project = {
  id: string;
  title: string;
  overview: string;
  client: string;
  brand: string;
  productArea: string;
  briefUrl: string;
  dueDate: string;
  priority: Priority;
  assigneeId: string | null;
  milestones: Milestone[];
  comments: Comment[];
  createdAt: string;
  source?: "manual" | "outlook";
};

export type Workspace = {
  designers: Designer[];
  projects: Project[];
  currentDesignerId: string;
};

export type StorageConfig = {
  mode: "jsonbin" | "local";
  binId?: string;
  apiKey?: string;
  accessKey?: string;
};
