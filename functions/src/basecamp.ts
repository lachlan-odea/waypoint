// Basecamp, the other team's project tracker, kept in step with Waypoint
// through the official SDK (@37signals/basecamp).
//
// How it fits together:
//
// - A super user connects once from Settings → Basecamp (basecampConnect →
//   Basecamp's consent screen → basecampAuthCallback). Basecamp has no
//   service accounts that can create projects, so everything here acts as
//   that person. Their token is kept in /basecampPrivate, which no client
//   can read (firestore.rules), and renewed from here.
// - Basecamp → Waypoint: Basecamp has no webhook for a project being
//   created, renamed or archived, so basecampHourlySync (and
//   basecampSyncNow, on demand) lists the account's projects and mirrors
//   them into /basecampProjects, which the Basecamp view reads.
// - Waypoint → Basecamp: a project with `syncToBasecamp` switched on is
//   created in Basecamp by basecampPushProject the moment it's saved, and
//   its name, overview, due date and archived state follow it from then on.
//   Its assignees are added to the Basecamp project too, matched by email
//   address to the people already in the Basecamp account; nobody is ever
//   removed from a Basecamp project, and nobody is invited to Basecamp.
//   /basecampLinks/{projectId} remembers which Basecamp project it became
//   and what each side last agreed on, which is what stops duplicates and
//   stops the two sides echoing each other. Confidential projects live in
//   another collection and are never sent.
// - For a linked project, a name or description changed in Basecamp comes
//   back to Waypoint on the next sync, unless Waypoint's copy changed too,
//   in which case Waypoint's wins. Basecamp archiving a project is shown in
//   the Basecamp view but never archives the Waypoint project.
//
// The app id and secret are the BASECAMP_CLIENT_ID and
// BASECAMP_CLIENT_SECRET secrets (`firebase functions:secrets:set <NAME>`),
// from an integration registered at launchpad.37signals.com/integrations.

import { HttpsError, onCall, onRequest, type CallableRequest } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret, defineString } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { randomBytes } from "node:crypto";
import {
  assigneeIdsOf,
  desiredFor,
  htmlToText,
  sameDesired,
  scheduleFor,
  textToHtml,
  type Desired,
} from "./basecampText";
// The origins the app is served from and the bootstrap super users are the
// same for every integration, so they're kept in one place.
import { ALLOWED_ORIGINS, SUPER_USER_EMAILS } from "./linkedin";

const BASECAMP_CLIENT_ID = defineSecret("BASECAMP_CLIENT_ID");
const BASECAMP_CLIENT_SECRET = defineSecret("BASECAMP_CLIENT_SECRET");
const BASECAMP_SECRETS = [BASECAMP_CLIENT_ID, BASECAMP_CLIENT_SECRET];
// Only needed when whoever connects belongs to more than one Basecamp
// account: the id of the one to use (the number in its address). Empty
// means the first account Basecamp lists.
const BASECAMP_ACCOUNT_ID = defineString("BASECAMP_ACCOUNT_ID", { default: "" });

const REGION = "us-central1";
const LAUNCHPAD = "https://launchpad.37signals.com";

// Keep in step with WAYPOINT_APP_URL in index.ts.
const APP_URL = "https://lachlan-odea.github.io/waypoint/";
// Basecamp refuses any request that doesn't name the app that's calling and
// give somewhere to find out about it; the app's own address does both.
const API_CLIENT_NAME = `Waypoint (${APP_URL})`;

const DAY_MS = 86_400_000;
// How long a half-made link is left alone before another run may take it
// over: longer than any create could take, short enough to heal by the
// next hourly sync.
const CLAIM_MS = 2 * 60_000;

// initializeApp() runs in index.ts after this module has loaded, so the
// database handle is fetched when it's first needed, not at import.
function db(): Firestore {
  return getFirestore();
}

// The address Basecamp sends the super user back to. It has to be the
// integration's redirect URI, to the character.
function redirectUri(): string {
  const project = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT ?? "wtg-waypoint";
  return `https://${REGION}-${project}.cloudfunctions.net/basecampAuthCallback`;
}

// The parts of the SDK used here, as its 0.37 type definitions describe
// them. They're written out rather than imported because the package ships
// its generated TypeScript sources beside the compiled files, and importing
// its types would pull those into this build, where they fail its
// unused-variable check.
type BcProject = {
  id: number;
  // active | archived | trashed
  status: string;
  created_at: string;
  updated_at: string;
  name: string;
  // Rich text (HTML).
  description?: string;
  purpose?: string;
  start_date?: string;
  end_date?: string;
  app_url: string;
};

type BcPerson = {
  id: number;
  name: string;
  email_address?: string | null;
};

