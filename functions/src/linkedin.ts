// LinkedIn for the Social calendar: publishing a post to a company page and
// reading back how the page's posts performed, through LinkedIn's Community
// Management API.
//
// How it fits together:
//
// - A page admin connects once from Settings → LinkedIn (linkedinConnect →
//   LinkedIn's consent screen → linkedinAuthCallback). LinkedIn only gives
//   page access through a person who administers the page, so everything
//   here acts as that person. Their token is kept in /linkedinPrivate,
//   which no client can read (firestore.rules), and renewed from here.
// - linkedinPublish posts one Social calendar entry to the page its channel
//   maps to (/settings/linkedin.pages), with an optional image, document or
//   link card.
// - linkedinNightlySync (and linkedinSyncNow, on demand) lists each page's
//   posts, fetches their statistics and the page's followers, and writes
//   them to /linkedinPostStats and /linkedin, which the app reads.
//
// Only super users can call any of it. The app id and secret are the
// LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET secrets:
// `firebase functions:secrets:set <NAME>`.

import { HttpsError, onCall, onRequest, type CallableRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { randomBytes } from "node:crypto";
import {
  fromLittleText,
  isFetchableUrl,
  matchByText,
  parseLinkPreview,
  postUrlFor,
  postUrnIn,
  statsDocId,
  toLittleText,
  type MatchablePost,
} from "./linkedinText";

const LINKEDIN_CLIENT_ID = defineSecret("LINKEDIN_CLIENT_ID");
const LINKEDIN_CLIENT_SECRET = defineSecret("LINKEDIN_CLIENT_SECRET");
const LINKEDIN_SECRETS = [LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET];

const REGION = "us-central1";
const API = "https://api.linkedin.com";
// LinkedIn retires each monthly version about a year after it ships, so
// this needs moving forward now and then. Supported versions:
// https://learn.microsoft.com/linkedin/marketing/versioning
const API_VERSION = "202610";

// What the app asks the admin to grant. All four come with the Community
// Management API product.
const SCOPES = [
  "r_basicprofile",
  "w_organization_social",
  "r_organization_social",
  "rw_organization_admin",
];

// Keep in step with WAYPOINT_APP_URL in index.ts.
const APP_URL = "https://lachlan-odea.github.io/waypoint/";
const ALLOWED_ORIGINS = [
  "https://lachlan-odea.github.io",
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
];

// Keep in step with SUPER_USER_EMAILS in src/constants.ts.
const SUPER_USER_EMAILS = ["lachlan.odea@wisetechglobal.com"];

// Keep in step with DEFAULT_LINKEDIN_PAGES in src/linkedin.ts: which page a
// channel posts to until /settings/linkedin says otherwise.
const DEFAULT_PAGES: PageMapping[] = [{ channel: "CargoWise", orgId: "19179877" }];

const DAY_MS = 86_400_000;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_COPY_CHARS = 3000;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif"];
const DOCUMENT_TYPES = [
  "application/pdf",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

// Roles that may post as the page, and the one role LinkedIn lets read a
// page's statistics.
const POSTING_ROLES = [
  "ADMINISTRATOR",
  "CONTENT_ADMINISTRATOR",
  "CONTENT_ADMIN",
  "DIRECT_SPONSORED_CONTENT_POSTER",
];
const STATS_ROLE = "ADMINISTRATOR";

// initializeApp() runs in index.ts after this module has loaded, so the
// database handle is fetched when it's first needed, not at import.
function db(): Firestore {
  return getFirestore();
}

// The address LinkedIn sends the admin back to. It has to be listed, to the
// character, under the LinkedIn app's Auth → OAuth 2.0 settings.
function redirectUri(): string {
  const project = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT ?? "wtg-waypoint";
  return `https://${REGION}-${project}.cloudfunctions.net/linkedinAuthCallback`;
}

// ── Stored shapes ──────────────────────────────────────────────────────

type OrgAccess = {
  id: string;
  name: string;
  vanityName?: string;
  roles: string[];
};

// /linkedinPrivate/connection. Never readable by a client.
type Connection = {
  accessToken: string;
  // Milliseconds since the epoch.
  accessExpiresAt: number;
  refreshToken?: string;
  refreshExpiresAt?: number;
  scope?: string;
  memberName: string;
  connectedByUid: string;
  connectedByName: string;
  connectedAt: string;
  organizations: OrgAccess[];
};

type PageMapping = { channel: string; orgId: string };

const connectionRef = () => db().doc("linkedinPrivate/connection");
const statusRef = () => db().doc("linkedin/status");

function iso(ms: number | undefined): string | null {
  return ms ? new Date(ms).toISOString() : null;
}

// What the app is allowed to know about the connection: who, when, which
// pages and until when. No tokens.
function publicStatus(c: Connection): Record<string, unknown> {
  return {
    connected: true,
    memberName: c.memberName,
    connectedByName: c.connectedByName,
    connectedAt: c.connectedAt,
    accessExpiresAt: iso(c.accessExpiresAt),
    refreshExpiresAt: iso(c.refreshExpiresAt),
    organizations: c.organizations,
    apiVersion: API_VERSION,
  };
}

// ── Who's calling ──────────────────────────────────────────────────────

type Caller = { uid: string; name: string };

// Everything here posts as, or reads the private numbers of, the company's
// page, so it's held to super users: a signed-in (not anonymous) account
// whose designer profile carries the flag, or a bootstrap email.
async function requireSuperUser(req: CallableRequest<unknown>): Promise<Caller> {
  const auth = req.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Sign in to Waypoint first.");
  if (auth.token.firebase?.sign_in_provider === "anonymous") {
    throw new HttpsError("permission-denied", "Sign in to Waypoint first.");
  }
  const snap = await db().collection("designers").doc(auth.uid).get();
  const designer = (snap.data() ?? {}) as { name?: string; isSuperUser?: boolean };
  const email = String(auth.token.email ?? "").toLowerCase();
  const allowed = designer.isSuperUser === true || SUPER_USER_EMAILS.includes(email);
  if (!allowed) {
    throw new HttpsError("permission-denied", "Only super users can use LinkedIn from Waypoint.");
  }
  return { uid: auth.uid, name: (designer.name ?? "").trim() || email || "A super user" };
}

// ── Talking to LinkedIn ────────────────────────────────────────────────

class LinkedInError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    what: string,
  ) {
    super(`LinkedIn ${what} failed: ${status} ${body.slice(0, 600)}`);
  }

  // The sentence LinkedIn gave, when the body is its usual JSON.
  get detail(): string {
    try {
      const j = JSON.parse(this.body) as { message?: string; error_description?: string };
      return (j.message ?? j.error_description ?? "").trim();
    } catch {
      return "";
    }
  }
}

