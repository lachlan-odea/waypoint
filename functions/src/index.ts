import { onRequest } from "firebase-functions/v2/https";
import { onDocumentCreated, onDocumentWritten } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { MAIL_SECRETS, sendMail } from "./graphMail";
import { joinWords, renderEmail, type EmailContent } from "./emailTemplate";
import {
  campaignAdditions,
  dateWithCountdown,
  describeCampaignDates,
  describeContentTypes,
  describeEventDates,
  describeMilestones,
  describePresence,
  eventLeadAdditions,
  EVENT_STATUS_LABELS,
  formatDate,
  normaliseName,
  projectAdditions,
  PROJECT_STATUS_LABELS,
  upcomingMilestones,
  WEBINAR_SECTION_TITLES,
  type Additions,
  type CampaignDoc,
  type EventDoc,
  type ProjectDoc,
} from "./membership";
import {
  attentionFlags,
  audienceLabel,
  dateLabel,
  deliverableLabel,
  formatRequestDateShort,
  LIVE_EVENTS_TEAM_EMAIL,
  parseSubmission,
  publishLabel,
  setupSummary,
  timeLabel,
  whereLabel,
  type LiveEventIntakeDoc,
  type LiveEventRequestDoc,
} from "./liveEventRequest";

initializeApp();
const db = getFirestore();

// Shared secret that Power Automate (or any other client) must include in the
// X-Waypoint-Secret header. Set via: firebase functions:secrets:set WAYPOINT_INGEST_SECRET
const INGEST_SECRET = defineSecret("WAYPOINT_INGEST_SECRET");

const ALLOWED_PRIORITIES = ["Urgent", "High", "Normal", "Low"] as const;
type Priority = (typeof ALLOWED_PRIORITIES)[number];

// Keep in step with SEED_WORKSPACES in src/constants.ts.
const ALLOWED_WORKSPACE_IDS = ["design", "video", "marketing", "comms", "events"];
const DEFAULT_WORKSPACE_ID = "design";

type IncomingBody = {
  title?: string;
  overview?: string;
  client?: string;
  brand?: string;
  contentType?: string;
  briefUrl?: string;
  dueDate?: string;
  priority?: string;
  workspaceId?: string;
  assigneeId?: string;
};

// HTTP endpoint that creates a Waypoint project from a JSON payload.
// Intended for Power Automate flows triggered from Teams messages, but it's
// generic enough for any HTTP client.
export const createProject = onRequest(
  {
    region: "us-central1",
    secrets: [INGEST_SECRET],
    cors: false,
    // Allow unauthenticated HTTPS invocations — Power Automate (or any HTTP
    // client) calls us without a Google identity. The function still gates
    // on the X-Waypoint-Secret header below.
    invoker: "public",
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "POST only" });
      return;
    }

    // Constant-time-ish secret compare. The header value comes from Power
    // Automate's flow definition (or whatever client is calling us).
    const provided = req.header("X-Waypoint-Secret");
    if (!provided || provided !== INGEST_SECRET.value()) {
      res.status(401).json({ error: "Bad or missing X-Waypoint-Secret header" });
      return;
    }

    const body = (req.body ?? {}) as IncomingBody;
    const title = (body.title ?? "").trim();
    if (!title) {
      res.status(400).json({ error: "title is required" });
      return;
    }

    const workspaceId =
      body.workspaceId && ALLOWED_WORKSPACE_IDS.includes(body.workspaceId)
        ? body.workspaceId
        : DEFAULT_WORKSPACE_ID;

    const priority: Priority = ALLOWED_PRIORITIES.includes(
      body.priority as Priority,
    )
      ? (body.priority as Priority)
      : "Normal";

    const now = new Date().toISOString();
    const id = `p-${Date.now()}`;

    const project = {
      id,
      workspaceId,
      title,
      overview: (body.overview ?? "").trim(),
      client: (body.client ?? "").trim(),
      brand: (body.brand ?? "").trim(),
      contentType: (body.contentType ?? "").trim(),
      briefUrl: (body.briefUrl ?? "").trim(),
      dueDate: (body.dueDate ?? "").trim(),
      priority,
      assigneeIds: body.assigneeId ? [body.assigneeId] : [],
      milestones: [],
      comments: [],
      createdAt: now,
      source: "teams" as const,
    };

    try {
      await db.collection("projects").doc(id).set(project);
      res.status(200).json({ ok: true, id });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: `Firestore write failed: ${message}` });
    }
  },
);