type BasecampClient = {
  people: {
    // Everyone in the account the connected person can see.
    list(): Promise<BcPerson[]>;
    // Adds people already in the account to a project. Leaves everyone
    // else on it alone.
    updateProjectAccess(projectId: number, req: { grant?: number[] }): Promise<unknown>;
  };
  projects: {
    // Follows every page of results itself.
    list(options?: { status?: "active" | "archived" | "trashed" }): Promise<BcProject[]>;
    // Throws an error whose `code` is "not_found" when it's gone.
    get(projectId: number): Promise<BcProject>;
    create(req: { name: string; description?: string }): Promise<BcProject>;
    update(
      projectId: number,
      req: { name: string; description?: string; scheduleAttributes?: { start_date?: string; end_date?: string } },
    ): Promise<BcProject>;
    archive(projectId: number): Promise<void>;
    unarchive(projectId: number): Promise<void>;
  };
};

type Sdk = {
  createBasecampClient(options: { accountId: string; accessToken: string; userAgent?: string }): BasecampClient;
};

// The SDK is published as an ES module and these functions compile to
// CommonJS, where TypeScript would turn a plain import() into a require().
// This keeps it a real import().
const importEsm = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<Sdk>;

// ── Stored shapes ──────────────────────────────────────────────────────

type Account = { id: string; name: string };

// /basecampPrivate/connection. Never readable by a client.
type Connection = {
  accessToken: string;
  // Milliseconds since the epoch.
  accessExpiresAt: number;
  refreshToken?: string;
  identityName: string;
  accountId: string;
  accountName: string;
  // Every Basecamp account the person belongs to, for the Settings panel.
  accounts: Account[];
  connectedByUid: string;
  connectedByName: string;
  connectedAt: string;
};

// What was last seen on Basecamp's side of a linked project.
type Remote = {
  name: string;
  // Basecamp's rich text, exactly as it sent it.
  description: string;
  // active | archived | trashed, or "missing" when the connected account
  // can no longer see the project at all.
  status: string;
  updatedAt: string;
};

// /basecampLinks/{waypointProjectId}.
type Link = {
  // creating: a run is making the Basecamp project right now.
  // failed: the last attempt didn't work; `error` says why.
  state: "creating" | "failed" | "linked";
  startedAt: number;
  basecampId?: string;
  appUrl?: string;
  // Waypoint's side as of the last time the two agreed.
  pushed?: Desired;
  remote?: Remote;
  // Assignees who couldn't be added to the Basecamp project, each as
  // "Name (why not)", for the project page to list. They're looked for
  // again on every sync.
  peopleMissing?: string[];
  error?: string | null;
  syncedAt?: string;
};

const connectionRef = () => db().doc("basecampPrivate/connection");
const statusRef = () => db().doc("basecamp/status");
const linkRef = (projectId: string) => db().doc(`basecampLinks/${projectId}`);
const mirrorRef = (basecampId: string) => db().doc(`basecampProjects/${basecampId}`);

// What the app is allowed to know about the connection. No tokens.
function publicStatus(c: Connection): Record<string, unknown> {
  return {
    connected: true,
    identityName: c.identityName,
    accountId: c.accountId,
    accountName: c.accountName,
    accounts: c.accounts,
    connectedByName: c.connectedByName,
    connectedAt: c.connectedAt,
  };
}

// ── Who's calling ──────────────────────────────────────────────────────

type Caller = { uid: string; name: string };

// Connecting decides whose Basecamp account Waypoint acts as, so it's held
// to super users: a signed-in (not anonymous) account whose designer
// profile carries the flag, or a bootstrap email.
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
    throw new HttpsError("permission-denied", "Only super users can manage the Basecamp connection.");
  }
  return { uid: auth.uid, name: (designer.name ?? "").trim() || email || "A super user" };
}

// ── Talking to Basecamp ────────────────────────────────────────────────

type TokenResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
};

