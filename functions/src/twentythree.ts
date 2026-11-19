// TwentyThree for the webinar kit: creating a webinar's registration page
// from what's been filled in under "Landing page & promotion inputs".
//
// twentyThreeCreateWebinar reads the campaign's kit from Firestore (so it
// sends what's saved, not what a browser claims), creates the webinar in
// TwentyThree, adds the speakers with their bios and headshots, sets the
// hero image as the thumbnail, and writes the webinar's id and address back
// onto the kit. The webinar is created private, so Digital reviews and
// publishes it in TwentyThree.
//
// TwentyThree's API (https://www.twentythree.com/api-reference) signs each
// request with OAuth 1.0a. The workspace's address and the four keys from
// its API settings (Settings → API in TwentyThree; the app needs write
// access) are secrets, set with `firebase functions:secrets:set <NAME>`:
//
//   TWENTYTHREE_DOMAIN               e.g. video.example.com
//   TWENTYTHREE_CONSUMER_KEY
//   TWENTYTHREE_CONSUMER_SECRET
//   TWENTYTHREE_ACCESS_TOKEN
//   TWENTYTHREE_ACCESS_TOKEN_SECRET

import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { createHmac, randomBytes } from "node:crypto";
import { isFetchableUrl } from "./linkedinText";
import {
  cleanDomain,
  describeWebinar,
  kitSpeakers,
  liveRows,
  matchLive,
  oauthHeader,
  parseLiveRef,
  pickUrl,
  resultsFromFunnel,
  resultsFromMetrics,
  rfc3986,
  splitTitle,
  type KitDoc,
  type KitSpeaker,
  type LiveRow,
  type Metric,
  type Results,
} from "./twentythreeText";

const TT_DOMAIN = defineSecret("TWENTYTHREE_DOMAIN");
const TT_CONSUMER_KEY = defineSecret("TWENTYTHREE_CONSUMER_KEY");
const TT_CONSUMER_SECRET = defineSecret("TWENTYTHREE_CONSUMER_SECRET");
const TT_ACCESS_TOKEN = defineSecret("TWENTYTHREE_ACCESS_TOKEN");
const TT_ACCESS_TOKEN_SECRET = defineSecret("TWENTYTHREE_ACCESS_TOKEN_SECRET");
const TT_SECRETS = [TT_DOMAIN, TT_CONSUMER_KEY, TT_CONSUMER_SECRET, TT_ACCESS_TOKEN, TT_ACCESS_TOKEN_SECRET];

const REGION = "us-central1";
// Keep in step with ALLOWED_ORIGINS in linkedin.ts.
const ALLOWED_ORIGINS = [
  "https://lachlan-odea.github.io",
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
];

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
// How long a "being created" marker holds off a second click.
const LOCK_MS = 3 * 60_000;

// initializeApp() runs in index.ts after this module has loaded.
function db(): Firestore {
  return getFirestore();
}

// ── Who may call ───────────────────────────────────────────────────────

type Caller = { uid: string; name: string };

// Anyone who can edit a webinar's kit can create its page: a signed-in
// (not anonymous) Waypoint account.
async function requireSignedIn(req: CallableRequest<unknown>): Promise<Caller> {
  const auth = req.auth;
  if (!auth || auth.token.firebase?.sign_in_provider === "anonymous") {
    throw new HttpsError("unauthenticated", "Sign in to Waypoint first.");
  }
  const snap = await db().collection("designers").doc(auth.uid).get();
  const name = String((snap.data() as { name?: string } | undefined)?.name ?? "").trim();
  return { uid: auth.uid, name: name || String(auth.token.email ?? "") || "Someone" };
}

// ── Talking to TwentyThree ─────────────────────────────────────────────

type Creds = {
  domain: string;
  consumerKey: string;
  consumerSecret: string;
  token: string;
  tokenSecret: string;
};