type LiInit = { method?: string; body?: unknown; headers?: Record<string, string> };

async function li(token: string, path: string, what: string, init: LiInit = {}): Promise<Response> {
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "LinkedIn-Version": API_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) throw new LinkedInError(res.status, await res.text(), what);
  return res;
}

async function liJson<T>(token: string, path: string, what: string, init: LiInit = {}): Promise<T> {
  return (await (await li(token, path, what, init)).json()) as T;
}

// What to tell the person in the app when LinkedIn says no.
function asHttpsError(err: unknown): HttpsError {
  if (err instanceof HttpsError) return err;
  if (err instanceof LinkedInError) {
    logger.error(err.message);
    const detail = err.detail ? ` LinkedIn said: ${err.detail}` : "";
    if (err.status === 401) {
      return new HttpsError(
        "failed-precondition",
        "LinkedIn no longer accepts the saved sign-in. Reconnect it from Settings → LinkedIn.",
      );
    }
    if (err.status === 403) {
      return new HttpsError(
        "permission-denied",
        `LinkedIn refused this for the connected account, usually because of its role on the page.${detail}`,
      );
    }
    if (err.status === 429) {
      return new HttpsError("resource-exhausted", "LinkedIn's daily limit for the app has been reached. Try again tomorrow.");
    }
    return new HttpsError("internal", `LinkedIn couldn't do that (${err.status}).${detail}`);
  }
  logger.error("LinkedIn call failed", { error: String(err) });
  return new HttpsError("internal", err instanceof Error ? err.message : String(err));
}

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
};

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      ...params,
      client_id: LINKEDIN_CLIENT_ID.value().trim(),
      client_secret: LINKEDIN_CLIENT_SECRET.value().trim(),
    }),
  });
  if (!res.ok) throw new LinkedInError(res.status, await res.text(), "token request");
  return (await res.json()) as TokenResponse;
}

// The saved connection with a token that's good to use, renewing it first
// when it's within a week of expiring and LinkedIn gave the app a refresh
// token. Without one (LinkedIn only issues them to some apps) the admin has
// to reconnect every 60 days; Settings shows the date.
async function getConnection(): Promise<Connection> {
  const snap = await connectionRef().get();
  if (!snap.exists) {
    throw new HttpsError("failed-precondition", "LinkedIn isn't connected yet. A page admin connects it from Settings → LinkedIn.");
  }
  let c = snap.data() as Connection;
  const now = Date.now();
  const refreshable = !!c.refreshToken && (c.refreshExpiresAt ?? 0) > now + 60_000;
  if (c.accessExpiresAt - now < 7 * DAY_MS && refreshable) {
    try {
      const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: c.refreshToken as string });
      c = {
        ...c,
        accessToken: t.access_token,
        accessExpiresAt: now + t.expires_in * 1000,
        refreshToken: t.refresh_token ?? c.refreshToken,
        refreshExpiresAt: t.refresh_token_expires_in ? now + t.refresh_token_expires_in * 1000 : c.refreshExpiresAt,
      };
      await connectionRef().set(c);
      await statusRef().set(publicStatus(c), { merge: true });
    } catch (err) {
      // Still usable until it actually expires; the next call tries again.
      logger.warn("LinkedIn token refresh failed", { error: String(err) });
    }
  }
  if (c.accessExpiresAt <= now) {
    throw new HttpsError("failed-precondition", "The LinkedIn sign-in has expired. Reconnect it from Settings → LinkedIn.");
  }
  return c;
}

function orgUrn(orgId: string): string {
  return `urn:li:organization:${orgId}`;
}

const enc = encodeURIComponent;

