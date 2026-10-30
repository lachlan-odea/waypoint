import type { Campaign, CampaignMilestone, MilestoneType, SocialPost } from "./types";

// Does this milestone get a post on the Social calendar? Only if its type
// is still in the list and marked social.
export function isSocialMilestone(
  m: Pick<CampaignMilestone, "label">,
  types: MilestoneType[],
): boolean {
  return types.some((t) => t.social && t.label === m.label);
}

// The draft post a social milestone puts on the Social calendar: on the
// milestone's day, no category, channel "Other", the campaign's name as the
// topic. Everything else is left for the social team to fill in.
export function milestoneSocialPost(
  campaign: Campaign,
  milestone: CampaignMilestone,
): SocialPost {
  return {
    id: `sp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    month: milestone.date.slice(0, 7),
    date: milestone.date,
    channel: "Other",
    topic: campaign.name,
    copy: "",
    screenshot: "",
    asset: "",
    ctaLink: "",
    status: "draft",
    notes: `${milestone.label} for the ${campaign.name} campaign.`,
    owner: campaign.owner,
    evergreen: false,
    createdAt: new Date().toISOString(),
    source: "manual",
  };
}

// Date maths for placing campaigns on a month grid. Pure functions, no
// React.

// Does the campaign touch any day between `from` and `to` inclusive? An
// evergreen one runs from its start with no end, so it touches every day
// from then on.
export function campaignOverlaps(c: Campaign, from: string, to: string): boolean {
  if (!c.startDate || c.startDate > to) return false;
  if (c.evergreen) return true;
  return !!c.endDate && c.endDate >= from;
}

// The last day the campaign occupies on a calendar. An evergreen one never
// ends, so it gets a date past any month anyone will scroll to.
// An exact copy of a campaign under a new id, for testing or as a starting
// point: "(copy)" after the name, fresh ids on milestones and on the
// webinar kit's rows, files and notes, and nothing shared with the
// original — no social post links (a copy mustn't move the original's
// posts), no SharePoint token or page. Written with setCampaign directly,
// not saveCampaign, so social milestones don't spawn new draft posts.
export function duplicateCampaign(c: Campaign, by?: string): Campaign {
  const now = new Date().toISOString();
  const id = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const copy: Campaign = {
    ...c,
    id: id("camp"),
    name: `${c.name} (copy)`,
    milestones: c.milestones.map((m) => {
      const rest = { ...m, id: id("ms") };
      delete rest.socialPostId;
      return rest;
    }),
    createdAt: now,
  };
  delete copy.shareToken;
  delete copy.sharePointUrl;
  if (c.webinar) {
    copy.webinar = {
      ...c.webinar,
      items: c.webinar.items.map((i) => ({ ...i, id: id("i") })),
      files: c.webinar.files.map((f) => ({ ...f, id: id("f") })),
      notes: c.webinar.notes.map((n) => ({ ...n, id: id("n") })),
      activity: [{ id: id("a"), section: "", what: "duplicated from", detail: c.name, by, at: now }],
      createdAt: now,
      updatedAt: now,
    };
  }
  return copy;
}

export const NO_END = "9999-12-31";
export function campaignEnd(c: Campaign): string {
  return c.evergreen ? NO_END : c.endDate;
}

// First and last day of a YYYY-MM month.
export function monthBounds(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

// Days in the run. Enormous for an evergreen campaign, so it sorts as the
// longest; callers that print the number check the flag first.
export function spanDays(c: Campaign): number {
  const a = new Date(`${c.startDate}T00:00:00`).getTime();
  const b = new Date(`${campaignEnd(c)}T00:00:00`).getTime();
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

export function milestonesOn(
  campaigns: Campaign[],
  iso: string,
): { campaign: Campaign; milestone: CampaignMilestone }[] {
  const out: { campaign: Campaign; milestone: CampaignMilestone }[] = [];
  campaigns.forEach((c) =>
    c.milestones
      .filter((m) => m.date === iso)
      .forEach((milestone) => out.push({ campaign: c, milestone })),
  );
  return out;
}

export type CampaignPhase = "upcoming" | "live" | "finished" | "evergreen";

export function campaignPhase(c: Campaign, today: string): CampaignPhase {
  if (c.evergreen) return "evergreen";
  if (c.endDate < today) return "finished";
  if (c.startDate > today) return "upcoming";
  return "live";
}

export const PHASE_LABEL: Record<CampaignPhase, string> = {
  live: "Live",
  upcoming: "Upcoming",
  finished: "Finished",
  evergreen: "Evergreen",
};
