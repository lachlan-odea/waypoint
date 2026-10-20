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