// ── Membership emails ──────────────────────────────────────────────────
// Whenever someone is added to a project (assigned or asked to review), a
// campaign (made the owner), a webinar (lead, a role on the team or a
// section's owner) or an event (named as the marketing or sales lead), they
// get one email saying so, sent through Microsoft Graph as the Entra app
// (graphMail.ts). Whoever made the change is never emailed about it: the
// client stamps `updatedBy` on every save (setProject / setCampaign /
// setEvent in src/firestore.ts), and that id is dropped from the list.
// Anyone can turn these off from My Desk → Notifications, which sets
// `emailAlerts: false` on their designer doc.
//
// Idempotency note: a Firestore retry could double-fire and produce a
// duplicate email. Acceptable for low volume; revisit with an
// idempotency-key store if duplicates become a problem.

// Public URL of the deployed Waypoint app, for the button in each email.
// Update if the hosting path ever changes.
const WAYPOINT_APP_URL = "https://lachlan-odea.github.io/waypoint/";

type DesignerDoc = {
  id?: string;
  name?: string;
  email?: string;
  // false when they've turned membership emails off; missing means on.
  emailAlerts?: boolean;
};

async function allDesigners(): Promise<Map<string, DesignerDoc>> {
  const snap = await db.collection("designers").get();
  return new Map(snap.docs.map((d) => [d.id, { ...(d.data() as DesignerDoc), id: d.id }]));
}

async function workspaceName(id: string): Promise<string> {
  const snap = await db.collection("workspaces").doc(id).get();
  const name = snap.exists ? ((snap.data() as { name?: string }).name ?? "") : "";
  return name || id;
}

function firstNameOf(d: DesignerDoc): string {
  return (d.name ?? "").trim().split(/\s+/)[0] || "there";
}

// "Alice added you to the project "X" on Waypoint as an assignee." With
// several reasons the sentence ends in a colon and the template lists them.
function introFor(actor: string | null, what: string, reasons: string[]): string {
  const lead = actor
    ? `${actor} added you to ${what} on Waypoint`
    : `you've been added to ${what} on Waypoint`;
  return reasons.length === 1 ? `${lead} ${reasons[0]}.` : `${lead}:`;
}

type ComposeContext = {
  reasons: string[];
  // Who made the change, by name, or null when unknown.
  actor: string | null;
  recipientId: string;
  // A designer's display name, or "" when unknown.
  nameOf: (id: string | undefined) => string;
};

type Composed = { subject: string; content: EmailContent };

// Email each newly added person, except whoever made the change and anyone
// who has turned email alerts off. One failure is logged and doesn't stop
// the others.
async function emailAdditions(
  additions: Additions,
  updatedBy: string | undefined,
  compose: (ctx: ComposeContext) => Composed,
): Promise<void> {
  if (updatedBy) additions.delete(updatedBy);
  if (additions.size === 0) return;
  const designers = await allDesigners();
  const nameOf = (id: string | undefined): string =>
    (id && designers.get(id)?.name?.trim()) || "";
  const actor = nameOf(updatedBy) || null;
  for (const [id, reasons] of additions) {
    const d = designers.get(id);
    if (!d?.email || d.emailAlerts === false) continue;
    const { subject, content } = compose({ reasons, actor, recipientId: id, nameOf });
    try {
      await sendMail({
        to: [d.email],
        subject,
        html: renderEmail(firstNameOf(d), content),
      });
    } catch (err) {
      logger.error("Membership email not sent", { to: d.email, subject, error: String(err) });
    }
  }
}

function namesExcept(ids: string[] | undefined, except: string, nameOf: ComposeContext["nameOf"]): string {
  return joinWords((ids ?? []).filter((id) => id !== except).map(nameOf).filter(Boolean));
}

