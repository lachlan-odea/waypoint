// The pure parts of the TwentyThree integration (twentythree.ts): OAuth
// 1.0a signing and turning a webinar kit into what TwentyThree is sent.
// No Firebase and no network, so they can be checked on their own.

// The parts of a stored webinar kit this reads. Keep in step with
// WebinarKit in src/types.ts.
export type KitDoc = {
  wt?: string;
  ft?: string;
  name?: string;
  values?: Record<string, Record<string, unknown>>;
  items?: { kind?: string; list?: string; order?: number; at?: string; d?: Record<string, unknown> }[];
  activity?: unknown[];
};

// ── OAuth 1.0a ─────────────────────────────────────────────────────────

// Percent-encoding as OAuth wants it (RFC 3986): encodeURIComponent leaves
// ! * ' ( ) alone, which the signature must not.
export function rfc3986(s: string): string {
  return encodeURIComponent(s).replace(/[!*'()]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
}

export type SignInput = {
  method: string;
  // Address without a query string.
  url: string;
  // Query or form parameters (never a file).
  params: Record<string, string>;
  consumerKey: string;
  consumerSecret: string;
  token: string;
  tokenSecret: string;
  nonce: string;
  timestamp: number;
  // HMAC-SHA1 of text under key, base64.
  hmac: (key: string, text: string) => string;
};

// The Authorization header for one request, signed with HMAC-SHA1.
export function oauthHeader(i: SignInput): string {
  const oauth: Record<string, string> = {
    oauth_consumer_key: i.consumerKey,
    oauth_nonce: i.nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(i.timestamp),
    oauth_token: i.token,
    oauth_version: "1.0",
  };
  const pairs = Object.entries({ ...i.params, ...oauth })
    .map(([k, v]) => [rfc3986(k), rfc3986(v)] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const base = [i.method.toUpperCase(), rfc3986(i.url), rfc3986(pairs)].join("&");
  const key = `${rfc3986(i.consumerSecret)}&${rfc3986(i.tokenSecret)}`;
  const signed = { ...oauth, oauth_signature: i.hmac(key, base) };
  return (
    "OAuth " +
    Object.entries(signed)
      .map(([k, v]) => `${rfc3986(k)}="${rfc3986(v)}"`)
      .join(", ")
  );
}

// "https://video.example.com/" → "video.example.com".
export function cleanDomain(raw: string): string {
  const d = raw.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase();
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) ? d : "";
}

// ── From the kit ───────────────────────────────────────────────────────

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

const lines = (s: unknown): string[] =>
  typeof s === "string"
    ? s
        .split("\n")
        .map((x) => x.replace(/^\s*[-•*]\s*/, "").trim())
        .filter(Boolean)
    : [];

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch] ?? ch);

// The page's description: the summary, then the "What you'll learn"
// bullets. Simple markup with a line break after each block, so it still
// reads as separate lines if TwentyThree strips the tags.
export function describeWebinar(kit: KitDoc): string {
  const landing = kit.values?.landing ?? {};
  const out: string[] = [];
  for (const para of text(landing.summary).split(/\n\s*\n/)) {
    const p = para.trim();
    if (p) out.push(`<p>${escapeHtml(p).replace(/\n/g, "<br>\n")}</p>`);
  }
  const learn = lines(landing.learn);
  if (learn.length) {
    out.push("<p><strong>What you’ll learn</strong></p>");
    out.push(`<ul>\n${learn.map((l) => `<li>${escapeHtml(l)}</li>`).join("\n")}\n</ul>`);
  }
  return out.join("\n");
}

export type KitSpeaker = { name: string; title: string; bio: string; headshot: string; email: string; speakerId: string };

// The kit's speakers who haven't declined, in the order they're listed.
export function kitSpeakers(kit: KitDoc): KitSpeaker[] {
  return (kit.items ?? [])
    .filter((i) => i.kind === "speaker" && !i.list && i.d && i.d.status !== "Declined" && text(i.d.name))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.at ?? "").localeCompare(String(b.at ?? "")))
    .map((i) => ({
      name: text(i.d!.name),
      title: text(i.d!.title),
      bio: text(i.d!.bio),
      headshot: text(i.d!.headshot),
      email: text(i.d!.email),
      speakerId: text(i.d!.speakerId),
    }));
}