// Launchpad's older documentation names the grant with `type`, its newer
// with `grant_type`; both are sent so either reading works.
async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${LAUNCHPAD}/authorization/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": API_CLIENT_NAME },
    body: new URLSearchParams({
      ...params,
      client_id: BASECAMP_CLIENT_ID.value().trim(),
      client_secret: BASECAMP_CLIENT_SECRET.value().trim(),
    }),
  });
  if (!res.ok) {
    throw new Error(`Basecamp token request failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
  return (await res.json()) as TokenResponse;
}

// The saved connection with a token that's good to use. Basecamp's tokens
// last two weeks; this renews one once it's within two days of expiring,
// which the hourly sync makes sure happens in time.
async function getConnection(): Promise<Connection> {
  const snap = await connectionRef().get();
  if (!snap.exists) {
    throw new HttpsError("failed-precondition", "Basecamp isn't connected yet. A super user connects it from Settings → Basecamp.");
  }
  let c = snap.data() as Connection;
  const now = Date.now();
  if (c.accessExpiresAt - now < 2 * DAY_MS && c.refreshToken) {
    try {
      const t = await tokenRequest({
        type: "refresh",
        grant_type: "refresh_token",
        refresh_token: c.refreshToken,
      });
      c = {
        ...c,
        accessToken: t.access_token,
        accessExpiresAt: now + (t.expires_in ?? 14 * 86_400) * 1000,
        refreshToken: t.refresh_token ?? c.refreshToken,
      };
      await connectionRef().set(c);
    } catch (err) {
      // Still usable until it actually expires; the next call tries again.
      logger.warn("Basecamp token refresh failed", { error: String(err) });
    }
  }
  if (c.accessExpiresAt <= now) {
    throw new HttpsError("failed-precondition", "The Basecamp sign-in has expired. Reconnect it from Settings → Basecamp.");
  }
  return c;
}

async function clientFor(c: Connection): Promise<BasecampClient> {
  const { createBasecampClient } = await importEsm("@37signals/basecamp");
  return createBasecampClient({
    accountId: c.accountId,
    accessToken: c.accessToken,
    userAgent: API_CLIENT_NAME,
  });
}

// A sentence for the person in the app when Basecamp says no. The SDK's
// errors carry a `code`; anything else is passed on as it came.
function errorSentence(err: unknown): string {
  const e = err as { code?: string; httpStatus?: number; message?: string } | null;
  switch (e?.code) {
    case "auth_required":
      return "Basecamp no longer accepts the saved sign-in. Reconnect it from Settings → Basecamp.";
    case "forbidden":
      return "Basecamp refused this for the connected account. It may not be allowed to create or change projects.";
    case "not_found":
      return "Basecamp can't find that project any more. It was probably deleted there.";
    case "limit_exceeded":
      return "The Basecamp account has reached its project limit, so nothing new can be created there.";
    case "rate_limit":
      return "Basecamp is asking Waypoint to slow down. It will be tried again on the next sync.";
    default:
      return err instanceof Error ? err.message : String(err);
  }
}

function asHttpsError(err: unknown): HttpsError {
  if (err instanceof HttpsError) return err;
  logger.error("Basecamp call failed", { error: String(err) });
  const code = (err as { code?: string } | null)?.code;
  return new HttpsError(code === "auth_required" ? "failed-precondition" : "internal", errorSentence(err));
}

// ── Connecting ─────────────────────────────────────────────────────────

const callable = {
  region: REGION,
  cors: ALLOWED_ORIGINS,
  secrets: BASECAMP_SECRETS,
  invoker: "public" as const,
};

// Step one of connecting: hand the app the address of Basecamp's consent
// screen. The `state` it carries is remembered here for fifteen minutes, so
// the callback only accepts a sign-in a super user actually started.
export const basecampConnect = onCall(callable, async (req) => {
  const caller = await requireSuperUser(req);
  const state = randomBytes(24).toString("hex");
  await db().doc(`basecampPrivate/state-${state}`).set({
    uid: caller.uid,
    name: caller.name,
    createdAt: Date.now(),
  });
  const query = new URLSearchParams({
    type: "web_server",
    response_type: "code",
    client_id: BASECAMP_CLIENT_ID.value().trim(),
    redirect_uri: redirectUri(),
    state,
  });
  return { url: `${LAUNCHPAD}/authorization/new?${query.toString()}` };
});

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

// The small page the super user lands on after Basecamp's consent screen.
function resultPage(heading: string, lines: string[], ok: boolean): string {
  const body = lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Waypoint · Basecamp</title>
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

type AuthorizationDocument = {
  identity?: { first_name?: string; last_name?: string };
  accounts?: { product?: string; id?: number | string; name?: string }[];
};

// Who the token belongs to and which Basecamp accounts they're in. Other
// 37signals products share the sign-in, so anything labelled as one of
// those is left out.
async function loadIdentity(token: string): Promise<{ identityName: string; accounts: Account[] }> {
  const res = await fetch(`${LAUNCHPAD}/authorization.json`, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": API_CLIENT_NAME },
  });
  if (!res.ok) throw new Error(`Basecamp identity lookup failed: ${res.status}`);
  const j = (await res.json()) as AuthorizationDocument;
  const all = (j.accounts ?? []).filter((a) => a.id !== undefined && a.id !== null);
  const labelled = all.some((a) => a.product);
  const accounts = all
    .filter((a) => !labelled || /^bc\d+$/.test(String(a.product)))
    .map((a) => ({ id: String(a.id), name: String(a.name ?? "") || `Account ${a.id}` }));
  const identityName = [j.identity?.first_name, j.identity?.last_name].filter(Boolean).join(" ");
  return { identityName, accounts };
}

// Step two: Basecamp sends the super user's browser here with a one-time
// code, which is swapped for the token. Public by necessity (it's a browser
// redirect), so it trusts nothing but a `state` it issued itself.
export const basecampAuthCallback = onRequest(
  { region: REGION, secrets: BASECAMP_SECRETS, cors: false, invoker: "public" },
  async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.set("Referrer-Policy", "no-referrer");
    const fail = (status: number, lines: string[]) => {
      res.status(status).send(resultPage("Basecamp wasn't connected", lines, false));
    };

    const state = String(req.query.state ?? "");
    if (!/^[0-9a-f]{48}$/.test(state)) {
      fail(400, ["This link isn't one Waypoint issued. Start again from Settings → Basecamp."]);
      return;
    }
    const stateRef = db().doc(`basecampPrivate/state-${state}`);
    const stateSnap = await stateRef.get();
    if (!stateSnap.exists) {
      fail(401, ["This sign-in has already been used or was never started. Start again from Settings → Basecamp."]);
      return;
    }
    await stateRef.delete();
    const started = stateSnap.data() as { uid: string; name: string; createdAt: number };
    if (Date.now() - started.createdAt > 15 * 60_000) {
      fail(401, ["That took longer than fifteen minutes, so the sign-in expired. Start again from Settings → Basecamp."]);
      return;
    }

    if (req.query.error) {
      fail(200, [
        String(req.query.error) === "access_denied"
          ? "The Basecamp sign-in was declined, so nothing has changed."
          : `Basecamp reported: ${String(req.query.error_description ?? req.query.error)}`,
      ]);
      return;
    }
    const code = String(req.query.code ?? "");
    if (!code) {
      fail(400, ["Basecamp didn't send a sign-in code. Start again from Settings → Basecamp."]);
      return;
    }

    try {
      const t = await tokenRequest({
        type: "web_server",
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri(),
      });
      const now = Date.now();
      const { identityName, accounts } = await loadIdentity(t.access_token);
      if (accounts.length === 0) {
        fail(200, [
          `${identityName || "That sign-in"} doesn't belong to a Basecamp account, so there's nothing to connect to.`,
          "Sign in to Basecamp as someone on the team's account and try again.",
        ]);
        return;
      }
      const wanted = BASECAMP_ACCOUNT_ID.value().trim();
      const account = accounts.find((a) => a.id === wanted) ?? accounts[0];

      const connection: Connection = {
        accessToken: t.access_token,
        accessExpiresAt: now + (t.expires_in ?? 14 * 86_400) * 1000,
        ...(t.refresh_token ? { refreshToken: t.refresh_token } : {}),
        identityName: identityName || "A Basecamp user",
        accountId: account.id,
        accountName: account.name,
        accounts,
        connectedByUid: started.uid,
        connectedByName: started.name,
        connectedAt: new Date(now).toISOString(),
      };
      await connectionRef().set(connection);
      await statusRef().set({ ...publicStatus(connection), lastSyncError: null }, { merge: true });

      // Fill the Basecamp view straight away rather than at the next hour.
      let firstSync = "";
      try {
        const s = await syncProjects();
        firstSync = `${s.projects} project${s.projects === 1 ? "" : "s"} read from ${account.name}.`;
      } catch (err) {
        logger.warn("First Basecamp sync failed", { error: String(err) });
        firstSync = "The first read of its projects didn't finish; use Sync now in Settings → Basecamp.";
      }

      res.status(200).send(
        resultPage(
          "Basecamp is connected",
          [
            `Waypoint can now act as ${connection.identityName} in ${account.name}.`,
            accounts.length > 1
              ? `That sign-in belongs to ${accounts.length} Basecamp accounts (${accounts.map((a) => `${a.name}, ${a.id}`).join("; ")}). To use a different one, set BASECAMP_ACCOUNT_ID in the functions' configuration and reconnect.`
              : "",
            firstSync,
            "You can close this tab.",
          ].filter(Boolean),
          true,
        ),
      );
    } catch (err) {
      logger.error("Basecamp connect failed", { error: String(err) });
      fail(502, [
        "Basecamp accepted the sign-in but Waypoint couldn't finish connecting.",
        "Try again, and check the function logs if it keeps happening.",
      ]);
    }
  },
);