function creds(): Creds {
  const c = {
    domain: cleanDomain(TT_DOMAIN.value()),
    consumerKey: TT_CONSUMER_KEY.value().trim(),
    consumerSecret: TT_CONSUMER_SECRET.value().trim(),
    token: TT_ACCESS_TOKEN.value().trim(),
    tokenSecret: TT_ACCESS_TOKEN_SECRET.value().trim(),
  };
  if (!c.domain || !c.consumerKey || !c.consumerSecret || !c.token || !c.tokenSecret) {
    throw new HttpsError(
      "failed-precondition",
      "TwentyThree isn't set up yet. Set the TWENTYTHREE_DOMAIN, TWENTYTHREE_CONSUMER_KEY, TWENTYTHREE_CONSUMER_SECRET, TWENTYTHREE_ACCESS_TOKEN and TWENTYTHREE_ACCESS_TOKEN_SECRET secrets, then deploy the functions again.",
    );
  }
  return c;
}

class TwentyThreeError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
    what: string,
  ) {
    super(`TwentyThree ${what} failed: ${status} ${detail.slice(0, 400)}`);
  }
}

type Params = Record<string, string>;
type Upload = { bytes: ArrayBuffer; type: string; name: string };

const formEncode = (p: Params) =>
  Object.entries(p)
    .map(([k, v]) => `${rfc3986(k)}=${rfc3986(v)}`)
    .join("&");

// One signed call. A file goes as multipart alongside the other parameters,
// which TwentyThree reads from the form and counts in the signature; only
// the file itself is left out of it (`bareSignature` leaves the fields out
// too, see ttUpload).
async function tt(
  c: Creds,
  method: "GET" | "POST",
  path: string,
  params: Params,
  what: string,
  upload?: Upload,
  bareSignature = false,
): Promise<Record<string, unknown>> {
  const base = `https://${c.domain}/api/2${path}`;
  const authorization = oauthHeader({
    method,
    url: base,
    params: upload && bareSignature ? {} : params,
    consumerKey: c.consumerKey,
    consumerSecret: c.consumerSecret,
    token: c.token,
    tokenSecret: c.tokenSecret,
    nonce: randomBytes(16).toString("hex"),
    timestamp: Math.floor(Date.now() / 1000),
    hmac: (key, text) => createHmac("sha1", key).update(text).digest("base64"),
  });
  const query = formEncode(params);
  let url = base;
  const init: RequestInit = {
    method,
    headers: { Authorization: authorization, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  };
  if (upload) {
    const form = new FormData();
    for (const [k, v] of Object.entries(params)) form.append(k, v);
    form.append("file", new Blob([upload.bytes], { type: upload.type }), upload.name);
    init.body = form;
  } else if (method === "GET") {
    if (query) url = `${base}?${query}`;
  } else {
    init.body = query;
    (init.headers as Record<string, string>)["Content-Type"] = "application/x-www-form-urlencoded";
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // Not JSON: reported below with the start of whatever came back.
  }
  if (!res.ok || !json || json.status !== "ok") {
    const detail = json ? String(json.message ?? json.code ?? text) : text;
    throw new TwentyThreeError(res.status, detail, what);
  }
  return json;
}

// A file upload. TwentyThree’s reference says only the file stays out of
// the signature; strict OAuth leaves the whole multipart form out. If the
// first is refused as a bad signature, the second is tried.
async function ttUpload(c: Creds, path: string, params: Params, what: string, upload: Upload) {
  try {
    return await tt(c, "POST", path, params, what, upload);
  } catch (err) {
    const auth =
      err instanceof TwentyThreeError &&
      (err.status === 401 || err.status === 403 || /signature|authenticat/i.test(err.detail));
    if (!auth) throw err;
    return tt(c, "POST", path, params, what, upload, true);
  }
}

// An image from a link in the kit, if the link really is one. SharePoint
// and other sign-in links come back as a web page and are turned away.
async function fetchImage(raw: string): Promise<Upload | string> {
  const url = raw.trim();
  if (!isFetchableUrl(url)) return "the link isn't a public web address";
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  } catch {
    return "the link couldn't be reached";
  }
  if (res.status === 401 || res.status === 403) {
    return "the link needs a sign-in. Use a public link that opens the image without signing in";
  }
  if (!res.ok) return `the link answered ${res.status}`;
  const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!IMAGE_TYPES.includes(type)) {
    return "the link doesn't open an image directly. Use a public link that opens the image without signing in";
  }
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > MAX_IMAGE_BYTES) return "the image is over 10 MB";
  return { bytes, type, name: `image.${type.split("/")[1].replace("jpeg", "jpg")}` };
}

