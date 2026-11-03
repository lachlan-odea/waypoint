import type { BigRock, Campaign, MarketingEvent, Project, SocialPost } from "./types";
import { kitOf } from "./webinarKit";

// How the team's work is attributed to Big Rocks. Campaigns, projects,
// posts and events can all carry bigRockIds; posts and events also pick
// rocks up through what they're linked to:
//
//   project   tagged with the rock, or contributing to a campaign that is
//   campaign  tagged with the rock (a webinar is a campaign with the kit)
//   post      tagged with the rock, promotes one of the rock's projects, or
//             was created by a milestone of one of the rock's campaigns
//   event     tagged with the rock, part of one of the rock's campaigns, or
//             has one of the rock's projects doing work for it
//
// Pure functions over the lists App already holds; nothing is stored.

// Steps of the CargoWise palette, each dark enough to carry white text.
export const BIG_ROCK_PALETTE = [
  "#371ee1", "#a3294d", "#1f7a4d", "#b4501f", "#2f6fb0",
  "#6a5cd8", "#244349", "#c2335f", "#6b7a12", "#1d1765",
];

export function newBigRockId(): string {
  return `rock-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// The rocks behind a list of ids, in the rocks' own order. Ids of rocks
// since removed are dropped.
export function rocksFor(ids: string[] | undefined, rocks: BigRock[]): BigRock[] {
  if (!ids || ids.length === 0) return [];
  return rocks.filter((r) => ids.includes(r.id));
}

export type WorkLists = {
  projects: Project[];
  campaigns: Campaign[];
  socialPosts: SocialPost[];
  events: MarketingEvent[];
};

export type RockWork = {
  rock: BigRock;
  // Ordinary campaigns, and the webinars, separately.
  campaigns: Campaign[];
  webinars: Campaign[];
  projects: Project[];
  // Ids of projects attributed through a campaign rather than tagged
  // themselves, so a list can say so.
  viaCampaign: Set<string>;
  posts: SocialPost[];
  events: MarketingEvent[];
};

export function rockWork(rock: BigRock, lists: WorkLists): RockWork {
  const allCampaigns = lists.campaigns.filter((c) => c.bigRockIds?.includes(rock.id));
  const campaignIds = new Set(allCampaigns.map((c) => c.id));
  const direct = new Set(
    lists.projects.filter((p) => p.bigRockIds?.includes(rock.id)).map((p) => p.id),
  );
  const viaCampaign = new Set<string>();
  allCampaigns.forEach((c) =>
    (c.projectIds ?? []).forEach((id) => {
      if (!direct.has(id)) viaCampaign.add(id);
    }),
  );
  const projects = lists.projects.filter((p) => direct.has(p.id) || viaCampaign.has(p.id));
  const projectIds = new Set(projects.map((p) => p.id));
  const milestonePostIds = new Set(
    allCampaigns.flatMap((c) =>
      c.milestones.map((m) => m.socialPostId).filter((id): id is string => !!id),
    ),
  );
  const posts = lists.socialPosts.filter(
    (p) =>
      !!p.bigRockIds?.includes(rock.id) ||
      (!!p.projectId && projectIds.has(p.projectId)) ||
      milestonePostIds.has(p.id),
  );
  const events = lists.events.filter(
    (e) =>
      !!e.bigRockIds?.includes(rock.id) ||
      (!!e.campaignId && campaignIds.has(e.campaignId)) ||
      (e.projectIds ?? []).some((id) => projectIds.has(id)),
  );
  return {
    rock,
    campaigns: allCampaigns.filter((c) => !kitOf(c)),
    webinars: allCampaigns.filter((c) => !!kitOf(c)),
    projects,
    viaCampaign,
    posts,
    events,
  };
}

// Projects and campaigns no rock claims, directly or through a campaign.
// Archived projects are left out; the caller narrows further (to live
// work, say) as its report needs.
export function unattributed(
  works: RockWork[],
  lists: Pick<WorkLists, "projects" | "campaigns">,
): { projects: Project[]; campaigns: Campaign[] } {
  const claimedProjects = new Set(works.flatMap((w) => w.projects.map((p) => p.id)));
  const claimedCampaigns = new Set(
    works.flatMap((w) => [...w.campaigns, ...w.webinars].map((c) => c.id)),
  );
  return {
    projects: lists.projects.filter((p) => !p.archived && !claimedProjects.has(p.id)),
    campaigns: lists.campaigns.filter((c) => !claimedCampaigns.has(c.id)),
  };
}
