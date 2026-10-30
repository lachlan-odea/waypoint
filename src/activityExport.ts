import type { Campaign, CampaignMilestone, Designer, MarketingEvent, SocialPost } from "./types";
import template from "./activityPage.template.html?raw";
import appIconSvg from "../public/logos/waypoint-app-icon.svg?raw";
import { firebaseConfig } from "./firebase";
import { setActivityPage } from "./firestore";
import { eventPhase, eventStatusMeta, formatEventDates } from "./events";
import { campaignPhase } from "./campaigns";
import { DELIVERY, FORMATS, STAGE_LABEL, TYPES, kitOf, kitState } from "./webinarKit";
import { newShareToken } from "./campaignExport";

// Every piece of marketing activity — campaigns, webinars and events — as
// one standalone page for SharePoint, with each activity opening to its own
// information page inside the same file. Works like a campaign's page:
// downloaded as .aspx, fetches a public copy of the data every time it's
// opened, so it keeps up without anyone re-uploading it.
//
// The public copy lives at /activityPages/{shareToken}, written on every
// campaign or event save (publishActivityPage, from App) and readable by
// anyone holding the exact token. The token and the page's SharePoint link
// are kept in /settings/activityPage.
//
// The page is for people outside the marketing team: dates, assets and
// who to talk to. Internal working detail (projects, checklists, section
// statuses, spend, notes, SharePoint working pages) is left out here, so
// it never reaches the public copy.
//
// The page stands alone, so nothing in the template names Waypoint.

export { newShareToken };