// ── Speakers ───────────────────────────────────────────────────────────

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// A speaker TwentyThree already lists for the webinar.
type Listed = { name: string; id: string; hasAvatar: boolean };

// The headshot from the kit as a speaker’s avatar. True when it was set.
async function setAvatar(c: Creds, speakerId: string, sp: KitSpeaker, warnings: string[]): Promise<boolean> {
  const img = await fetchImage(sp.headshot);
  if (typeof img === "string") {
    warnings.push(`${sp.name}’s headshot wasn’t added: ${img}.`);
    return false;
  }
  await ttUpload(c, "/live/speaker/set-avatar", { live_speaker_id: speakerId }, "set avatar", img);
  return true;
}

// Add the kit’s speakers to a webinar, in kit order. Anyone TwentyThree
// already lists by name isn’t added again, but is given their headshot if
// they have none. Never invited from here: Digital sends
// invitations from TwentyThree when the session is ready. TwentyThree needs
// an email address for each speaker, taken from the kit row or, failing
// that, the speaker directory.
async function addSpeakers(
  c: Creds,
  liveId: string,
  speakers: KitSpeaker[],
  existing: Listed[],
  warnings: string[],
): Promise<{ added: number; headshots: number }> {
  let added = 0;
  let headshots = 0;
  for (const sp of speakers) {
    try {
      const listed = existing.find((e) => sameName(e.name, sp.name));
      if (listed) {
        if (!listed.hasAvatar && listed.id && sp.headshot && (await setAvatar(c, listed.id, sp, warnings))) headshots++;
        continue;
      }
      let email = sp.email;
      if (!email && sp.speakerId && !sp.speakerId.includes("/")) {
        const dir = await db().collection("speakers").doc(sp.speakerId).get();
        email = String((dir.data() as { email?: string } | undefined)?.email ?? "").trim();
      }
      if (!email) {
        warnings.push(`${sp.name} wasn’t added: TwentyThree needs an email address for each speaker. Add one, then choose Add speakers.`);
        continue;
      }
      const { title, company } = splitTitle(sp.title);
      const params: Params = { live_id: liveId, name: sp.name, email, send_invitation_p: "false" };
      if (title) params.title = title;
      if (company) params.company = company;
      if (sp.bio) params.bio = sp.bio;
      const res = await tt(c, "POST", "/live/speaker/add", params, "add speaker");
      added++;
      const speakerId = String((res.data as { live_speaker_id?: unknown } | undefined)?.live_speaker_id ?? "");
      if (sp.headshot && speakerId && (await setAvatar(c, speakerId, sp, warnings))) headshots++;
    } catch (err) {
      logger.warn("twentythree: speaker", err);
      const why = err instanceof TwentyThreeError ? err.detail.slice(0, 160) : "something went wrong";
      warnings.push(`${sp.name} needs checking in TwentyThree (${why}).`);
    }
  }
  return { added, headshots };
}

// ── Creating the webinar ───────────────────────────────────────────────

type CreateInput = {
  campaignId?: unknown;
  // Local date and time, "YYYY-MM-DDTHH:MM", in `timezone`.
  startTime?: unknown;
  timezone?: unknown;
  durationMinutes?: unknown;
};

export type CreateResult = {
  liveId: string;
  url: string;
  speakersAdded: number;
  warnings: string[];
};

function validZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function fail(err: unknown, what: string): never {
  if (err instanceof HttpsError) throw err;
  logger.error(`twentythree: ${what}`, err);
  if (err instanceof TwentyThreeError) {
    if (err.status === 401 || err.status === 403) {
      throw new HttpsError(
        "permission-denied",
        `TwentyThree refused the request (${err.detail.slice(0, 200)}). Check the TWENTYTHREE_* secrets and that the API app has write access.`,
      );
    }
    throw new HttpsError("internal", `TwentyThree couldn't ${what}: ${err.detail.slice(0, 300)}`);
  }
  throw new HttpsError("internal", `Couldn't ${what}: ${err instanceof Error ? err.message : String(err)}`);
}

export const twentyThreeCreateWebinar = onCall(
  { region: REGION, cors: ALLOWED_ORIGINS, secrets: TT_SECRETS, invoker: "public", timeoutSeconds: 300 },
  async (req): Promise<CreateResult> => {
    const caller = await requireSignedIn(req);
    const input = (req.data ?? {}) as CreateInput;
    const campaignId = typeof input.campaignId === "string" ? input.campaignId.trim() : "";
    const startTime = typeof input.startTime === "string" ? input.startTime.trim() : "";
    const timezone = typeof input.timezone === "string" ? input.timezone.trim() : "";
    const minutes = Math.round(Number(input.durationMinutes));
    if (!campaignId || campaignId.includes("/")) throw new HttpsError("invalid-argument", "Which webinar?");
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(startTime)) {
      throw new HttpsError("invalid-argument", "Choose the date and start time.");
    }
    if (!timezone || !validZone(timezone)) throw new HttpsError("invalid-argument", "Choose a time zone.");
    if (!Number.isFinite(minutes) || minutes < 5 || minutes > 600) {
      throw new HttpsError("invalid-argument", "The duration should be between 5 and 600 minutes.");
    }
    const c = creds();

    const ref = db().collection("campaigns").doc(campaignId);
    const lockRef = db().collection("twentythreePrivate").doc(campaignId);

    // Read the kit, and hold off a second click while this one runs.
    const kit = await db().runTransaction(async (tx) => {
      const [snap, lock] = await Promise.all([tx.get(ref), tx.get(lockRef)]);
      const k = (snap.data() as { webinar?: KitDoc } | undefined)?.webinar;
      if (!snap.exists || !k) throw new HttpsError("not-found", "That webinar no longer exists.");
      if (k.values?.landing?.ttLiveId) {
        throw new HttpsError("already-exists", "This webinar has already been created in TwentyThree.");
      }
      const started = Number((lock.data() as { startedAt?: number } | undefined)?.startedAt ?? 0);
      if (Date.now() - started < LOCK_MS) {
        throw new HttpsError("aborted", "This webinar is already being created in TwentyThree. Give it a minute.");
      }
      tx.set(lockRef, { startedAt: Date.now(), uid: caller.uid });
      return { ...k, name: String((snap.data() as { name?: string }).name ?? "") };
    });

    const warnings: string[] = [];
    try {
      const name = (kit.ft || kit.wt || kit.name || "").trim();
      if (!name) throw new HttpsError("failed-precondition", "Add the final webinar title first.");

      // "On-demand recording enabled", ticked on the kit’s email sequence.
      const onDemand = kit.values?.landing?.["emailSeq|od"] === true;

      // 1. The webinar itself, private until Digital publishes it.
      let liveId = "";
      let token = "";
      try {
        const created = await tt(
          c,
          "POST",
          "/live/create",
          {
            name,
            description: describeWebinar(kit),
            live_format: "webinar",
            private_p: "true",
            registration_mode: "all",
            start_time: `${startTime.replace("T", " ")}:00`,
            duration_minutes: String(minutes),
            timezone,
            // On demand needs a recording to show.
            ...(onDemand ? { auto_record_p: "true" } : {}),
          },
          "create",
        );
        const data = (created.data ?? {}) as { live_id?: unknown; token?: unknown };
        liveId = String(data.live_id ?? "");
        token = String(data.token ?? "");
        if (!liveId) throw new TwentyThreeError(200, "no webinar id came back", "create");
      } catch (err) {
        fail(err, "create the webinar");
      }

      // Recorded straight away, so a failure further down can't lead to a
      // second webinar being created.
      const at = new Date().toISOString();
      await db().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const k = (snap.data() as { webinar?: KitDoc } | undefined)?.webinar;
        if (!k) return;
        const entry = {
          id: `a-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`,
          section: "landing",
          what: "created the webinar in TwentyThree",
          detail: name,
          by: caller.uid,
          at,
        };
        tx.update(ref, {
          "webinar.values.landing.ttLiveId": liveId,
          "webinar.values.landing.ttAt": at,
          "webinar.activity": [entry, ...(Array.isArray(k.activity) ? k.activity : [])].slice(0, 300),
          "webinar.updatedAt": at,
        });
      });

      // On demand is a setting on an existing webinar, not part of creating one.
      if (onDemand) {
        try {
          await tt(c, "POST", "/live/update", { live_id: liveId, enable_ondemand_p: "true" }, "enable on demand");
        } catch (err) {
          logger.warn("twentythree: on demand", err);
          warnings.push("On-demand wasn’t switched on. Turn it on in TwentyThree.");
        }
      }

      // 2. Speakers.
      const { added: speakersAdded } = await addSpeakers(c, liveId, kitSpeakers(kit), [], warnings);

      // 3. The hero image as the webinar's thumbnail.
      const hero = String(kit.values?.landing?.hero ?? "").trim();
      if (hero) {
        try {
          const img = await fetchImage(hero);
          if (typeof img === "string") warnings.push(`The hero image wasn't added: ${img}.`);
          else await ttUpload(c, "/live/upload-image", { live_id: liveId, type: "thumbnail" }, "upload image", img);
        } catch (err) {
          logger.warn("twentythree: hero", err);
          warnings.push("The hero image wasn't added. Upload it in TwentyThree.");
        }
      }

      // 4. Where the page lives.
      let url = "";
      try {
        const listed = await tt(
          c,
          "GET",
          "/live/list",
          { live_id: liveId, token, include_private_p: "true", use_full_urls_p: "true" },
          "look up",
        );
        url = pickUrl(listed.data, c.domain);
      } catch (err) {
        logger.warn("twentythree: lookup", err);
      }
      if (url) {
        await db().runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          const k = (snap.data() as { webinar?: KitDoc } | undefined)?.webinar;
          if (!k) return;
          const patch: Record<string, string> = { "webinar.values.landing.ttUrl": url };
          if (!String(k.values?.landing?.landingLink ?? "").trim()) {
            patch["webinar.values.landing.landingLink"] = url;
          }
          tx.update(ref, patch);
        });
      } else {
        warnings.push("TwentyThree didn't say where the page lives. Copy its link into Landing page link by hand.");
      }

      return { liveId, url, speakersAdded, warnings };
    } finally {
      await lockRef.delete().catch(() => undefined);
    }
  },
);