// The pages the connected member has an approved role on, with their names.
async function loadOrganizations(token: string): Promise<OrgAccess[]> {
  const roles = new Map<string, Set<string>>();
  for (let start = 0; start < 1000; start += 100) {
    const page = await liJson<{
      elements?: { role?: string; organization?: string; organizationTarget?: string }[];
    }>(token, `/rest/organizationAcls?q=roleAssignee&state=APPROVED&count=100&start=${start}`, "page roles lookup");
    const elements = page.elements ?? [];
    for (const e of elements) {
      const id = /^urn:li:organization(?:Brand)?:(\d+)$/.exec(e.organization ?? e.organizationTarget ?? "")?.[1];
      if (!id || !e.role) continue;
      roles.set(id, (roles.get(id) ?? new Set()).add(e.role));
    }
    if (elements.length < 100) break;
  }

  const ids = [...roles.keys()];
  const names = new Map<string, { name: string; vanityName?: string }>();
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    try {
      const j = await liJson<{
        results?: Record<string, { localizedName?: string; vanityName?: string }>;
      }>(token, `/rest/organizationsLookup?ids=List(${chunk.join(",")})`, "page names lookup");
      for (const [id, o] of Object.entries(j.results ?? {})) {
        names.set(id, { name: o.localizedName ?? "", vanityName: o.vanityName });
      }
    } catch (err) {
      logger.warn("LinkedIn page names lookup failed", { error: String(err) });
    }
  }

  return ids
    .map((id) => {
      const n = names.get(id);
      return {
        id,
        name: n?.name || `Page ${id}`,
        ...(n?.vanityName ? { vanityName: n.vanityName } : {}),
        roles: [...(roles.get(id) ?? [])].sort(),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function pageMappings(): Promise<PageMapping[]> {
  const snap = await db().doc("settings/linkedin").get();
  const raw = (snap.data() as { pages?: unknown } | undefined)?.pages;
  if (!Array.isArray(raw)) return DEFAULT_PAGES;
  return raw
    .map((p) => ({
      channel: String((p as PageMapping)?.channel ?? "").trim(),
      orgId: String((p as PageMapping)?.orgId ?? "").trim(),
    }))
    .filter((p) => p.channel && /^\d+$/.test(p.orgId));
}

function sameChannel(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// ── Connecting ─────────────────────────────────────────────────────────

const callable = {
  region: REGION,
  cors: ALLOWED_ORIGINS,
  secrets: LINKEDIN_SECRETS,
  invoker: "public" as const,
};

// Step one of connecting: hand the app the address of LinkedIn's consent
// screen. The `state` it carries is remembered here for fifteen minutes, so
// the callback only accepts a sign-in a super user actually started.
export const linkedinConnect = onCall(callable, async (req) => {
  const caller = await requireSuperUser(req);
  const state = randomBytes(24).toString("hex");
  await db().doc(`linkedinPrivate/state-${state}`).set({
    uid: caller.uid,
    name: caller.name,
    createdAt: Date.now(),
  });
  const query = new URLSearchParams({
    response_type: "code",
    client_id: LINKEDIN_CLIENT_ID.value().trim(),
    redirect_uri: redirectUri(),
    state,
    scope: SCOPES.join(" "),
  })
    .toString()
    .replace(/\+/g, "%20");
  return { url: `https://www.linkedin.com/oauth/v2/authorization?${query}` };
});

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// The small page the admin lands on after LinkedIn's consent screen.
function resultPage(heading: string, lines: string[], ok: boolean): string {
  const body = lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Waypoint · LinkedIn</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f4f5f7; color: #14171f; font: 16px/1.5 "DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 480px; margin: 16px; padding: 28px; background: #fff; border: 1px solid #dfe2e8; border-radius: 10px; }
  h1 { margin: 0 0 12px; font-size: 20px; }
  h1::before { content: ""; display: inline-block; width: 10px; height: 10px; margin-right: 10px; border-radius: 50%; background: ${ok ? "#1f8a4c" : "#c0392b"}; }
  p { margin: 0 0 10px; }
  a { display: inline-block; margin-top: 8px; padding: 8px 14px; border-radius: 10px; background: #14171f; color: #fff; text-decoration: none; }
</style>
</head>
<body>
<main>
<h1>${escapeHtml(heading)}</h1>
${body}
<a href="${escapeHtml(APP_URL)}">Back to Waypoint</a>
</main>
</body>
</html>`;
}

// Step two: LinkedIn sends the admin's browser here with a one-time code,
// which is swapped for the token. Public by necessity (it's a browser
// redirect), so it trusts nothing but a `state` it issued itself.
export const linkedinAuthCallback = onRequest(
  { region: REGION, secrets: LINKEDIN_SECRETS, cors: false, invoker: "public" },
  async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.set("Referrer-Policy", "no-referrer");
    const fail = (status: number, lines: string[]) => {
      res.status(status).send(resultPage("LinkedIn wasn't connected", lines, false));
    };

    const state = String(req.query.state ?? "");
    if (!/^[0-9a-f]{48}$/.test(state)) {
      fail(400, ["This link isn't one Waypoint issued. Start again from Settings → LinkedIn."]);
      return;
    }
    const stateRef = db().doc(`linkedinPrivate/state-${state}`);
    const stateSnap = await stateRef.get();
    if (!stateSnap.exists) {
      fail(401, ["This sign-in has already been used or was never started. Start again from Settings → LinkedIn."]);
      return;
    }
    await stateRef.delete();
    const started = stateSnap.data() as { uid: string; name: string; createdAt: number };
    if (Date.now() - started.createdAt > 15 * 60_000) {
      fail(401, ["That took longer than fifteen minutes, so the sign-in expired. Start again from Settings → LinkedIn."]);
      return;
    }

    if (req.query.error) {
      const cancelled = String(req.query.error).startsWith("user_cancelled");
      fail(200, [
        cancelled
          ? "The LinkedIn sign-in was cancelled, so nothing has changed."
          : `LinkedIn reported: ${String(req.query.error_description ?? req.query.error)}`,
      ]);
      return;
    }
    const code = String(req.query.code ?? "");
    if (!code) {
      fail(400, ["LinkedIn didn't send a sign-in code. Start again from Settings → LinkedIn."]);
      return;
    }

    try {
      const t = await tokenRequest({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri(),
      });
      const now = Date.now();

      let memberName = "";
      try {
        const me = await fetch(`${API}/v2/me`, { headers: { Authorization: `Bearer ${t.access_token}` } });
        if (me.ok) {
          const j = (await me.json()) as { localizedFirstName?: string; localizedLastName?: string };
          memberName = [j.localizedFirstName, j.localizedLastName].filter(Boolean).join(" ");
        }
      } catch {
        // The name is only for display.
      }

      const organizations = await loadOrganizations(t.access_token);
      const connection: Connection = {
        accessToken: t.access_token,
        accessExpiresAt: now + t.expires_in * 1000,
        ...(t.refresh_token ? { refreshToken: t.refresh_token } : {}),
        ...(t.refresh_token && t.refresh_token_expires_in
          ? { refreshExpiresAt: now + t.refresh_token_expires_in * 1000 }
          : {}),
        ...(t.scope ? { scope: t.scope } : {}),
        memberName: memberName || "A LinkedIn member",
        connectedByUid: started.uid,
        connectedByName: started.name,
        connectedAt: new Date(now).toISOString(),
        organizations,
      };
      await connectionRef().set(connection);
      await statusRef().set({ ...publicStatus(connection), lastSyncError: null }, { merge: true });

      const pages = organizations.map((o) => o.name);
      res.status(200).send(
        resultPage(
          "LinkedIn is connected",
          [
            `Waypoint can now act as ${connection.memberName} on LinkedIn.`,
            pages.length > 0
              ? `Pages available: ${pages.join(", ")}.`
              : "That account doesn't have a role on any company page, so there's nothing to post to yet. Ask a page admin to connect instead.",
            "You can close this tab.",
          ],
          pages.length > 0,
        ),
      );
    } catch (err) {
      logger.error("LinkedIn connect failed", { error: String(err) });
      const detail = err instanceof LinkedInError ? err.detail : "";
      fail(502, [
        "LinkedIn accepted the sign-in but Waypoint couldn't finish connecting.",
        detail ? `LinkedIn said: ${detail}` : "Try again, and check the function logs if it keeps happening.",
      ]);
    }
  },
);

export const linkedinDisconnect = onCall(callable, async (req) => {
  await requireSuperUser(req);
  await connectionRef().delete();
  await statusRef().set(
    { connected: false, organizations: [], accessExpiresAt: null, refreshExpiresAt: null },
    { merge: true },
  );
  return { ok: true };
});

// ── Publishing ─────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type MediaKind = "images" | "documents";

// Upload a file to LinkedIn as the page's asset and wait until it has been
// processed, so the post that uses it doesn't go out with a blank where the
// image should be. Returns the asset's URN.
async function uploadMedia(
  token: string,
  kind: MediaKind,
  owner: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<string> {
  const init = await liJson<{ value?: { uploadUrl?: string; image?: string; document?: string } }>(
    token,
    `/rest/${kind}?action=initializeUpload`,
    "upload set-up",
    { method: "POST", body: { initializeUploadRequest: { owner } } },
  );
  const urn = init.value?.image ?? init.value?.document;
  const uploadUrl = init.value?.uploadUrl;
  if (!urn || !uploadUrl) throw new Error("LinkedIn didn't return an upload address.");

  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
    body: Buffer.from(bytes),
  });
  if (!put.ok) throw new LinkedInError(put.status, await put.text(), "file upload");

  const tries = kind === "images" ? 12 : 40;
  for (let i = 0; i < tries; i++) {
    try {
      const j = await liJson<{ status?: string }>(token, `/rest/${kind}/${enc(urn)}`, "upload status");
      if (j.status === "AVAILABLE") break;
      if (j.status === "PROCESSING_FAILED") {
        throw new HttpsError("invalid-argument", "LinkedIn couldn't process that file. Check its format and size and try again.");
      }
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      // The status check itself failing isn't a reason to abandon the post.
      break;
    }
    await sleep(1500);
  }
  return urn;
}

type ArticleContent = { source: string; title: string; description?: string; thumbnail?: string };

// A link card for a post. LinkedIn's API doesn't read the page behind a
// link the way its own composer does, so the title, description and image
// are read from the page here and sent with the post. Whatever can't be
// found is left out; the title falls back to the post's topic.
async function buildArticle(token: string, owner: string, link: string, fallbackTitle: string): Promise<ArticleContent> {
  let preview = { title: "", description: "", image: "" };
  try {
    const res = await fetch(link, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; WaypointLinkPreview/1.0)", Accept: "text/html" },
      signal: AbortSignal.timeout(8000),
    });
    const size = Number(res.headers.get("content-length") ?? 0);
    if (res.ok && size < 5_000_000 && (res.headers.get("content-type") ?? "").includes("html")) {
      preview = parseLinkPreview(await res.text(), res.url || link);
    }
  } catch (err) {
    logger.info("Link preview not read", { link, error: String(err) });
  }

  let thumbnail: string | undefined;
  if (preview.image && isFetchableUrl(preview.image)) {
    try {
      const res = await fetch(preview.image, { signal: AbortSignal.timeout(8000) });
      const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      if (res.ok && IMAGE_TYPES.includes(type)) {
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (bytes.byteLength > 0 && bytes.byteLength <= 8_000_000) {
          thumbnail = await uploadMedia(token, "images", owner, bytes, type);
        }
      }
    } catch (err) {
      logger.info("Link preview image not used", { link, error: String(err) });
    }
  }

  let host = link;
  try {
    host = new URL(link).hostname;
  } catch {
    // Keep the raw link as the title of last resort.
  }
  return {
    source: link,
    title: (preview.title || fallbackTitle || host).slice(0, 400),
    ...(preview.description ? { description: preview.description.slice(0, 1000) } : {}),
    ...(thumbnail ? { thumbnail } : {}),
  };
}

type PublishRequest = {
  postId?: unknown;
  channel?: unknown;
  text?: unknown;
  link?: unknown;
  title?: unknown;
  altText?: unknown;
  file?: { name?: unknown; type?: unknown; base64?: unknown } | null;
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

// Publish one Social calendar post to the LinkedIn page its channel maps
// to. The app sends the post as the editor currently shows it (so a new,
// unsaved post can go out too) and saves the result; if the post is already
// stored, the live link is written onto it here as well, in case the app
// never gets the answer.
export const linkedinPublish = onCall(
  { ...callable, memory: "1GiB", timeoutSeconds: 300 },
  async (req) => {
    const caller = await requireSuperUser(req);
    const data = (req.data ?? {}) as PublishRequest;

    const postId = str(data.postId);
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(postId)) throw new HttpsError("invalid-argument", "Missing the post to publish.");
    const text = typeof data.text === "string" ? data.text.trim() : "";
    if (!text) throw new HttpsError("invalid-argument", "The post has no copy yet.");
    if (text.length > MAX_COPY_CHARS) {
      throw new HttpsError("invalid-argument", `LinkedIn posts can be ${MAX_COPY_CHARS.toLocaleString("en-AU")} characters at most; this one is ${text.length.toLocaleString("en-AU")}.`);
    }
    const channel = str(data.channel);
    const link = str(data.link);
    const title = str(data.title);
    const altText = str(data.altText).slice(0, 4000);

    let file: { name: string; type: string; bytes: Uint8Array } | null = null;
    if (data.file) {
      const type = str(data.file.type).toLowerCase();
      if (!IMAGE_TYPES.includes(type) && !DOCUMENT_TYPES.includes(type)) {
        throw new HttpsError(
          "invalid-argument",
          "LinkedIn takes a JPG, PNG or GIF image, or a PDF, PowerPoint or Word document here. Video still has to be posted from LinkedIn itself.",
        );
      }
      const bytes = new Uint8Array(Buffer.from(str(data.file.base64), "base64"));
      if (bytes.byteLength === 0) throw new HttpsError("invalid-argument", "The attached file came through empty.");
      if (bytes.byteLength > MAX_FILE_BYTES) throw new HttpsError("invalid-argument", "The attached file is over 20 MB.");
      file = { name: str(data.file.name) || "Attachment", type, bytes };
    }

    const connection = await getConnection();
    const mapping = (await pageMappings()).find((p) => sameChannel(p.channel, channel));
    if (!mapping) {
      throw new HttpsError(
        "failed-precondition",
        `The "${channel || "(no channel)"}" channel isn't linked to a LinkedIn page. A super user links channels to pages in Settings → LinkedIn.`,
      );
    }
    const org = connection.organizations.find((o) => o.id === mapping.orgId);
    if (!org) {
      throw new HttpsError(
        "permission-denied",
        `${connection.memberName} doesn't have a role on LinkedIn page ${mapping.orgId}. Someone who administers that page needs to connect LinkedIn in Settings.`,
      );
    }
    if (!org.roles.some((r) => POSTING_ROLES.includes(r))) {
      throw new HttpsError("permission-denied", `${connection.memberName} can see ${org.name} but isn't allowed to post as it. They need the Content admin or Super admin role on the page.`);
    }

    // One publish at a time per post, and never twice: a double click, or
    // two people with the same post open, must not put it on the page twice.
    const postRef = db().collection("socialPosts").doc(postId);
    const lockRef = db().doc(`linkedinPrivate/publish-${postId}`);
    await db().runTransaction(async (tx) => {
      const [postSnap, lockSnap] = [await tx.get(postRef), await tx.get(lockRef)];
      const existing = (postSnap.data() as { linkedinUrn?: string } | undefined)?.linkedinUrn;
      if (existing) {
        throw new HttpsError("already-exists", "This post is already on LinkedIn. Open its live link to see it.");
      }
      const lockedAt = (lockSnap.data() as { at?: number } | undefined)?.at ?? 0;
      if (Date.now() - lockedAt < 10 * 60_000) {
        throw new HttpsError("already-exists", "This post is being published, or was a moment ago. Give it a minute and check the page before trying again.");
      }
      tx.set(lockRef, { at: Date.now(), uid: caller.uid });
    });

    const token = connection.accessToken;
    const owner = orgUrn(org.id);
    let urn: string;
    try {
      let content: Record<string, unknown> | undefined;
      let commentary = text;
      if (file) {
        const kind: MediaKind = IMAGE_TYPES.includes(file.type) ? "images" : "documents";
        const assetUrn = await uploadMedia(token, kind, owner, file.bytes, file.type);
        content =
          kind === "images"
            ? { media: { id: assetUrn, ...(altText ? { altText } : {}) } }
            : { media: { id: assetUrn, title: (title || file.name).slice(0, 400) } };
      } else if (link && isFetchableUrl(link)) {
        content = { article: await buildArticle(token, owner, link, title) };
      }
      // With no link card to carry it, the link goes in the copy so it's
      // still clickable.
      if (link && !content?.article && !commentary.includes(link)) commentary = `${commentary}\n\n${link}`;

      const res = await li(token, "/rest/posts", "post", {
        method: "POST",
        body: {
          author: owner,
          commentary: toLittleText(commentary),
          visibility: "PUBLIC",
          distribution: {
            feedDistribution: "MAIN_FEED",
            targetEntities: [],
            thirdPartyDistributionChannels: [],
          },
          ...(content ? { content } : {}),
          lifecycleState: "PUBLISHED",
          isReshareDisabledByAuthor: false,
        },
      });
      urn = res.headers.get("x-restli-id") ?? "";
    } catch (err) {
      // Nothing reached the page, so let it be tried again straight away.
      await lockRef.delete().catch(() => undefined);
      throw asHttpsError(err);
    }

    const publishedAt = new Date().toISOString();
    const url = urn ? postUrlFor(urn) : "";
    logger.info("Published to LinkedIn", { postId, urn, page: org.name, by: caller.name });

    // From here the post is live, so nothing below may turn that into an
    // error the app would read as "not published".
    try {
      const snap = await postRef.get();
      if (snap.exists) {
        const stored = snap.data() as { date?: string };
        const today = publishedAt.slice(0, 10);
        await postRef.update({
          status: "published",
          publishedAt,
          ...(urn ? { linkedinUrn: urn, postUrl: url } : {}),
          linkedinOrgId: org.id,
          ...(stored.date ? {} : { date: today, month: today.slice(0, 7) }),
        });
        await lockRef.delete();
      }
    } catch (err) {
      logger.warn("Published, but the post wasn't updated", { postId, urn, error: String(err) });
    }

    return { urn, url, publishedAt, orgId: org.id, pageName: org.name };
  },
);

// ── Statistics ─────────────────────────────────────────────────────────

type ShareStats = {
  impressionCount?: number;
  uniqueImpressionsCount?: number;
  clickCount?: number;
  likeCount?: number;
  commentCount?: number;
  shareCount?: number;
  engagement?: number;
};

type StatsElement = {
  share?: string;
  ugcPost?: string;
  timeRange?: { start?: number; end?: number };
  totalShareStatistics?: ShareStats;
};

type LiPost = {
  id?: string;
  commentary?: string;
  createdAt?: number;
  publishedAt?: number;
  lifecycleState?: string;
  distribution?: { feedDistribution?: string };
  content?: {
    media?: { id?: string };
    article?: unknown;
    multiImage?: unknown;
    poll?: unknown;
  };
  reshareContext?: unknown;
};

type StoredPost = MatchablePost & {
  channel: string;
  postUrl?: string;
  linkedinUrn?: string;
};

function postKind(p: LiPost): string {
  const media = p.content?.media?.id ?? "";
  if (media.startsWith("urn:li:image:")) return "image";
  if (media.startsWith("urn:li:video:")) return "video";
  if (media.startsWith("urn:li:document:")) return "document";
  if (p.content?.multiImage) return "images";
  if (p.content?.article) return "article";
  if (p.content?.poll) return "poll";
  if (p.reshareContext) return "repost";
  return "text";
}

// Every organic post on the page from the last twelve months, newest first.
// That's as far back as LinkedIn keeps statistics.
async function listPagePosts(token: string, orgId: string): Promise<LiPost[]> {
  const cutoff = Date.now() - 365 * DAY_MS;
  const out: LiPost[] = [];
  for (let start = 0; start < 1000; start += 100) {
    const page = await liJson<{ elements?: LiPost[]; paging?: { links?: { rel?: string }[] } }>(
      token,
      `/rest/posts?author=${enc(orgUrn(orgId))}&q=author&count=100&start=${start}&sortBy=CREATED`,
      "posts list",
      { headers: { "X-RestLi-Method": "FINDER" } },
    );
    const elements = page.elements ?? [];
    let reachedCutoff = false;
    for (const p of elements) {
      const at = p.publishedAt ?? p.createdAt ?? 0;
      if (at < cutoff) {
        reachedCutoff = true;
        continue;
      }
      if (!p.id || p.lifecycleState !== "PUBLISHED") continue;
      // Posts kept off the feed are ad creatives, not something the team
      // planned on the calendar.
      if (p.distribution?.feedDistribution === "NONE") continue;
      out.push(p);
    }
    const hasNext = (page.paging?.links ?? []).some((l) => l.rel === "next");
    if (reachedCutoff || elements.length === 0 || (!hasNext && elements.length < 100)) break;
  }
  return out;
}

// Lifetime statistics for specific posts, keyed by URN. LinkedIn leaves out
// posts nobody has seen yet; those count as zero.
async function postStatistics(token: string, orgId: string, urns: string[]): Promise<Map<string, ShareStats>> {
  const out = new Map<string, ShareStats>();
  const groups: [string, string[]][] = [
    ["shares", urns.filter((u) => u.startsWith("urn:li:share:"))],
    ["ugcPosts", urns.filter((u) => u.startsWith("urn:li:ugcPost:"))],
  ];
  for (const [param, list] of groups) {
    for (let i = 0; i < list.length; i += 20) {
      const chunk = list.slice(i, i + 20);
      const j = await liJson<{ elements?: StatsElement[] }>(
        token,
        `/rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${enc(orgUrn(orgId))}&${param}=List(${chunk.map(enc).join(",")})`,
        "post statistics",
      );
      for (const e of j.elements ?? []) {
        const urn = e.share ?? e.ugcPost;
        if (urn && e.totalShareStatistics) out.set(urn, e.totalShareStatistics);
      }
    }
  }
  return out;
}

function timeIntervals(startMs: number, endMs: number): string {
  return `timeIntervals=(timeRange:(start:${startMs},end:${endMs}),timeGranularityType:DAY)`;
}

function utcMidnight(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

type DayStats = {
  date: string;
  impressions: number;
  clicks: number;
  reactions: number;
  comments: number;
  shares: number;
};

type OrgSync = { posts: number; linked: number; warnings: string[] };

// One page: its followers, its last 30 days and every post's numbers.
// Each part is fetched on its own so one refusal doesn't lose the rest.
async function syncOrganization(
  token: string,
  org: OrgAccess,
  channels: string[],
  stored: StoredPost[],
): Promise<OrgSync> {
  const warnings: string[] = [];
  const attempt = async <T>(what: string, run: () => Promise<T>): Promise<T | null> => {
    try {
      return await run();
    } catch (err) {
      const detail = err instanceof LinkedInError ? `${err.status} ${err.detail}`.trim() : String(err);
      logger.warn(`LinkedIn ${what} failed for ${org.name}`, { error: String(err) });
      warnings.push(`${org.name}: ${what} couldn't be read (${detail}).`);
      return null;
    }
  };

  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const windowStart = utcMidnight(now) - 29 * DAY_MS;
  const windowEnd = utcMidnight(now) + DAY_MS;
  const urnParam = enc(orgUrn(org.id));

  const followers = await attempt("follower count", async () => {
    const j = await liJson<{ firstDegreeSize?: number }>(
      token,
      `/rest/networkSizes/${urnParam}?edgeType=COMPANY_FOLLOWED_BY_MEMBER`,
      "follower count",
    );
    return j.firstDegreeSize ?? null;
  });

  const daily = await attempt("30-day activity", async () => {
    const j = await liJson<{ elements?: StatsElement[] }>(
      token,
      `/rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${urnParam}&${timeIntervals(windowStart, windowEnd)}`,
      "30-day activity",
    );
    return (j.elements ?? [])
      .filter((e) => e.timeRange?.start)
      .map((e): DayStats => {
        const s = e.totalShareStatistics ?? {};
        return {
          date: new Date(e.timeRange?.start as number).toISOString().slice(0, 10),
          impressions: s.impressionCount ?? 0,
          clicks: s.clickCount ?? 0,
          reactions: s.likeCount ?? 0,
          comments: s.commentCount ?? 0,
          shares: s.shareCount ?? 0,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  });

  const followerGain = await attempt("follower growth", async () => {
    const j = await liJson<{
      elements?: { followerGains?: { organicFollowerGain?: number; paidFollowerGain?: number } }[];
    }>(
      token,
      `/rest/organizationalEntityFollowerStatistics?q=organizationalEntity&organizationalEntity=${urnParam}&${timeIntervals(windowStart, windowEnd)}`,
      "follower growth",
    );
    return (j.elements ?? []).reduce(
      (sum, e) => sum + (e.followerGains?.organicFollowerGain ?? 0) + (e.followerGains?.paidFollowerGain ?? 0),
      0,
    );
  });

  const posts = (await attempt("posts", () => listPagePosts(token, org.id))) ?? [];
  const stats =
    posts.length > 0
      ? await attempt("post statistics", () => postStatistics(token, org.id, posts.map((p) => p.id as string)))
      : new Map<string, ShareStats>();

  // Pair each LinkedIn post with its Waypoint post: by the id saved when it
  // was published from here, by a pasted live link that names it, or
  // failing both by its opening words and date.
  const byUrn = new Map<string, string>();
  for (const s of stored) {
    const urn = s.linkedinUrn ?? postUrnIn(s.postUrl)?.urn;
    if (urn) byUrn.set(urn, s.id);
  }
  const taken = new Set(byUrn.values());
  const unlinked = stored.filter(
    (s) => !taken.has(s.id) && channels.some((c) => sameChannel(c, s.channel)),
  );

  let linked = 0;
  const batch = db().bulkWriter();
  // A write that fails (a post deleted mid-sync, say) is logged and skipped;
  // it mustn't take the rest of the sync down with it.
  const write = (op: Promise<unknown>): void => {
    op.catch((err) => logger.warn(`LinkedIn sync write failed for ${org.name}`, { error: String(err) }));
  };
  for (const p of posts) {
    const urn = p.id as string;
    const publishedAtMs = p.publishedAt ?? p.createdAt ?? now;
    const text = fromLittleText(p.commentary ?? "");
    let postId = byUrn.get(urn) ?? null;
    if (!postId) {
      const remaining = unlinked.filter((s) => !taken.has(s.id));
      postId = matchByText(text, publishedAtMs, remaining);
      if (postId) {
        taken.add(postId);
        linked++;
        const match = stored.find((s) => s.id === postId);
        write(
          batch.update(db().collection("socialPosts").doc(postId), {
            linkedinUrn: urn,
            linkedinOrgId: org.id,
            ...(match?.postUrl ? {} : { postUrl: postUrlFor(urn) }),
          }),
        );
      }
    }
    const s = stats?.get(urn);
    write(batch.set(
      db().collection("linkedinPostStats").doc(statsDocId(urn)),
      {
        urn,
        orgId: org.id,
        postId,
        text: text.slice(0, 300),
        kind: postKind(p),
        publishedAt: new Date(publishedAtMs).toISOString(),
        url: postUrlFor(urn),
        // When the statistics call failed, keep the numbers from last time
        // instead of zeroing them.
        ...(stats
          ? {
              impressions: s?.impressionCount ?? 0,
              uniqueImpressions: s?.uniqueImpressionsCount ?? null,
              clicks: s?.clickCount ?? 0,
              reactions: s?.likeCount ?? 0,
              comments: s?.commentCount ?? 0,
              shares: s?.shareCount ?? 0,
              engagement: s?.engagement ?? 0,
              updatedAt: new Date(now).toISOString(),
            }
          : {}),
      },
      { merge: true },
    ));
  }

  // The page's own document: totals for the last 30 days, the daily series
  // behind them, and a follower count per day, built up one sync at a time
  // because LinkedIn only reports the current total.
  const pageRef = db().doc(`linkedin/page-${org.id}`);
  const before = ((await pageRef.get()).data() ?? {}) as { followerHistory?: { date: string; followers: number }[] };
  const history = (before.followerHistory ?? []).filter((h) => h.date !== today);
  if (typeof followers === "number") history.push({ date: today, followers });
  const sum = (key: keyof Omit<DayStats, "date">) => (daily ?? []).reduce((t, d) => t + d[key], 0);
  const impressions30d = sum("impressions");
  const interactions30d = sum("clicks") + sum("reactions") + sum("comments") + sum("shares");
  write(batch.set(
    pageRef,
    {
      orgId: org.id,
      name: org.name,
      channels,
      ...(typeof followers === "number" ? { followers } : {}),
      ...(typeof followerGain === "number" ? { followerGain30d: followerGain } : {}),
      ...(daily
        ? {
            daily,
            impressions30d,
            clicks30d: sum("clicks"),
            reactions30d: sum("reactions"),
            comments30d: sum("comments"),
            shares30d: sum("shares"),
            engagement30d: impressions30d > 0 ? interactions30d / impressions30d : 0,
          }
        : {}),
      followerHistory: history.slice(-400),
      postCount: posts.length,
      updatedAt: new Date(now).toISOString(),
    },
    { merge: true },
  ));
  await batch.close();

  return { posts: posts.length, linked, warnings };
}

type SyncSummary = { pages: number; posts: number; linked: number; warnings: string[] };

async function syncStatistics(): Promise<SyncSummary> {
  const connection = await getConnection();
  const mappings = await pageMappings();
  const orgIds = [...new Set(mappings.map((m) => m.orgId))];

  const snap = await db().collection("socialPosts").get();
  const stored: StoredPost[] = snap.docs.map((d) => {
    const p = d.data() as Partial<StoredPost>;
    return {
      id: d.id,
      copy: String(p.copy ?? ""),
      date: String(p.date ?? ""),
      channel: String(p.channel ?? ""),
      ...(p.postUrl ? { postUrl: String(p.postUrl) } : {}),
      ...(p.linkedinUrn ? { linkedinUrn: String(p.linkedinUrn) } : {}),
    };
  });

  const summary: SyncSummary = { pages: 0, posts: 0, linked: 0, warnings: [] };
  for (const orgId of orgIds) {
    const channels = mappings.filter((m) => m.orgId === orgId).map((m) => m.channel);
    const org = connection.organizations.find((o) => o.id === orgId);
    if (!org) {
      summary.warnings.push(`Page ${orgId} (${channels.join(", ")}): ${connection.memberName} has no role on it.`);
      continue;
    }
    if (!org.roles.includes(STATS_ROLE)) {
      summary.warnings.push(`${org.name}: LinkedIn only gives statistics to a page's Super admin, and ${connection.memberName} isn't one.`);
      continue;
    }
    const r = await syncOrganization(connection.accessToken, org, channels, stored);
    summary.pages++;
    summary.posts += r.posts;
    summary.linked += r.linked;
    summary.warnings.push(...r.warnings);
  }

  await statusRef().set(
    {
      lastSyncAt: new Date().toISOString(),
      lastSyncError: summary.warnings.length > 0 ? summary.warnings.join(" ") : null,
      lastSyncPosts: summary.posts,
    },
    { merge: true },
  );
  return summary;
}

// "Sync now" in Settings and on the Performance tab.
export const linkedinSyncNow = onCall({ ...callable, timeoutSeconds: 300 }, async (req) => {
  await requireSuperUser(req);
  try {
    return await syncStatistics();
  } catch (err) {
    throw asHttpsError(err);
  }
});

// Every night, Sydney time, after the day's posts have had time to be seen.
export const linkedinNightlySync = onSchedule(
  {
    schedule: "every day 03:00",
    timeZone: "Australia/Sydney",
    region: REGION,
    secrets: LINKEDIN_SECRETS,
    timeoutSeconds: 300,
  },
  async () => {
    const connected = (await connectionRef().get()).exists;
    if (!connected) return;
    try {
      const summary = await syncStatistics();
      logger.info("LinkedIn statistics synced", summary);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("LinkedIn statistics sync failed", { error: message });
      await statusRef().set({ lastSyncAt: new Date().toISOString(), lastSyncError: message }, { merge: true });
    }
  },
);
