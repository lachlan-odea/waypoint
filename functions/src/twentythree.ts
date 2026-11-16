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
  oauthHeader,
  pickUrl,
  rfc3986,
  splitTitle,
  type KitDoc,
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

// One signed call. A file goes as multipart with the other parameters in
// the query string: OAuth leaves a multipart body out of the signature, so
// that keeps everything but the file signed.
async function tt(
  c: Creds,
  method: "GET" | "POST",
  path: string,
  params: Params,
  what: string,
  upload?: Upload,
): Promise<Record<string, unknown>> {
  const base = `https://${c.domain}/api/2${path}`;
  const authorization = oauthHeader({
    method,
    url: base,
    params,
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
    url = `${base}?${query}`;
    const form = new FormData();
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
  if (!res.ok) return `the link answered ${res.status}`;
  const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!IMAGE_TYPES.includes(type)) {
    return "the link doesn't open an image directly (it may need a sign-in)";
  }
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > MAX_IMAGE_BYTES) return "the image is over 10 MB";
  return { bytes, type, name: `image.${type.split("/")[1].replace("jpeg", "jpg")}` };
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

      // 2. Speakers, in kit order. Never invited from here: Digital sends
      // invitations from TwentyThree when the session is ready.
      let speakersAdded = 0;
      for (const sp of kitSpeakers(kit)) {
        try {
          let email = "";
          if (sp.speakerId && !sp.speakerId.includes("/")) {
            const dir = await db().collection("speakers").doc(sp.speakerId).get();
            email = String((dir.data() as { email?: string } | undefined)?.email ?? "").trim();
          }
          const { title, company } = splitTitle(sp.title);
          const params: Params = { live_id: liveId, name: sp.name, send_invitation_p: "false" };
          if (title) params.title = title;
          if (company) params.company = company;
          if (sp.bio) params.bio = sp.bio;
          if (email) params.email = email;
          const added = await tt(c, "POST", "/live/speaker/add", params, "add speaker");
          speakersAdded++;
          const speakerId = String((added.data as { live_speaker_id?: unknown } | undefined)?.live_speaker_id ?? "");
          if (sp.headshot && speakerId) {
            const img = await fetchImage(sp.headshot);
            if (typeof img === "string") warnings.push(`${sp.name}'s headshot wasn't added: ${img}.`);
            else await tt(c, "POST", "/live/speaker/set-avatar", { live_speaker_id: speakerId }, "set avatar", img);
          }
        } catch (err) {
          logger.warn("twentythree: speaker", err);
          const why = err instanceof TwentyThreeError ? err.detail.slice(0, 160) : "something went wrong";
          warnings.push(`${sp.name} needs checking in TwentyThree (${why}).`);
        }
      }

      // 3. The hero image as the webinar's thumbnail.
      const hero = String(kit.values?.landing?.hero ?? "").trim();
      if (hero) {
        try {
          const img = await fetchImage(hero);
          if (typeof img === "string") warnings.push(`The hero image wasn't added: ${img}.`);
          else await tt(c, "POST", "/live/upload-image", { live_id: liveId, type: "thumbnail" }, "upload image", img);
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
