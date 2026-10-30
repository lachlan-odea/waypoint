import { createContext, useContext } from "react";

// The marketing activity portal: the one SharePoint page that shows every
// campaign, webinar and event (src/activityExport.ts). Once it has been put
// on SharePoint, every item in Waypoint can link straight to its page there
// (`…/marketing-activity.aspx#c-<id>` or `#e-<id>`), which replaced the
// per-campaign SharePoint pages. App provides the context; anything that
// shows an "open on SharePoint" action reads it.

export type ActivityKind = "campaign" | "event";

export type ActivityPortal = {
  // The portal's SharePoint link, once set.
  url?: string;
  // The link to one item's page inside the portal, or undefined until the
  // portal exists.
  itemUrl: (kind: ActivityKind, id: string) => string | undefined;
  // Opens the guide that puts the portal on SharePoint.
  openSetup: () => void;
};

export function activityItemUrl(portalUrl: string | undefined, kind: ActivityKind, id: string): string | undefined {
  if (!portalUrl) return undefined;
  return `${portalUrl.split("#")[0]}#${kind === "event" ? "e" : "c"}-${id}`;
}

export const ActivityPortalContext = createContext<ActivityPortal>({
  itemUrl: () => undefined,
  openSetup: () => {},
});

export function useActivityPortal(): ActivityPortal {
  return useContext(ActivityPortalContext);
}
