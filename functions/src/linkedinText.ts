// Pure helpers for the LinkedIn integration: the text format the Posts API
// takes, the URNs it hands back, and matching a LinkedIn post to the
// Waypoint post it was written as. No network and no Firestore, so they can
// be exercised on their own.

// LinkedIn's Posts API reads `commentary` as "little text", where these
// characters are markup. Left unescaped they don't fail the request: the
// post is published cut short at the first one, which is far worse.
// https://learn.microsoft.com/linkedin/marketing/community-management/shares/little-text-format
const RESERVED = /[\\|{}@[\]()<>#*_~]/g;

function escapeLittle(text: string): string {
  return text.replace(RESERVED, (c) => `\\${c}`);
}

// A hashtag as people type it: '#' then letters, digits or underscores, at
// the start of the text or after a space or opening punctuation. Anything
// else before the '#' (the path of a URL, say) means it isn't a tag.
const HASHTAG = /(^|[\s(["'“‘])#([\p{L}\p{N}_]+)/gu;

// Plain post copy → little text: every reserved character escaped, and each
// #tag written as LinkedIn's hashtag template so it still links.
export function toLittleText(text: string): string {
  let out = "";
  let last = 0;
  for (const m of text.matchAll(HASHTAG)) {
    const start = (m.index ?? 0) + m[1].length;
    out += escapeLittle(text.slice(last, start));
    out += `{hashtag|\\#|${escapeLittle(m[2])}}`;
    last = start + 1 + m[2].length;
  }
  return out + escapeLittle(text.slice(last));
}

// Little text as the API returns it → the plain text a person would read:
// hashtag templates back to #tag, mentions down to the name, escapes removed.
export function fromLittleText(little: string): string {
  return little
    .replace(/\{hashtag\|\\?[#＃]\|((?:\\.|[^}\\])*)\}/g, (_m, tag: string) => `#${tag}`)
    .replace(/@\[((?:\\.|[^\]\\])*)\]\(urn:li:[^)]*\)/g, (_m, name: string) => name)
    .replace(/\\(.)/g, "$1");
}

// For comparing copy across the two systems: case, whitespace and the
// punctuation LinkedIn or Word tends to rewrite (curly quotes, dashes) are
// flattened.
export function normaliseForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’“”"'`]/g, "")
    .replace(/[–—-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type PostUrn = { urn: string; type: "share" | "ugcPost"; id: string };

// The share or ugcPost URN inside a string, such as a pasted post link
// ("…/feed/update/urn:li:share:123/"). Links in the "…-activity-123-abcd"
// form carry an activity id instead, which the statistics API doesn't take,
// so those return null.
export function postUrnIn(text: string | undefined): PostUrn | null {
  if (!text) return null;
  let decoded = text;
  try {
    decoded = decodeURIComponent(text);
  } catch {
    // Not valid percent-encoding: search it as it is.
  }
  const m = /urn:li:(share|ugcPost):(\d+)/.exec(decoded);
  return m ? { urn: m[0], type: m[1] as PostUrn["type"], id: m[2] } : null;
}

export function postUrlFor(urn: string): string {
  return `https://www.linkedin.com/feed/update/${urn}/`;
}

// Firestore document id for a post's statistics: "share-123", "ugcPost-456".
export function statsDocId(urn: string): string {
  const p = postUrnIn(urn);
  return p ? `${p.type}-${p.id}` : urn.replace(/[^A-Za-z0-9_-]+/g, "-");
}

export type MatchablePost = {
  id: string;
  copy: string;
  // YYYY-MM-DD, or "" when unscheduled.
  date: string;
};

const MATCH_PREFIX = 60;
const MATCH_WINDOW_DAYS = 5;
const DAY_MS = 86_400_000;

// The one Waypoint post a LinkedIn post was written as, judged by its
// opening words and its date, or null when none or several fit. Both sides
// need a reasonable amount of text, so two short posts aren't paired up on
// a shared greeting.
export function matchByText(
  commentary: string,
  publishedAtMs: number,
  candidates: MatchablePost[],
): string | null {
  const want = normaliseForMatch(commentary).slice(0, MATCH_PREFIX);
  if (want.length < 30) return null;
  const hits = candidates.filter((c) => {
    if (!c.date) return false;
    const have = normaliseForMatch(c.copy).slice(0, MATCH_PREFIX);
    if (have.length < 30) return false;
    const n = Math.min(want.length, have.length);
    if (want.slice(0, n) !== have.slice(0, n)) return false;
    const planned = Date.parse(`${c.date}T12:00:00Z`);
    return Math.abs(planned - publishedAtMs) <= MATCH_WINDOW_DAYS * DAY_MS;
  });
  return hits.length === 1 ? hits[0].id : null;
}

// og:title, og:description and og:image from a page's HTML, with <title>
// as the fallback. LinkedIn's API doesn't read the page behind a link, so
// an article post has to carry these itself.
export type LinkPreview = { title: string; description: string; image: string };

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

function metaContent(html: string, key: string): string {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const name = /\b(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (name?.toLowerCase() !== key) continue;
    const content = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    if (content) return decodeEntities(content[1] ?? content[2] ?? "");
  }
  return "";
}

export function parseLinkPreview(html: string, pageUrl: string): LinkPreview {
  const head = html.slice(0, 400_000);
  const title =
    metaContent(head, "og:title") ||
    metaContent(head, "twitter:title") ||
    decodeEntities(/<title[^>]*>([^<]*)<\/title>/i.exec(head)?.[1] ?? "");
  const description =
    metaContent(head, "og:description") || metaContent(head, "description");
  let image = metaContent(head, "og:image") || metaContent(head, "twitter:image");
  if (image) {
    try {
      image = new URL(image, pageUrl).toString();
    } catch {
      image = "";
    }
  }
  return { title, description, image };
}

// Whether a URL is one the functions may fetch: http(s) to a named public
// host. Refuses IP literals and the names that resolve inside a network, so
// a post's link can't be used to reach something private.
export function isFetchableUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  const host = u.hostname.toLowerCase();
  if (!host.includes(".")) return false;
  if (/^[\d.]+$/.test(host) || host.includes(":") || host.startsWith("[")) return false;
  if (/(^|\.)(localhost|internal|local|lan|home|corp)$/.test(host)) return false;
  return true;
}
