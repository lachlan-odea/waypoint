import { onRequest } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

initializeApp();
const db = getFirestore();

// Shared secret that Power Automate (or any other client) must include in the
// X-Waypoint-Secret header. Set via: firebase functions:secrets:set WAYPOINT_INGEST_SECRET
const INGEST_SECRET = defineSecret("WAYPOINT_INGEST_SECRET");

const ALLOWED_PRIORITIES = ["Urgent", "High", "Normal", "Low"] as const;
type Priority = (typeof ALLOWED_PRIORITIES)[number];

// Keep in step with SEED_WORKSPACES in src/constants.ts.
const ALLOWED_WORKSPACE_IDS = ["design", "video", "marketing", "comms"];
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

type CampaignDoc = {
  name?: string;
  brand?: string;
  category?: string;
  owner?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  color?: string;
  evergreen?: boolean;
  milestones?: { id?: string; date?: string; label?: string; done?: boolean }[];
};

// Tokens are 32 hex characters (see newShareToken in src/campaignExport.ts).
// Anything else is rejected before it costs a Firestore read.
const SHARE_TOKEN_PATTERN = /^[0-9a-f]{32}$/;

// Read-only feed behind the SharePoint page a campaign can be downloaded
// as. The page is hosted on SharePoint and opened by people who aren't on
// Waypoint, so it can't sign in to Firestore; it fetches this instead, each
// time it's opened, so it always shows the campaign as it stands now.
//
// Public on purpose, and the token is the only key: the campaign is found
// by its shareToken field, never by id. The response is an explicit
// allow-list of fields — contributing projects (projectIds) and anything
// added to campaigns later stay out until someone adds them here.
export const campaignSummary = onRequest(
  {
    region: "us-central1",
    // The page is served from a SharePoint origin we don't know in advance.
    cors: true,
    invoker: "public",
  },
  async (req, res) => {
    if (req.method !== "GET") {
      res.status(405).json({ error: "GET only" });
      return;
    }
    const token = String(req.query.token ?? "");
    if (!SHARE_TOKEN_PATTERN.test(token)) {
      res.status(400).json({ error: "Bad or missing token" });
      return;
    }

    // Edits should show the next time the page is opened, not after a cache
    // expires somewhere between here and SharePoint.
    res.set("Cache-Control", "no-store");

    try {
      const snap = await db
        .collection("campaigns")
        .where("shareToken", "==", token)
        .limit(1)
        .get();
      if (snap.empty) {
        res.status(404).json({ error: "Campaign not found" });
        return;
      }
      const c = snap.docs[0].data() as CampaignDoc;
      res.status(200).json({
        name: c.name ?? "",
        brand: c.brand ?? "",
        category: c.category ?? "",
        owner: c.owner ?? "",
        description: c.description ?? "",
        startDate: c.startDate ?? "",
        endDate: c.endDate ?? "",
        color: c.color ?? "",
        evergreen: !!c.evergreen,
        milestones: (c.milestones ?? []).map((m) => ({
          id: m.id ?? "",
          date: m.date ?? "",
          label: m.label ?? "",
          done: !!m.done,
        })),
        fetchedAt: new Date().toISOString(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: `Firestore read failed: ${message}` });
    }
  },
);

// Public URL of the deployed Waypoint app — used in email bodies so the
// reviewer can deep-link straight to the project. Update if the hosting
// path ever changes.
const WAYPOINT_APP_URL = "https://lachlan-odea.github.io/waypoint/";

type ProjectDoc = {
  id?: string;
  title?: string;
  brand?: string;
  priority?: string;
  dueDate?: string;
  workspaceId?: string;
  reviewerIds?: string[];
};

type DesignerDoc = {
  name?: string;
  email?: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Fires whenever a project is created or updated. When reviewerIds gains
// new entries, write a doc to /mail for each newly added reviewer; the
// Firebase Trigger Email extension (installed separately via the Firebase
// console) watches /mail and delivers via the configured SMTP provider.
//
// Idempotency note: a Firestore retry could double-fire and produce a
// duplicate email. Acceptable for low volume; revisit with an
// idempotency-key store if duplicates become a problem.
export const notifyReviewerAssigned = onDocumentWritten(
  {
    document: "projects/{projectId}",
    region: "us-central1",
  },
  async (event) => {
    const after = event.data?.after.data() as ProjectDoc | undefined;
    if (!after) return; // Project deleted — nothing to notify on.

    const before = event.data?.before.data() as ProjectDoc | undefined;
    const beforeIds = new Set(before?.reviewerIds ?? []);
    const newReviewerIds = (after.reviewerIds ?? []).filter(
      (id) => !beforeIds.has(id),
    );
    if (newReviewerIds.length === 0) return;

    const projectId = event.params.projectId;
    const title = (after.title ?? "a project").trim() || "a project";
    const projectUrl = `${WAYPOINT_APP_URL}?project=${encodeURIComponent(projectId)}`;

    for (const reviewerId of newReviewerIds) {
      const snap = await db.collection("designers").doc(reviewerId).get();
      if (!snap.exists) continue;
      const designer = snap.data() as DesignerDoc;
      if (!designer.email) continue;

      const firstName = (designer.name ?? "").split(" ")[0] || "there";
      const metaRows = [
        after.brand ? ["Brand", after.brand] : null,
        after.priority ? ["Priority", after.priority] : null,
        after.dueDate ? ["Due", after.dueDate] : null,
      ].filter(Boolean) as [string, string][];

      const textBody = [
        `Hi ${firstName},`,
        ``,
        `You've been asked to review "${title}" on Waypoint.`,
        ...metaRows.map(([k, v]) => `${k}: ${v}`),
        ``,
        `Open in Waypoint: ${projectUrl}`,
        ``,
        `— Waypoint`,
      ].join("\n");

      const htmlBody = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; max-width: 540px; color: #1d2433;">
          <h2 style="font-size: 18px; margin: 0 0 8px;">Please review &ldquo;${escapeHtml(title)}&rdquo;</h2>
          <p style="margin: 8px 0; color: #475569;">
            Hi ${escapeHtml(firstName)}, you've been asked to review a project on Waypoint.
          </p>
          ${
            metaRows.length === 0
              ? ""
              : `<table style="border-collapse: collapse; font-size: 14px; margin: 16px 0;">
                  ${metaRows
                    .map(
                      ([k, v]) =>
                        `<tr><td style="padding: 4px 12px 4px 0; color: #64748b;">${escapeHtml(
                          k,
                        )}</td><td>${escapeHtml(v)}</td></tr>`,
                    )
                    .join("")}
                </table>`
          }
          <a href="${projectUrl}" style="display: inline-block; background: #4f46e5; color: white; text-decoration: none; padding: 10px 18px; border-radius: 8px; font-weight: 600;">Open in Waypoint</a>
        </div>
      `.trim();

      await db.collection("mail").add({
        to: [designer.email],
        message: {
          subject: `[Waypoint] Please review "${title}"`,
          text: textBody,
          html: htmlBody,
        },
      });
    }
  },
);