// Stops Waypoint using Basecamp. What has already been read, and the
// projects already created there, stay where they are.
export const basecampDisconnect = onCall(callable, async (req) => {
  await requireSuperUser(req);
  await connectionRef().delete();
  await statusRef().set({ connected: false }, { merge: true });
  return { ok: true };
});

// ── Waypoint → Basecamp ────────────────────────────────────────────────

function remoteOf(p: BcProject): Remote {
  return {
    name: p.name,
    description: p.description ?? "",
    status: p.status,
    updatedAt: p.updated_at,
  };
}

// One Basecamp project as the Basecamp view shows it.
function mirrorDoc(p: BcProject, waypointProjectId: string | null): Record<string, unknown> {
  return {
    id: String(p.id),
    name: p.name,
    description: htmlToText(p.description),
    status: p.status,
    purpose: p.purpose ?? "",
    startDate: p.start_date ?? "",
    endDate: p.end_date ?? "",
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    appUrl: p.app_url,
    waypointProjectId,
  };
}

// Take the right to create the Basecamp project for this Waypoint one, so
// two saves landing together can't both create it. False when another run
// holds it or the link is already made.
async function claimCreate(projectId: string): Promise<boolean> {
  const ref = linkRef(projectId);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const link = snap.data() as Link | undefined;
    const now = Date.now();
    if (link?.basecampId) return false;
    if (link?.state === "creating" && now - link.startedAt < CLAIM_MS) return false;
    tx.set(ref, { state: "creating", startedAt: now, error: null } satisfies Link);
    return true;
  });
}

