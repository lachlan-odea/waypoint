import { onRequest } from "firebase-functions/v2/https";
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

const ALLOWED_WORKSPACE_IDS = ["design", "video", "marketing"];
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
