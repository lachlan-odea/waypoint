import type { Campaign, CampaignMilestone } from "./types";

// Layout maths for the campaign strip: turning date ranges into bars on a
// Monday-first week grid. Pure functions, no React.

// Split the month's cells (as monthGrid in SocialCalendar produces them,
// nulls for padding) into rows of seven.
export function weeksOf(cells: (string | null)[]): (string | null)[][] {
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// Does the campaign touch any day between `from` and `to` inclusive?
export function campaignOverlaps(c: Campaign, from: string, to: string): boolean {
  return !!c.startDate && !!c.endDate && c.startDate <= to && c.endDate >= from;
}

// First and last day of a YYYY-MM month.
export function monthBounds(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

export type BarSegment = {
  campaign: Campaign;
  // Zero-based columns (0 = Monday) this segment covers within its week.
  startCol: number;
  endCol: number;
  // Which row of the week's strip the bar sits on.
  lane: number;
  // The campaign runs on past this week's edge, so the bar's end is cut
  // flat rather than rounded.
  continuesBefore: boolean;
  continuesAfter: boolean;
  // Milestones falling inside this segment, with their column.
  milestones: { milestone: CampaignMilestone; col: number }[];
};

// Lay one week's worth of campaign bars out into lanes. Greedy: campaigns
// are taken longest-running-first (then by start, then by name) and each
// drops into the lowest lane that's free from its start column on. That
// keeps a long campaign on the top row across every week it spans, with the
// shorter ones packing in underneath.
export function layoutWeek(
  campaigns: Campaign[],
  week: (string | null)[],
): BarSegment[] {
  const days = week.map((d, i) => ({ iso: d, col: i })).filter((d) => d.iso);
  if (days.length === 0) return [];
  const weekFrom = days[0].iso!;
  const weekTo = days[days.length - 1].iso!;
  const colOf = new Map(days.map((d) => [d.iso!, d.col]));

  const segments: BarSegment[] = campaigns
    .filter((c) => campaignOverlaps(c, weekFrom, weekTo))
    .sort((a, b) => {
      const la = spanDays(a);
      const lb = spanDays(b);
      if (la !== lb) return lb - la;
      return a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name);
    })
    .map((c) => {
      const startIso = c.startDate < weekFrom ? weekFrom : c.startDate;
      const endIso = c.endDate > weekTo ? weekTo : c.endDate;
      const startCol = colOf.get(startIso) ?? days[0].col;
      const endCol = colOf.get(endIso) ?? days[days.length - 1].col;
      return {
        campaign: c,
        startCol,
        endCol,
        lane: 0,
        continuesBefore: c.startDate < weekFrom,
        continuesAfter: c.endDate > weekTo,
        milestones: c.milestones
          .filter((m) => m.date >= startIso && m.date <= endIso)
          .map((m) => ({ milestone: m, col: colOf.get(m.date) ?? startCol }))
          .sort((a, b) => a.col - b.col),
      };
    });

  // laneEnds[lane] = last column occupied on that lane.
  const laneEnds: number[] = [];
  for (const seg of segments) {
    let lane = laneEnds.findIndex((end) => end < seg.startCol);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(seg.endCol);
    } else {
      laneEnds[lane] = seg.endCol;
    }
    seg.lane = lane;
  }
  return segments;
}

export function spanDays(c: Campaign): number {
  const a = new Date(`${c.startDate}T00:00:00`).getTime();
  const b = new Date(`${c.endDate}T00:00:00`).getTime();
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

// Campaigns running on a given day, longest first (matching the strip).
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

export type CampaignPhase = "upcoming" | "live" | "finished";

export function campaignPhase(c: Campaign, today: string): CampaignPhase {
  if (c.endDate < today) return "finished";
  if (c.startDate > today) return "upcoming";
  return "live";
}