// ── Linking a webinar that already exists ──────────────────────────────

// How far to look through the workspace’s webinars for a pasted link.
const LINK_PAGE_SIZE = 100;
const LINK_MAX_PAGES = 10;

// Link the kit to a webinar that was set up in TwentyThree by hand, from
// its link or id, so Add speakers and Pull results work for it. Nothing is
// changed in TwentyThree.
export const twentyThreeLinkWebinar = onCall(
  { region: REGION, cors: ALLOWED_ORIGINS, secrets: TT_SECRETS, invoker: "public", timeoutSeconds: 120 },
  async (req): Promise<{ liveId: string; url: string; name: string }> => {
    const caller = await requireSignedIn(req);
    const input = (req.data ?? {}) as { campaignId?: unknown; link?: unknown };
    const campaignId = typeof input.campaignId === "string" ? input.campaignId.trim() : "";
    const link = typeof input.link === "string" ? input.link.trim().slice(0, 2000) : "";
    if (!campaignId || campaignId.includes("/")) throw new HttpsError("invalid-argument", "Which webinar?");
    const wanted = parseLiveRef(link);
    if (!wanted) {
      throw new HttpsError("invalid-argument", "Paste the webinar’s link from TwentyThree, or its ID.");
    }
    const c = creds();

    const ref = db().collection("campaigns").doc(campaignId);
    const lockRef = db().collection("twentythreePrivate").doc(campaignId);
    const before = ((await ref.get()).data() as { webinar?: KitDoc } | undefined)?.webinar;
    if (!before) throw new HttpsError("not-found", "That webinar no longer exists.");
    if (before.values?.landing?.ttLiveId) {
      throw new HttpsError("already-exists", "This webinar is already linked to TwentyThree. Unlink it first.");
    }

    let found: LiveRow | undefined;
    try {
      // An id in what was pasted is the quick way in.
      for (const id of wanted.ids.slice(0, 5)) {
        try {
          const res = await tt(
            c,
            "GET",
            "/live/list",
            { live_id: id, include_private_p: "true", use_full_urls_p: "true" },
            "look up",
          );
          found = liveRows(res.data, c.domain).find((r) => r.liveId === id);
        } catch (err) {
          // No such webinar is an answer, not a failure.
          const refused = err instanceof TwentyThreeError && (err.status === 401 || err.status === 403);
          if (refused || !(err instanceof TwentyThreeError)) throw err;
        }
        if (found) break;
      }
      // Otherwise, the webinar whose page the link opens.
      for (let p = 1; !found && wanted.path && p <= LINK_MAX_PAGES; p++) {
        const res = await tt(
          c,
          "GET",
          "/live/list",
          { include_private_p: "true", use_full_urls_p: "true", p: String(p), size: String(LINK_PAGE_SIZE) },
          "list webinars",
        );
        const rows = liveRows(res.data, c.domain);
        found = matchLive(rows, wanted.path);
        if (rows.length < LINK_PAGE_SIZE) break;
      }
    } catch (err) {
      fail(err, "look up the webinar");
    }
    if (!found) {
      throw new HttpsError(
        "not-found",
        "No webinar in TwentyThree matches that. Check the link, or paste the webinar’s ID: the number in its address when it’s open in TwentyThree.",
      );
    }
    const { liveId, name, url } = found;

    const at = new Date().toISOString();
    await db().runTransaction(async (tx) => {
      const [snap, lock] = await Promise.all([tx.get(ref), tx.get(lockRef)]);
      const k = (snap.data() as { webinar?: KitDoc } | undefined)?.webinar;
      if (!k) throw new HttpsError("not-found", "That webinar no longer exists.");
      if (k.values?.landing?.ttLiveId) {
        throw new HttpsError("already-exists", "This webinar is already linked to TwentyThree. Unlink it first.");
      }
      const started = Number((lock.data() as { startedAt?: number } | undefined)?.startedAt ?? 0);
      if (Date.now() - started < LOCK_MS) {
        throw new HttpsError("aborted", "This webinar is being created in TwentyThree right now. Give it a minute.");
      }
      const patch: Record<string, unknown> = {
        "webinar.values.landing.ttLiveId": liveId,
        "webinar.values.landing.ttAt": at,
        "webinar.values.landing.ttLinked": true,
        "webinar.activity": [
          {
            id: `a-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`,
            section: "landing",
            what: "linked an existing webinar in TwentyThree",
            detail: name,
            by: caller.uid,
            at,
          },
          ...(Array.isArray(k.activity) ? k.activity : []),
        ].slice(0, 300),
        "webinar.updatedAt": at,
      };
      if (url) {
        patch["webinar.values.landing.ttUrl"] = url;
        if (!String(k.values?.landing?.landingLink ?? "").trim()) patch["webinar.values.landing.landingLink"] = url;
      }
      tx.update(ref, patch);
    });
    return { liveId, url, name };
  },
);