// The kit keeps "Title and organization" as one line. "Head of Product,
// CargoWise" or "Head of Product at CargoWise" splits; anything else is
// all title.
export function splitTitle(raw: string): { title: string; company: string } {
  const s = raw.trim();
  const at = s.match(/^(.+?)\s+(?:at|@)\s+(.+)$/i);
  if (at) return { title: at[1].trim(), company: at[2].trim() };
  const comma = s.lastIndexOf(",");
  if (comma > 0 && comma < s.length - 1) {
    return { title: s.slice(0, comma).trim(), company: s.slice(comma + 1).trim() };
  }
  return { title: s, company: "" };
}

// The webinar's address out of a /live/list answer, whichever field the
// workspace gives it in.
export function pickUrl(data: unknown, domain: string): string {
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  if (!row || typeof row !== "object") return "";
  for (const k of ["absolute_url", "url", "link", "one"]) {
    const v = text(row[k]);
    if (/^https?:\/\//i.test(v)) return v;
    if (v.startsWith("/") && v.length > 1) return `https://${domain}${v}`;
  }
  return "";
}

// ── Results ────────────────────────────────────────────────────────────

export type Metric = { metric: string; value: string; formated: string };

type ResultKey = "pageViews" | "regs" | "atts" | "odViews" | "liveEng" | "odEng" | "qna" | "polls" | "leads";

// Kit field (values.results) → the number or duration found for it.
export type Results = Partial<Record<ResultKey, number | string>>;

const count = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v.replace(/,/g, "")) : NaN;
  return isFinite(n) && n >= 0 ? Math.round(n) : null;
};

// Seconds as the kit writes a duration: "23m 43s".
export function duration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return m ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}

const ON_DEMAND = /on_?demand|recording|vod/;
const RATE = /(^|_)(rate|percent|pct|share|ratio)(_|$)/;
const TIME = /engag|watch|view_?time|play_?time|duration/;

// TwentyThree’s webinar metrics come as a list of named numbers, and the
// names aren’t in its reference. They’re matched here by what they say;
// anything unmatched is left for a person to fill in.
export function resultsFromMetrics(metrics: Metric[]): Results {
  const out: Results = {};
  const rows = metrics
    .map((m) => ({ key: String(m.metric ?? "").toLowerCase(), value: m.value }))
    .filter((m) => m.key);
  const find = (test: (key: string) => boolean) => rows.find((m) => test(m.key) && count(m.value) != null);
  const num = (field: ResultKey, test: (key: string) => boolean) => {
    const m = find(test);
    if (m) out[field] = count(m.value)!;
  };
  const time = (field: ResultKey, test: (key: string) => boolean) => {
    const m = find(test);
    if (!m) return;
    const secs = count(m.value)!;
    if (secs > 0) out[field] = duration(secs);
  };
  const plain = (k: string) => !RATE.test(k) && !TIME.test(k);
  const average = (k: string) => /avg|average|mean/.test(k);
  num("regs", (k) => /regist|sign_?up/.test(k) && plain(k) && !/unregist/.test(k));
  num("atts", (k) => /attend|participant/.test(k) && plain(k) && !ON_DEMAND.test(k));
  num("pageViews", (k) => /visit|page_?view/.test(k) && plain(k));
  num("odViews", (k) => ON_DEMAND.test(k) && /view|play|attend/.test(k) && plain(k));
  num("leads", (k) => /identified/.test(k) && plain(k));
  num("qna", (k) => /question/.test(k) && plain(k));
  num("polls", (k) => /poll/.test(k) && /answer|response|vote/.test(k) && plain(k));
  time("liveEng", (k) => TIME.test(k) && average(k) && !ON_DEMAND.test(k) && !RATE.test(k));
  time("odEng", (k) => TIME.test(k) && average(k) && ON_DEMAND.test(k) && !RATE.test(k));
  return out;
}

// Landing page visits and registrations from the Audience funnel, for
// whichever of the two the metrics didn’t give.
export function resultsFromFunnel(funnel: unknown): Results {
  const f = (funnel && typeof funnel === "object" ? funnel : {}) as Record<string, unknown>;
  const out: Results = {};
  const visits = count(f.visits);
  const conversions = count(f.conversions);
  if (visits) out.pageViews = visits;
  if (conversions) out.regs = conversions;
  return out;
}
