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

// Date maths for drawing campaigns on a Monday-first month grid. Pure
// functions, no React.

// Split the month's cells (as monthGrid produces them, nulls for padding)
// into rows of seven.
export function weeksOf(cells: (string | null)[]): (string | null)[][] {
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// Does the campaign touch any day between `from` and `to` inclusive?
// Never, for an evergreen one: it has no run to fall inside a range.
export function campaignOverlaps(c: Campaign, from: string, to: string): boolean {
  return (
    !c.evergreen && !!c.startDate && !!c.endDate && c.startDate <= to && c.endDate >= from
  );
}

// First and last day of a YYYY-MM month.
export function monthBounds(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

export function spanDays(c: Campaign): number {
  const a = new Date(`${c.startDate}T00:00:00`).getTime();
  const b = new Date(`${c.endDate}T00:00:00`).getTime();
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

// Give each campaign a row ("lane") it keeps for its whole run, so that a
// band drawn day by day across the grid stays level from one cell to the
// next and reads as one bar. Greedy: longest-running first (then by start,
// then by name), each dropping into the lowest lane that's free by the day
// it starts.
export function assignLanes(campaigns: Campaign[]): Map<string, number> {
  const ordered = campaigns
    .slice()
    .sort(
      (a, b) =>
        spanDays(b) - spanDays(a) ||
        a.startDate.localeCompare(b.startDate) ||
        a.name.localeCompare(b.name),
    );
  const laneEnd: string[] = []; // last occupied date per lane
  const lanes = new Map<string, number>();
  for (const c of ordered) {
    let lane = laneEnd.findIndex((end) => end < c.startDate);
    if (lane === -1) {
      lane = laneEnd.length;
      laneEnd.push(c.endDate);
    } else {
      laneEnd[lane] = c.endDate;
    }
    lanes.set(c.id, lane);
  }
  return lanes;
}

// How many lane rows a week's cells need so bands line up across the row:
// one more than the highest lane of any campaign touching that week.
export function weekLaneCount(
  campaigns: Campaign[],
  week: (string | null)[],
  lanes: Map<string, number>,
): number {
  const days = week.filter((d): d is string => !!d);
  if (days.length === 0) return 0;
  const from = days[0];
  const to = days[days.length - 1];
  let max = -1;
  for (const c of campaigns) {
    if (campaignOverlaps(c, from, to)) {
      max = Math.max(max, lanes.get(c.id) ?? 0);
    }
  }
  return max + 1;
}

// Campaigns running on a given day, longest first.
export function campaignsOn(campaigns: Campaign[], iso: string): Campaign[] {
  return campaigns
    .filter((c) => campaignOverlaps(c, iso, iso))
    .sort((a, b) => spanDays(b) - spanDays(a) || a.name.localeCompare(b.name));
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