// Send the kit’s speakers to a webinar that’s already been created: the
// ones added to the kit since, or held back for want of an email address.
export const twentyThreeAddSpeakers = onCall(
  { region: REGION, cors: ALLOWED_ORIGINS, secrets: TT_SECRETS, invoker: "public", timeoutSeconds: 300 },
  async (req): Promise<{ speakersAdded: number; headshotsAdded: number; warnings: string[] }> => {
    await requireSignedIn(req);
    const campaignId = String((req.data as { campaignId?: unknown } | null)?.campaignId ?? "").trim();
    if (!campaignId || campaignId.includes("/")) throw new HttpsError("invalid-argument", "Which webinar?");
    const c = creds();
    const snap = await db().collection("campaigns").doc(campaignId).get();
    const kit = (snap.data() as { webinar?: KitDoc } | undefined)?.webinar;
    if (!kit) throw new HttpsError("not-found", "That webinar no longer exists.");
    const liveId = String(kit.values?.landing?.ttLiveId ?? "").trim();
    if (!liveId) throw new HttpsError("failed-precondition", "Create the webinar in TwentyThree, or link it, first.");

    // Who’s already there, so nobody is added twice.
    let existing: Listed[] = [];
    try {
      // The speaker list is opened with the webinar’s own token.
      const live = await tt(c, "GET", "/live/list", { live_id: liveId, include_private_p: "true" }, "look up");
      const row = (Array.isArray(live.data) ? live.data[0] : undefined) as { token?: unknown } | undefined;
      const token = String(row?.token ?? "");
      if (!token) {
        throw new HttpsError(
          "not-found",
          "That webinar couldn’t be found in TwentyThree. If it was deleted there, choose Unlink, then create or link it again.",
        );
      }
      const listed = await tt(
        c,
        "GET",
        "/live/speaker/list",
        { live_id: liveId, token, include_unapproved_p: "true" },
        "list speakers",
      );
      existing = (Array.isArray(listed.data) ? listed.data : []).map((r) => {
        const x = r as { name?: unknown; live_speaker_id?: unknown; has_avatar_p?: unknown };
        const avatar = x.has_avatar_p;
        return {
          name: String(x.name ?? ""),
          id: String(x.live_speaker_id ?? ""),
          hasAvatar: avatar === true || avatar === 1 || avatar === "1" || avatar === "true",
        };
      });
    } catch (err) {
      fail(err, "list the webinar’s speakers");
    }
    const warnings: string[] = [];
    const { added, headshots } = await addSpeakers(c, liveId, kitSpeakers(kit), existing, warnings);
    return { speakersAdded: added, headshotsAdded: headshots, warnings };
  },
);

