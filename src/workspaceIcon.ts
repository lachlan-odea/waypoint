import type { IconName } from "./components/Icon";
import type { Workspace } from "./types";

// Each team gets its own line icon in the sidebar (design system §5), keyed
// by workspace id. A workspace can carry its own `icon` to override this;
// anything unlisted falls back to the folder.
const TEAM_ICONS: Record<string, IconName> = {
  comms: "message-chat",
  design: "edit",
  events: "ticket",
  marketing: "rocket",
  video: "clapperboard",
};

export function workspaceIcon(w: Pick<Workspace, "id" | "icon">): IconName {
  return w.icon ?? TEAM_ICONS[w.id] ?? "folder";
}