function activityPageUrl(shareToken: string): string {
  const { projectId, apiKey } = firebaseConfig;
  return (
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)` +
    `/documents/activityPages/${shareToken}?key=${apiKey}`
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function milestoneLink(m: CampaignMilestone, posts: SocialPost[]): { url?: string; linkText?: string } {
  const post = m.socialPostId ? posts.find((p) => p.id === m.socialPostId) : undefined;
  if (post?.postUrl) return { url: post.postUrl, linkText: "View live post" };
  if (m.url) return { url: m.url, linkText: "Open link" };
  return {};
}

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

// What the page shows. An explicit shape, so nothing internal leaks: no
// ids of people, no kit field values beyond what a reader needs.
export function activityPageData(
  campaigns: Campaign[],
  events: MarketingEvent[],
  posts: SocialPost[],
  designers: Designer[],
) {
  const today = new Date().toISOString().slice(0, 10);
  const name = (id?: string) => (id ? (designers.find((d) => d.id === id)?.name ?? "") : "");

  const campaignRows = campaigns.map((c) => {
    const kit = kitOf(c);
    const base = {
      id: c.id,
      kind: kit ? "webinar" : "campaign",
      name: c.name,
      brand: c.brand,
      category: c.category ?? "",
      owner: c.ownerId ? name(c.ownerId) || c.owner : c.owner,
      description: c.description,
      startDate: c.startDate,
      endDate: c.endDate,
      evergreen: !!c.evergreen,
      phase: campaignPhase(c, today),
      color: c.color,
      milestones: c.milestones
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((m) => ({ id: m.id, date: m.date, label: m.label, description: m.description ?? "", done: m.done, ...milestoneLink(m, posts) })),
    };
    if (!kit) return base;
    const st = kitState(kit, today);
    const speakers = kit.items
      .filter((i) => i.kind === "speaker" && !i.list)
      .sort((a, b) => a.order - b.order)
      .map((i) => ({
        name: str(i.d.name),
        title: str(i.d.title),
        role: str(i.d.role),
        bio: str(i.d.bio),
        headshot: str(i.d.headshot),
      }))
      .filter((s) => s.name);
    const brief = kit.values.brief ?? {};
    const landing = kit.values.landing ?? {};
    return {
      ...base,
      webinar: {
        stage: kit.stage,
        stageLabel: STAGE_LABEL[kit.stage] ?? kit.stage,
        typeLabel: TYPES[kit.type]?.label ?? "Webinar",
        deliveryLabel: DELIVERY[kit.delivery] ?? "",
        formatLabel: kit.format ? (FORMATS[kit.format]?.label ?? kit.format) : "",
        goLive: kit.goLive,
        recordDate: kit.delivery === "prerecorded" ? kit.recordDate : "",
        sessions: kit.sessions,
        duration: kit.duration,
        workingTitle: kit.wt,
        finalTitle: kit.ft,
        series: kit.series,
        episode: kit.ep ?? null,
        lead: name(kit.lead),
        summary: str(landing.summary),
        learn: str(landing.learn),
        audience: Array.isArray(brief.audience) ? brief.audience : [],
        landingLink: str(landing.landingLink),
        // The kit's sections as key dates only: title, due, done or not.
        sections: st.infos.map((i) => ({
          n: i.s.n,
          title: i.s.title,
          due: i.due,
          done: i.st === "done",
        })),
        speakers,
      },
    };
  });

  const eventRows = events.map((e) => {
    const phase = eventPhase(e, today);
    const linked = e.campaignId ? campaigns.find((c) => c.id === e.campaignId) : undefined;
    return {
      id: e.id,
      kind: "event",
      name: e.name,
      status: phase,
      statusLabel: eventStatusMeta(phase).label,
      year: e.year,
      startDate: e.startDate,
      endDate: e.endDate,
      tbcMonth: e.tbcMonth ?? "",
      datesText: formatEventDates(e),
      datesAsPublished: e.datesAsPublished ?? "",
      division: e.division,
      region: e.region ?? "",
      location: e.location ?? "",
      audience: e.audience ?? "",
      sponsor: !!e.sponsor,
      sponsorNote: e.sponsorNote ?? "",
      booth: !!e.booth,
      boothNote: e.boothNote ?? "",
      attendAndSell: !!e.attendAndSell,
      speaking: e.speakingOpportunity ?? "",
      marketingLead: e.marketingLead ?? "",
      salesLead: e.salesLead ?? "",
      salesAttendees: e.salesAttendees ?? "",
      salesAttendeeCount: e.salesAttendeeCount ?? null,
      academy: e.academyAttendee ?? "",
      partners: e.partnerAttendees ?? "",
      campaignId: linked?.id ?? "",
      campaignName: linked?.name ?? "",
      comms: e.comms ?? null,
      opps: e.opps ?? null,
    };
  });

  return { updatedAt: new Date().toISOString(), campaigns: campaignRows, events: eventRows };
}

export type ActivityPageData = ReturnType<typeof activityPageData>;

// Refresh the public copy. Nothing is written without a token.
export function publishActivityPage(
  shareToken: string | undefined,
  campaigns: Campaign[],
  events: MarketingEvent[],
  posts: SocialPost[],
  designers: Designer[],
): Promise<void> {
  if (!shareToken) return Promise.resolve();
  return setActivityPage(shareToken, JSON.stringify(activityPageData(campaigns, events, posts, designers)));
}

export function activityPageHtml(shareToken: string, data: ActivityPageData): string {
  const snapshot = JSON.stringify(data).replace(/</g, "\\u003c");
  const fill: Record<string, string> = {
    __ACTIVITY_TITLE__: escapeHtml("Marketing activity"),
    __ACTIVITY_SNAPSHOT__: snapshot,
    __ACTIVITY_FEED_URL__: activityPageUrl(shareToken),
    // The app icon, inline, so the tab shows the mark wherever the file
    // is hosted.
    __ACTIVITY_FAVICON__: "data:image/svg+xml," + encodeURIComponent(appIconSvg.trim()),
  };
  return template.replace(/__ACTIVITY_[A-Z_]+__/g, (key) => fill[key] ?? key);
}

export const ACTIVITY_PAGE_FILE_NAME = "marketing-activity.aspx";

export function downloadActivityPage(shareToken: string, data: ActivityPageData): void {
  const blob = new Blob([activityPageHtml(shareToken, data)], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = ACTIVITY_PAGE_FILE_NAME;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