function count(n: number, singular: string, plural = `${singular}s`): string {
  return n === 0 ? "" : `${n} ${n === 1 ? singular : plural}`;
}

export const notifyProjectMembers = onDocumentWritten(
  {
    document: "projects/{projectId}",
    region: "us-central1",
    secrets: MAIL_SECRETS,
  },
  async (event) => {
    const after = event.data?.after.data() as ProjectDoc | undefined;
    if (!after) return; // Deleted: nothing to say.
    const before = event.data?.before.data() as ProjectDoc | undefined;
    const additions = projectAdditions(before, after);
    if (additions.size === 0) return;

    const projectId = event.params.projectId;
    const title = (after.title ?? "").trim() || "a project";
    const team = after.workspaceId ? await workspaceName(after.workspaceId) : "";
    // ?project= is the deep link App.tsx already handles: it switches to the
    // project's team before opening the page.
    const url = `${WAYPOINT_APP_URL}?project=${encodeURIComponent(projectId)}`;

    await emailAdditions(additions, after.updatedBy, ({ reasons, actor, recipientId, nameOf }) => {
      const reviewOnly = reasons.length === 1 && reasons[0] === "as a reviewer";
      const heading = reviewOnly
        ? `Please review "${title}"`
        : `You've been added to "${title}"`;
      return {
        subject: `[Waypoint] ${heading}`,
        content: {
          kicker: `${team || "Project"}${team ? " project" : ""}`,
          heading,
          intro: introFor(actor, `the project "${title}"`, reasons),
          reasons,
          rows: [
            ["Client", after.client ?? ""],
            ["Brand", after.brand ?? ""],
            ["Content", describeContentTypes(after)],
            ["Priority", after.priority ?? ""],
            ["Status", PROJECT_STATUS_LABELS[after.status ?? ""] ?? (after.status ? after.status : "Active")],
            ["Due", dateWithCountdown(after.dueDate)],
            ["Also assigned", namesExcept(after.assigneeIds, recipientId, nameOf)],
            ["Reviewers", namesExcept(after.reviewerIds, recipientId, nameOf)],
            ["Milestones", describeMilestones(after)],
          ],
          about: after.overview ? { title: "Overview", text: after.overview } : undefined,
          links: after.briefUrl ? [{ label: "Open the brief", url: after.briefUrl }] : [],
          ctaLabel: "Open in Waypoint",
          ctaUrl: url,
        },
      };
    });
  },
);

// Keep in step with TYPES / DELIVERY_OPTS in src/webinarKit.ts.
const WEBINAR_TYPE_LABELS: Record<string, string> = {
  tl: "Thought Leadership",
  pdd: "Product Deep Dive",
  mpu: "Market Update",
};

