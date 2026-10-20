export const DRAG_MIME = "application/x-pmtool-project-id";

export function readDraggedProjectId(e: React.DragEvent): string | null {
  return e.dataTransfer.getData(DRAG_MIME) || e.dataTransfer.getData("text/plain") || null;
}

export function writeDraggedProjectId(e: React.DragEvent, id: string) {
  e.dataTransfer.setData(DRAG_MIME, id);
  e.dataTransfer.setData("text/plain", id);
  e.dataTransfer.effectAllowed = "move";
}

// Social calendar cards use their own MIME type so a post dragged over the
// sidebar's team items (which accept projects) isn't mistaken for one. No
// text/plain fallback for the same reason.
export const SOCIAL_DRAG_MIME = "application/x-waypoint-social-post-id";

export function readDraggedSocialPostId(e: React.DragEvent): string | null {
  return e.dataTransfer.getData(SOCIAL_DRAG_MIME) || null;
}

export function writeDraggedSocialPostId(e: React.DragEvent, id: string) {
  e.dataTransfer.setData(SOCIAL_DRAG_MIME, id);
  e.dataTransfer.effectAllowed = "move";
}

// Campaign milestones, dragged between days on the Campaigns page grid.
// The payload names both the campaign and the milestone, since a milestone
// only means something inside its campaign.
export const MILESTONE_DRAG_MIME = "application/x-waypoint-campaign-milestone";

export type DraggedMilestone = { campaignId: string; milestoneId: string };

export function readDraggedMilestone(e: React.DragEvent): DraggedMilestone | null {
  const raw = e.dataTransfer.getData(MILESTONE_DRAG_MIME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<DraggedMilestone>;
    return typeof parsed.campaignId === "string" && typeof parsed.milestoneId === "string"
      ? { campaignId: parsed.campaignId, milestoneId: parsed.milestoneId }
      : null;
  } catch {
    return null;
  }
}

export function writeDraggedMilestone(
  e: React.DragEvent,
  campaignId: string,
  milestoneId: string,
) {
  e.dataTransfer.setData(MILESTONE_DRAG_MIME, JSON.stringify({ campaignId, milestoneId }));
  e.dataTransfer.effectAllowed = "move";
}