type PushOutcome = "created" | "updated" | "unchanged" | "skipped";

// The Basecamp project a link points at, or null when it has been deleted
// there. Deleting in Basecamp puts a project in the trash for a month
// before it goes for good, so a trashed one counts as deleted.
async function findInBasecamp(bc: BasecampClient, basecampId: number): Promise<BcProject | null> {
  try {
    const found = await bc.projects.get(basecampId);
    return found.status === "trashed" ? null : found;
  } catch (err) {
    if ((err as { code?: string } | null)?.code === "not_found") return null;
    throw err;
  }
}

// The Basecamp account's people, read once per run however many projects
// ask: by email address, and by name for the people whose email address
// can't be used. A name more than one person has maps to null, so it's
// never guessed at.
type People = { byEmail: Map<string, number>; byName: Map<string, number | null> };
type PeopleLookup = () => Promise<People>;

function nameKey(name: unknown): string {
  return String(name ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function peopleLookup(bc: BasecampClient): PeopleLookup {
  let cached: Promise<People> | undefined;
  return () =>
    (cached ??= bc.people.list().then((list) => {
      const byEmail = new Map<string, number>();
      const byName = new Map<string, number | null>();
      for (const person of list) {
        const email = String(person.email_address ?? "").trim().toLowerCase();
        if (email && !byEmail.has(email)) byEmail.set(email, person.id);
        const name = nameKey(person.name);
        if (name) byName.set(name, byName.has(name) ? null : person.id);
      }
      logger.info("Basecamp people read", { people: list.length, withEmail: byEmail.size });
      return { byEmail, byName };
    }));
}

// The address someone signs in to Waypoint with, for a profile that doesn't
// carry one. A placeholder profile has no sign-in at all.
async function signInEmail(designerId: string): Promise<string> {
  if (designerId.startsWith("placeholder-")) return "";
  try {
    return String((await getAuth().getUser(designerId)).email ?? "").trim().toLowerCase();
  } catch {
    return "";
  }
}

// Put a Waypoint project's assignees on its Basecamp project. Each one is
// matched to someone in the Basecamp account by the email address on their
// Waypoint profile, then by the address they sign in with, then by their
// name when exactly one person in Basecamp has it; whoever matches is given
// access. Returns the ones nobody there matches, each with the reason.
async function grantAssignees(
  basecampId: number,
  assigneeIds: string[],
  bc: BasecampClient,
  people: PeopleLookup,
): Promise<string[]> {
  if (assigneeIds.length === 0) return [];
  const snaps = await db().getAll(...assigneeIds.map((id) => db().doc(`designers/${id}`)));
  const { byEmail, byName } = await people();
  const grant: number[] = [];
  const missing: string[] = [];
  for (const snap of snaps) {
    const designer = (snap.data() ?? {}) as { name?: string; email?: string };
    const name = String(designer.name ?? "").trim();
    const emails = [String(designer.email ?? "").trim().toLowerCase()];
    let personId = emails[0] ? byEmail.get(emails[0]) : undefined;
    if (personId === undefined) {
      const signIn = await signInEmail(snap.id);
      if (signIn && signIn !== emails[0]) {
        emails.push(signIn);
        personId = byEmail.get(signIn);
      }
    }
    const tried = emails.filter(Boolean);
    const sameName = name ? byName.get(nameKey(name)) : undefined;
    if (personId === undefined && typeof sameName === "number") personId = sameName;
    if (personId !== undefined) {
      grant.push(personId);
      continue;
    }
    const why =
      sameName === null
        ? "more than one person in Basecamp has that name, and none has their email address"
        : tried.length === 0
          ? "no email address on their Waypoint profile, and nobody in Basecamp has that name"
          : `nobody in Basecamp has ${tried.join(" or ")}, or that name`;
    missing.push(`${name || "Someone with no Waypoint profile"} (${why})`);
  }
  logger.info("Basecamp assignees matched", { basecampId, assignees: assigneeIds.length, granted: grant.length, missing });
  if (grant.length > 0) await bc.people.updateProjectAccess(basecampId, { grant });
  return missing.sort();
}

// Make Basecamp's copy of a toggled-on project match Waypoint's: create it
// the first time, then send whatever has changed since the two last
// agreed. Reads the project fresh rather than trusting the event that
// woke it, so a burst of saves ends with the latest one in Basecamp.
// Returns what it did, for the sync summary.
//
// `resumed` is for a project whose Push to Basecamp was just pressed: if it
// was pushed once before, its Basecamp project is looked for first, and a
// new one is made when that one has since been deleted there.
async function pushProject(
  projectId: string,
  bc: BasecampClient,
  people: PeopleLookup,
  resumed = false,
): Promise<PushOutcome> {
  let outcome: PushOutcome = "unchanged";
  // Twice at most: once to do the work, once more in case the project was
  // saved again while that was in flight.
  for (let pass = 0; pass < 2; pass++) {
    const projectSnap = await db().doc(`projects/${projectId}`).get();
    const project = projectSnap.data();
    if (!project || project.syncToBasecamp !== true) return pass === 0 ? "skipped" : outcome;
    const desired = desiredFor(project);
    let link = (await linkRef(projectId).get()).data() as Link | undefined;

    try {
      if (resumed && pass === 0 && link?.basecampId) {
        const found = await findInBasecamp(bc, Number(link.basecampId));
        if (!found) {
          // Forget the old one, so what follows creates it afresh.
          await mirrorRef(link.basecampId).delete();
          await linkRef(projectId).delete();
          link = undefined;
        } else if (link.pushed) {
          // Still there. Take its archived state as Basecamp has it now, in
          // case that changed while the two weren't being kept in step.
          link = { ...link, pushed: { ...link.pushed, archived: found.status === "archived" }, remote: remoteOf(found) };
        }
      }
      if (!link?.basecampId) {
        if (!(await claimCreate(projectId))) return pass === 0 ? "skipped" : outcome;
        let created = await bc.projects.create({
          name: desired.name,
          description: textToHtml(desired.description),
        });
        // Remember the id before anything else can fail, so a retry can
        // never make a second Basecamp project.
        link = {
          state: "linked",
          startedAt: Date.now(),
          basecampId: String(created.id),
          appUrl: created.app_url,
          pushed: { name: desired.name, description: desired.description, archived: false, endDate: "", assignees: "" },
          remote: remoteOf(created),
          error: null,
          syncedAt: new Date().toISOString(),
        };
        await linkRef(projectId).set(link);
        const schedule = scheduleFor(desired.endDate, project.createdAt);
        if (schedule) {
          created = await bc.projects.update(created.id, {
            name: desired.name,
            description: textToHtml(desired.description),
            scheduleAttributes: schedule,
          });
        }
        // People before archiving: Basecamp won't change who's on an
        // archived project.
        const peopleMissing = await grantAssignees(created.id, assigneeIdsOf(project), bc, people);
        if (desired.archived) await bc.projects.archive(created.id);
        const remote = { ...remoteOf(created), status: desired.archived ? "archived" : "active" };
        await linkRef(projectId).set({ ...link, pushed: desired, remote, peopleMissing } satisfies Link);
        await mirrorRef(String(created.id)).set(mirrorDoc({ ...created, status: remote.status }, projectId));
        outcome = "created";
        continue;
      }

      // Assignees nobody in Basecamp matched are looked for again, in case
      // they've been given an account since.
      const hadMissing = (link.peopleMissing ?? []).join("|");
      const retryPeople = pass === 0 && hadMissing !== "";
      if (sameDesired(desired, link.pushed) && !retryPeople) return outcome;
      const id = Number(link.basecampId);
      const was = link.pushed;
      let remote = link.remote;
      const fieldsChanged =
        !was || was.name !== desired.name || was.description !== desired.description || was.endDate !== desired.endDate;
      if (fieldsChanged) {
        const schedule = scheduleFor(desired.endDate, project.createdAt);
        const updated = await bc.projects.update(id, {
          name: desired.name,
          description: textToHtml(desired.description),
          ...(schedule ? { scheduleAttributes: schedule } : {}),
        });
        remote = remoteOf(updated);
        await mirrorRef(link.basecampId).set(mirrorDoc(updated, projectId), { merge: true });
      }
      const archivedChanged = !was || was.archived !== desired.archived;
      const setArchived = async (archive: boolean) => {
        if (archive) await bc.projects.archive(id);
        else await bc.projects.unarchive(id);
        const status = archive ? "archived" : "active";
        if (remote) remote = { ...remote, status };
        await mirrorRef(String(id)).set({ status }, { merge: true });
      };
      // Basecamp won't change who's on an archived project, so people are
      // added after an unarchive and before an archive. A project that was
      // archived and still is keeps its assignees for when it comes back.
      if (archivedChanged && !desired.archived) await setArchived(false);
      const staysArchived = desired.archived && !archivedChanged;
      const peopleChanged = !staysArchived && (!was || was.assignees !== desired.assignees);
      let peopleMissing = link.peopleMissing ?? [];
      if (peopleChanged || (retryPeople && !staysArchived)) {
        peopleMissing = await grantAssignees(id, assigneeIdsOf(project), bc, people);
      }
      if (archivedChanged && desired.archived) await setArchived(true);

      const changed = fieldsChanged || archivedChanged || peopleChanged || peopleMissing.join("|") !== hadMissing;
      // An hourly look for missing people that found nobody new.
      if (!changed) return outcome;
      await linkRef(projectId).set({
        ...link,
        state: "linked",
        pushed: staysArchived ? { ...desired, assignees: was?.assignees ?? "" } : desired,
        ...(remote ? { remote } : {}),
        peopleMissing,
        error: null,
        syncedAt: new Date().toISOString(),
      } satisfies Link);
      if (outcome !== "created") outcome = "updated";
    } catch (err) {
      logger.error("Basecamp push failed", { projectId, error: String(err) });
      // Keeps the id when there is one, so the next attempt updates rather
      // than creating again; without one the next attempt starts over.
      await linkRef(projectId).set(
        {
          startedAt: link?.startedAt ?? Date.now(),
          state: link?.basecampId ? "linked" : "failed",
          error: errorSentence(err),
        },
        { merge: true },
      );
      throw err;
    }
  }
  return outcome;
}

// A project saved in Waypoint. Only /projects is watched: a confidential
// project lives in /confidentialProjects and never leaves Waypoint.
export const basecampPushProject = onDocumentWritten(
  { document: "projects/{projectId}", region: REGION, secrets: BASECAMP_SECRETS },
  async (event) => {
    const after = event.data?.after.data();
    // Deleted, or not switched on: Basecamp's copy (if any) is left alone.
    if (!after || after.syncToBasecamp !== true) return;
    const before = event.data?.before.data();
    // Push to Basecamp was just pressed (or the project is new).
    const resumed = before?.syncToBasecamp !== true;
    // Most saves are comments and tasks, which Basecamp never sees.
    if (!resumed && sameDesired(desiredFor(after), desiredFor(before))) return;
    if (!(await connectionRef().get()).exists) return;
    try {
      const bc = await clientFor(await getConnection());
      await pushProject(event.params.projectId, bc, peopleLookup(bc), resumed);
    } catch (err) {
      // Already recorded on the link for the app to show; the hourly sync
      // tries again.
      logger.error("Basecamp push not completed", { projectId: event.params.projectId, error: String(err) });
    }
  },
);

// ── Basecamp → Waypoint ────────────────────────────────────────────────

type SyncSummary = {
  // Basecamp projects now mirrored (active and archived).
  projects: number;
  // Waypoint projects created in, or re-sent to, Basecamp by this run.
  pushed: number;
  // Waypoint projects whose name or overview was updated from Basecamp.
  pulled: number;
  warnings: string[];
};

// A linked project as Basecamp now has it. A name or description changed
// there is brought into Waypoint when Waypoint's own copy hasn't changed
// since the two last agreed; otherwise it's left for the push that follows
// to overwrite. Returns true when the Waypoint project was changed.
async function pullLinked(projectId: string, link: Link, remoteProject: BcProject | undefined): Promise<boolean> {
  if (!link.basecampId || !link.pushed) return false;
  const seen = link.remote;
  if (!remoteProject) {
    if (seen?.status !== "missing") {
      const gone: Remote = { ...(seen ?? { name: "", description: "", updatedAt: "" }), status: "missing" };
      await linkRef(projectId).set({ remote: gone }, { merge: true });
    }
    return false;
  }
  const now = remoteOf(remoteProject);
  const nameChanged = now.name !== seen?.name;
  const descriptionChanged = now.description !== seen?.description;
  if (!nameChanged && !descriptionChanged && now.status === seen?.status) return false;

  const pushed: Desired = { ...link.pushed };
  const patch: Record<string, string> = {};
  if (nameChanged || descriptionChanged) {
    const project = (await db().doc(`projects/${projectId}`).get()).data();
    if (project && project.syncToBasecamp === true) {
      const current = desiredFor(project);
      const name = desiredFor({ title: now.name }).name;
      if (nameChanged && now.name.trim() && current.name === pushed.name && name !== current.name) {
        patch.title = name;
        pushed.name = name;
      }
      const text = htmlToText(now.description);
      if (descriptionChanged && current.description === pushed.description && text !== current.description) {
        patch.overview = text;
        pushed.description = text;
      }
    }
  }
  // The link first, so the save below finds the two sides already agreeing
  // and isn't sent straight back to Basecamp.
  await linkRef(projectId).set({ remote: now, pushed, syncedAt: new Date().toISOString() }, { merge: true });
  if (Object.keys(patch).length === 0) return false;
  await db().doc(`projects/${projectId}`).update(patch);
  return true;
}

function sameMirror(a: Record<string, unknown>, b: Record<string, unknown> | undefined): boolean {
  return !!b && Object.keys(a).every((k) => a[k] === b[k]);
}

// The whole sync: read Basecamp's projects into the mirror, bring changes
// to linked projects back, then make sure every toggled-on Waypoint project
// is in Basecamp (which also retries anything the save-time push missed).
async function syncProjects(): Promise<SyncSummary> {
  const connection = await getConnection();
  const bc = await clientFor(connection);
  const summary: SyncSummary = { projects: 0, pushed: 0, pulled: 0, warnings: [] };

  const [active, archived] = await Promise.all([
    bc.projects.list({ status: "active" }),
    bc.projects.list({ status: "archived" }),
  ]);
  const remote = new Map<string, BcProject>();
  for (const p of [...active, ...archived]) remote.set(String(p.id), p);
  summary.projects = remote.size;

  const linkSnap = await db().collection("basecampLinks").get();
  const links = new Map<string, Link>();
  const projectIdByBasecampId = new Map<string, string>();
  for (const d of linkSnap.docs) {
    const link = d.data() as Link;
    links.set(d.id, link);
    if (link.basecampId) projectIdByBasecampId.set(link.basecampId, d.id);
  }

  // The mirror: write what's new or changed, drop what Basecamp no longer
  // lists (trashed, deleted, or no longer visible to the connected account).
  const mirrorSnap = await db().collection("basecampProjects").get();
  const existing = new Map(mirrorSnap.docs.map((d) => [d.id, d.data() as Record<string, unknown>]));
  const writes: ((batch: FirebaseFirestore.WriteBatch) => void)[] = [];
  for (const [id, p] of remote) {
    const next = mirrorDoc(p, projectIdByBasecampId.get(id) ?? null);
    if (!sameMirror(next, existing.get(id))) writes.push((batch) => batch.set(mirrorRef(id), next));
  }
  for (const id of existing.keys()) {
    if (!remote.has(id)) writes.push((batch) => batch.delete(mirrorRef(id)));
  }
  for (let i = 0; i < writes.length; i += 400) {
    const batch = db().batch();
    writes.slice(i, i + 400).forEach((write) => write(batch));
    await batch.commit();
  }

  for (const [projectId, link] of links) {
    try {
      const theirs = link.basecampId ? remote.get(link.basecampId) : undefined;
      if (await pullLinked(projectId, link, theirs)) summary.pulled++;
    } catch (err) {
      summary.warnings.push(`Couldn't bring Basecamp's changes into project ${projectId}: ${errorSentence(err)}`);
    }
  }

  const toggled = await db().collection("projects").where("syncToBasecamp", "==", true).get();
  const people = peopleLookup(bc);
  for (const d of toggled.docs) {
    try {
      const outcome = await pushProject(d.id, bc, people);
      if (outcome === "created" || outcome === "updated") summary.pushed++;
    } catch (err) {
      const title = String((d.data() as { title?: string }).title ?? d.id);
      summary.warnings.push(`“${title}” couldn't be sent to Basecamp: ${errorSentence(err)}`);
    }
  }

  await statusRef().set(
    {
      ...publicStatus(connection),
      lastSyncAt: new Date().toISOString(),
      lastSyncError: summary.warnings.length > 0 ? summary.warnings.join(" ") : null,
      lastSyncProjects: summary.projects,
    },
    { merge: true },
  );
  return summary;
}

// "Sync now" in Settings → Basecamp and on the Basecamp view.
export const basecampSyncNow = onCall({ ...callable, timeoutSeconds: 300 }, async (req) => {
  await requireSuperUser(req);
  try {
    return await syncProjects();
  } catch (err) {
    const e = asHttpsError(err);
    await statusRef().set({ lastSyncAt: new Date().toISOString(), lastSyncError: e.message }, { merge: true });
    throw e;
  }
});

// Every hour. Basecamp can't tell Waypoint when a project is created, so
// this is how one made there turns up here.
export const basecampHourlySync = onSchedule(
  {
    schedule: "every 60 minutes",
    region: REGION,
    secrets: BASECAMP_SECRETS,
    timeoutSeconds: 300,
  },
  async () => {
    const connected = (await connectionRef().get()).exists;
    if (!connected) return;
    try {
      const summary = await syncProjects();
      logger.info("Basecamp projects synced", summary);
    } catch (err) {
      const message = err instanceof HttpsError ? err.message : errorSentence(err);
      logger.error("Basecamp sync failed", { error: String(err) });
      await statusRef().set({ lastSyncAt: new Date().toISOString(), lastSyncError: message }, { merge: true });
    }
  },
);