function capitalise(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

export const notifyCampaignMembers = onDocumentWritten(
  {
    document: "campaigns/{campaignId}",
    region: "us-central1",
    secrets: MAIL_SECRETS,
  },
  async (event) => {
    const after = event.data?.after.data() as CampaignDoc | undefined;
    if (!after) return;
    const before = event.data?.before.data() as CampaignDoc | undefined;
    const additions = campaignAdditions(before, after);
    if (additions.size === 0) return;

    const campaignId = event.params.campaignId;
    const name = (after.name ?? "").trim() || "a campaign";
    const url = `${WAYPOINT_APP_URL}#campaign/${encodeURIComponent(campaignId)}/overview`;
    const kit = after.webinar;

    await emailAdditions(additions, after.updatedBy, ({ reasons, actor, recipientId, nameOf }) => {
      if (kit) {
        const title = (kit.ft || kit.wt || "").trim();
        const mySections = Object.entries(kit.sec ?? {})
          .filter(([, s]) => s?.who === recipientId)
          .map(([k, s]) => {
            const label = WEBINAR_SECTION_TITLES[k] ?? k;
            return s?.due ? `${label}, due ${formatDate(s.due)}` : label;
          });
        return {
          subject: `[Waypoint] You've been added to the webinar "${name}"`,
          content: {
            kicker: "Webinar",
            heading: `You've been added to "${name}"`,
            intro: introFor(actor, `the webinar "${name}"`, reasons),
            reasons,
            rows: [
              ["Title", title && title !== name ? title : ""],
              ["Series type", WEBINAR_TYPE_LABELS[kit.type ?? ""] ?? kit.type ?? ""],
              ["Delivery", kit.delivery === "prerecorded" ? "Pre-recorded" : kit.delivery === "live" ? "Live" : ""],
              ["Go-live", dateWithCountdown(kit.goLive)],
              ["Recording", kit.delivery === "prerecorded" ? dateWithCountdown(kit.recordDate) : ""],
              ["Sessions", kit.sessions ?? ""],
              ["Duration", kit.duration ?? ""],
              ["Stage", capitalise(kit.stage ?? "")],
              ["Brand", after.brand ?? ""],
              ["Lead", nameOf(kit.lead)],
            ],
            about: after.description ? { title: "About", text: after.description } : undefined,
            list: mySections.length > 0 ? { title: "Sections you own", items: mySections } : undefined,
            ctaLabel: "Open the webinar",
            ctaUrl: url,
          },
        };
      }
      const projects = (after.projectIds ?? []).length;
      return {
        subject: `[Waypoint] You now own the campaign "${name}"`,
        content: {
          kicker: "Campaign",
          heading: `You now own "${name}"`,
          intro: introFor(actor, `the campaign "${name}"`, reasons),
          reasons,
          rows: [
            ["Brand", after.brand ?? ""],
            ["Type", after.category ?? ""],
            ["Runs", describeCampaignDates(after)],
            ["Milestones", count((after.milestones ?? []).length, "milestone")],
            ["Projects", count(projects, "contributing project")],
          ],
          about: after.description ? { title: "About", text: after.description } : undefined,
          list: { title: "Next milestones", items: upcomingMilestones(after) },
          ctaLabel: "Open the campaign",
          ctaUrl: url,
        },
      };
    });
  },
);

export const notifyEventLeads = onDocumentWritten(
  {
    document: "events/{eventId}",
    region: "us-central1",
    secrets: MAIL_SECRETS,
  },
  async (event) => {
    const after = event.data?.after.data() as EventDoc | undefined;
    if (!after) return;
    const before = event.data?.before.data() as EventDoc | undefined;
    const named = eventLeadAdditions(before, after);
    if (named.length === 0) return;

    // Leads are typed as names; only those that match someone on Waypoint
    // can be emailed.
    const designers = await allDesigners();
    const additions: Additions = new Map();
    for (const { name, reason } of named) {
      const key = normaliseName(name);
      const match = [...designers.values()].find((d) => normaliseName(d.name ?? "") === key);
      if (!match?.id) continue;
      const list = additions.get(match.id) ?? [];
      if (!list.includes(reason)) list.push(reason);
      additions.set(match.id, list);
    }
    if (additions.size === 0) return;

    const eventId = event.params.eventId;
    const name = (after.name ?? "").trim() || "an event";
    const url = `${WAYPOINT_APP_URL}#event/${encodeURIComponent(eventId)}/overview`;
    const campaignName = after.campaignId
      ? ((await db.collection("campaigns").doc(after.campaignId).get()).data() as CampaignDoc | undefined)?.name ?? ""
      : "";

    await emailAdditions(additions, after.updatedBy, ({ reasons, actor }) => ({
      subject: `[Waypoint] You've been added to the event "${name}"`,
      content: {
        kicker: "Event",
        heading: `You've been added to "${name}"`,
        intro: introFor(actor, `the event "${name}"`, reasons),
        reasons: reasons.length > 1 ? [joinWords(reasons)] : reasons,
        rows: [
          ["When", describeEventDates(after)],
          ["Where", after.location ?? ""],
          ["Region", after.region ?? ""],
          ["Division", after.division ?? ""],
          ["Status", EVENT_STATUS_LABELS[after.status ?? ""] ?? capitalise(after.status ?? "")],
          ["Our presence", describePresence(after)],
          ["Speaking", after.speakingOpportunity ?? ""],
          ["Audience", after.audience ?? ""],
          ["Marketing lead", after.marketingLead ?? ""],
          ["Sales lead", after.salesLead ?? ""],
          ["Campaign code", after.campaignCode ?? ""],
          ["Campaign", campaignName],
          ["Projects", count((after.projectIds ?? []).length, "project doing work for it", "projects doing work for it")],
        ],
        about: after.notes ? { title: "Notes", text: after.notes } : undefined,
        ctaLabel: "Open the event",
        ctaUrl: url,
      },
    }));
  },
);

// ── New live event requests ────────────────────────────────────────────
// The Live event request form on SharePoint writes a pending document to
// /liveEventRequests (see src/liveEventRequestExport.ts). Each one emails
// the Live Events Team's mailbox, from /settings/liveEventIntake.teamEmail
// (the same address the form shows), with the request summarised and a
// link that opens it on the Video board. Events the team adds themselves
// from the board arrive already approved and aren't announced.
export const notifyLiveEventRequest = onDocumentCreated(
  {
    document: "liveEventRequests/{requestId}",
    region: "us-central1",
    secrets: MAIL_SECRETS,
  },
  async (event) => {
    const doc = event.data?.data() as LiveEventRequestDoc | undefined;
    if (!doc) return;
    if (doc.source === "team" || (doc.status ?? "pending") !== "pending") return;

    const intakeSnap = await db.collection("settings").doc("liveEventIntake").get();
    const intake = (intakeSnap.data() ?? {}) as LiveEventIntakeDoc;
    const to = intake.teamEmail?.trim() || LIVE_EVENTS_TEAM_EMAIL;

    const s = parseSubmission(doc.json);
    const eventName = (doc.eventName ?? s.eventName).trim() || "Untitled event";
    const requester = (doc.requesterName ?? s.name).trim() || "Someone";
    const requesterEmail = (doc.requesterEmail ?? s.email).trim();
    const requestId = event.params.requestId;
    const url = `${WAYPOINT_APP_URL}?request=${encodeURIComponent(requestId)}`;
    const dateShort = s.dateTbc || !s.date ? "date TBC" : formatRequestDateShort(s.date);
    const flags = attentionFlags(s);

    const contact =
      s.primaryContact && s.primaryContact !== "Me" && (s.contactName || s.contactEmail)
        ? [s.contactName, s.contactEmail].filter(Boolean).join(", ")
        : "";

    const content: EmailContent = {
      kicker: "Live event request",
      heading: `New request: "${eventName}"`,
      intro: `${requester}${s.team ? ` (${s.team})` : ""} has asked for the Live Events Team's support with "${eventName}" on ${dateLabel(s)}. Open it on the Video board to approve or decline.`,
      rows: [
        ["Requested by", [requester, requesterEmail].filter(Boolean).join(", ")],
        ["Primary contact", contact],
        ["Date", dateLabel(s)],
        ["Time", timeLabel(s)],
        ["Where", whereLabel(s)],
        ["Audience", audienceLabel(s)],
        ["Access", s.access],
        ["Deliver", deliverableLabel(s)],
        ["Publish", wantsPublish(s) ? publishLabel(s) : ""],
        ["Setup", setupSummary(s)],
      ],
      about: s.notes ? { title: "Notes from the requester", text: s.notes } : undefined,
      list: flags.length > 0 ? { title: "For the team's attention", items: flags } : undefined,
      links: requesterEmail
        ? [{ label: `Email ${requester}`, url: `mailto:${requesterEmail}?subject=${encodeURIComponent(`Re: Live event request – ${eventName}`)}` }]
        : [],
      ctaLabel: "Open the request",
      ctaUrl: url,
    };

    try {
      await sendMail({
        to: [to],
        subject: `[Waypoint] New live event request: ${eventName} (${dateShort})`,
        html: renderEmail("team", content),
      });
    } catch (err) {
      logger.error("Live event request email not sent", { to, requestId, error: String(err) });
    }
  },
);

function wantsPublish(s: ReturnType<typeof parseSubmission>): boolean {
  return s.deliverables === "On-demand edit" || s.deliverables === "Both";
}