// ── Results ────────────────────────────────────────────────────────────

// Keep in step with the results fields in src/webinarKit.ts.
const RESULT_LABELS: Record<keyof Results, string> = {
  pageViews: "Landing page views",
  regs: "Registrants",
  atts: "Live attendees",
  odViews: "On-demand views",
  liveEng: "Live average engagement",
  odEng: "On-demand average engagement",
  qna: "Q&A questions asked",
  polls: "Poll responses",
  leads: "Leads identified",
};

// How many past pulls the kit keeps.
const MAX_PULLS = 100;

// Fill the kit’s Performance numbers from TwentyThree: the webinar’s own
// metrics, the Audience funnel for page visits and registrations, and
// counts of the questions asked and poll answers given. A number
// TwentyThree doesn’t give is left as it is.
export const twentyThreePullResults = onCall(
  { region: REGION, cors: ALLOWED_ORIGINS, secrets: TT_SECRETS, invoker: "public", timeoutSeconds: 120 },
  async (req): Promise<{ filled: string[]; missing: string[] }> => {
    const caller = await requireSignedIn(req);
    const campaignId = String((req.data as { campaignId?: unknown } | null)?.campaignId ?? "").trim();
    if (!campaignId || campaignId.includes("/")) throw new HttpsError("invalid-argument", "Which webinar?");
    const c = creds();
    const ref = db().collection("campaigns").doc(campaignId);
    const kit = ((await ref.get()).data() as { webinar?: KitDoc } | undefined)?.webinar;
    if (!kit) throw new HttpsError("not-found", "That webinar no longer exists.");
    const liveId = String(kit.values?.landing?.ttLiveId ?? "").trim();
    if (!liveId) throw new HttpsError("failed-precondition", "Create the webinar in TwentyThree, or link it, first.");

    let results: Results = {};
    try {
      const res = await tt(
        c,
        "GET",
        "/live/metrics",
        { live_id: liveId, include_private_p: "true", update_p: "true" },
        "read metrics",
      );
      const metrics = (Array.isArray(res.data) ? res.data : []) as Metric[];
      // The metric names aren’t documented; logged so the matching in
      // resultsFromMetrics can be checked against what really comes back.
      logger.info("twentythree: metrics", { liveId, metrics: metrics.map((m) => `${m.metric}=${m.value}`) });
      results = resultsFromMetrics(metrics);
    } catch (err) {
      fail(err, "read the webinar’s metrics");
    }

    // The rest is best effort: each fills a gap, and none stops the others.
    try {
      const res = await tt(c, "GET", "/audience/funnel", { objects: liveId, resolve_recordings_p: "true" }, "read funnel");
      logger.info("twentythree: funnel", { liveId, funnel: res.data });
      results = { ...resultsFromFunnel(res.data), ...results };
    } catch (err) {
      logger.warn("twentythree: funnel", err);
    }
    try {
      const res = await tt(c, "GET", "/poll/list", { object_id: liveId }, "list polls");
      const polls = (Array.isArray(res.data) ? res.data : []) as { answer_count?: unknown }[];
      if (polls.length) results.polls = polls.reduce((sum, p) => sum + (Number(p.answer_count) || 0), 0);
    } catch (err) {
      logger.warn("twentythree: polls", err);
    }
    try {
      const res = await tt(
        c,
        "GET",
        "/comment/list",
        { object_id: liveId, comment_type: "question", size: "500" },
        "list questions",
      );
      const questions = Array.isArray(res.data) ? res.data.length : 0;
      if (questions) results.qna = questions;
    } catch (err) {
      logger.warn("twentythree: questions", err);
    }

    const keys = Object.keys(RESULT_LABELS) as (keyof Results)[];
    const found = keys.filter((k) => results[k] !== undefined);
    if (found.length) {
      const at = new Date().toISOString();
      await db().runTransaction(async (tx) => {
        const k = ((await tx.get(ref)).data() as { webinar?: KitDoc } | undefined)?.webinar;
        if (!k) return;
        const patch: Record<string, unknown> = { "webinar.values.results.ttPulledAt": at, "webinar.updatedAt": at };
        for (const key of found) patch[`webinar.values.results.${key}`] = results[key];
        // The log of pulls, newest first: the numbers as they were each time.
        patch["webinar.ttPulls"] = [
          { at, by: caller.uid, values: Object.fromEntries(found.map((key) => [key, results[key]])) },
          ...(Array.isArray(k.ttPulls) ? k.ttPulls : []),
        ].slice(0, MAX_PULLS);
        patch["webinar.activity"] = [
          {
            id: `a-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`,
            section: "results",
            what: "pulled results from TwentyThree",
            detail: found.map((key) => RESULT_LABELS[key]).join(", "),
            by: caller.uid,
            at,
          },
          ...(Array.isArray(k.activity) ? k.activity : []),
        ].slice(0, 300);
        tx.update(ref, patch);
      });
    }
    return {
      filled: found.map((k) => RESULT_LABELS[k]),
      missing: keys.filter((k) => !found.includes(k)).map((k) => RESULT_LABELS[k]),
    };
  },
);
