// The app's side of the LinkedIn integration (functions/src/linkedin.ts):
// the calls a super user can make, and the documents the functions write
// for everyone to read. Nothing here ever holds LinkedIn's token; that
// stays in /linkedinPrivate, which the Firestore rules close to clients.

import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, setDoc } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db, firebaseApp, firebaseConfig } from "./firebase";

const REGION = "us-central1";
const functions = getFunctions(firebaseApp, REGION);

// The address LinkedIn sends the admin back to after its consent screen. It
// has to be listed under the LinkedIn app's Auth → OAuth 2.0 settings.
export const LINKEDIN_REDIRECT_URL = `https://${REGION}-${firebaseConfig.projectId}.cloudfunctions.net/linkedinAuthCallback`;

// A LinkedIn page the connected member has a role on.
export type LinkedInOrganization = {
  id: string;
  name: string;
  vanityName?: string;
  roles: string[];
};

// /linkedin/status, written by the functions.
export type LinkedInStatus = {
  connected: boolean;
  // The LinkedIn member Waypoint acts as, and who connected them.
  memberName?: string;
  connectedByName?: string;
  connectedAt?: string;
  // ISO timestamps. Without a refresh date the sign-in simply ends at
  // accessExpiresAt and someone has to reconnect.
  accessExpiresAt?: string | null;
  refreshExpiresAt?: string | null;
  organizations?: LinkedInOrganization[];
  lastSyncAt?: string;
  lastSyncError?: string | null;
  lastSyncPosts?: number;
};

// Which LinkedIn page a Social calendar channel posts to.
export type LinkedInPageMapping = { channel: string; orgId: string };

// Keep in step with DEFAULT_PAGES in functions/src/linkedin.ts.
export const DEFAULT_LINKEDIN_PAGES: LinkedInPageMapping[] = [
  { channel: "CargoWise", orgId: "19179877" },
];

// /linkedin/page-{orgId}: a page's followers and its last 30 days.
export type LinkedInPage = {
  orgId: string;
  name: string;
  channels?: string[];
  followers?: number;
  followerGain30d?: number;
  impressions30d?: number;
  clicks30d?: number;
  reactions30d?: number;
  comments30d?: number;
  shares30d?: number;
  // Interactions over impressions, 0–1.
  engagement30d?: number;
  // One entry per day of the last 30, oldest first.
  daily?: {
    date: string;
    impressions: number;
    clicks: number;
    reactions: number;
    comments: number;
    shares: number;
  }[];
  postCount?: number;
  updatedAt?: string;
};

// /linkedinPostStats/{id}: one post on a page and how it has done so far.
export type LinkedInPostStats = {
  urn: string;
  orgId: string;
  // The Social calendar post it was matched to, if any.
  postId: string | null;
  text: string;
  kind: string;
  publishedAt: string;
  url: string;
  impressions?: number;
  uniqueImpressions?: number | null;
  clicks?: number;
  reactions?: number;
  comments?: number;
  shares?: number;
  // Clicks, reactions, comments and reposts over impressions, 0–1.
  engagement?: number;
  updatedAt?: string;
};

export type LinkedInData = {
  // null until the first read lands (or when the rules refuse it).
  status: LinkedInStatus | null;
  pages: LinkedInPage[];
  mappings: LinkedInPageMapping[];
  stats: LinkedInPostStats[];
  // Why nothing could be read, when that's the case.
  error: string | null;
};

function cleanMappings(raw: unknown): LinkedInPageMapping[] {
  if (!Array.isArray(raw)) return DEFAULT_LINKEDIN_PAGES;
  return raw
    .map((p) => ({
      channel: String((p as LinkedInPageMapping)?.channel ?? "").trim(),
      orgId: String((p as LinkedInPageMapping)?.orgId ?? "").trim(),
    }))
    .filter((p) => p.channel && /^\d+$/.test(p.orgId));
}

// Everything the functions publish about LinkedIn, live. `withStats` is off
// where only the connection matters (Settings), to skip the per-post
// collection.
export function useLinkedIn(withStats: boolean): LinkedInData {
  const [status, setStatus] = useState<LinkedInStatus | null>(null);
  const [pages, setPages] = useState<LinkedInPage[]>([]);
  const [mappings, setMappings] = useState<LinkedInPageMapping[]>(DEFAULT_LINKEDIN_PAGES);
  const [stats, setStats] = useState<LinkedInPostStats[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fail = (err: Error) => {
      console.warn("LinkedIn data not read", err);
      setError(err.message);
    };
    const stops = [
      onSnapshot(
        collection(db, "linkedin"),
        (snap) => {
          setError(null);
          let nextStatus: LinkedInStatus = { connected: false };
          const nextPages: LinkedInPage[] = [];
          snap.docs.forEach((d) => {
            if (d.id === "status") nextStatus = d.data() as LinkedInStatus;
            else if (d.id.startsWith("page-")) nextPages.push(d.data() as LinkedInPage);
          });
          setStatus(nextStatus);
          setPages(nextPages.sort((a, b) => a.name.localeCompare(b.name)));
        },
        fail,
      ),
      onSnapshot(
        doc(db, "settings", "linkedin"),
        (snap) => setMappings(cleanMappings(snap.exists() ? snap.data().pages : undefined)),
        fail,
      ),
    ];
    if (withStats) {
      stops.push(
        onSnapshot(
          collection(db, "linkedinPostStats"),
          (snap) => setStats(snap.docs.map((d) => d.data() as LinkedInPostStats)),
          fail,
        ),
      );
    }
    return () => stops.forEach((stop) => stop());
  }, [withStats]);

  return { status, pages, mappings, stats, error };
}

export async function saveLinkedInPages(pages: LinkedInPageMapping[]): Promise<void> {
  await setDoc(doc(db, "settings", "linkedin"), { pages: cleanMappings(pages) });
}

// The page a channel posts to, if it's linked to one.
export function pageForChannel(
  channel: string,
  mappings: LinkedInPageMapping[],
): LinkedInPageMapping | undefined {
  const key = channel.trim().toLowerCase();
  return mappings.find((m) => m.channel.trim().toLowerCase() === key);
}

// Roles that may post as a page. Keep in step with POSTING_ROLES in
// functions/src/linkedin.ts.
const POSTING_ROLES = [
  "ADMINISTRATOR",
  "CONTENT_ADMINISTRATOR",
  "CONTENT_ADMIN",
  "DIRECT_SPONSORED_CONTENT_POSTER",
];

export function canPostAs(org: LinkedInOrganization | undefined): boolean {
  return !!org && org.roles.some((r) => POSTING_ROLES.includes(r));
}

// LinkedIn only gives a page's statistics to its Super admin.
export function canReadStats(org: LinkedInOrganization | undefined): boolean {
  return !!org && org.roles.includes("ADMINISTRATOR");
}

const ROLE_LABELS: Record<string, string> = {
  ADMINISTRATOR: "Super admin",
  CONTENT_ADMINISTRATOR: "Content admin",
  CONTENT_ADMIN: "Content admin",
  DIRECT_SPONSORED_CONTENT_POSTER: "Sponsored content poster",
  ANALYST: "Analyst",
  CURATOR: "Curator",
  RECRUITING_POSTER: "Recruiting poster",
  LEAD_CAPTURE_ADMINISTRATOR: "Lead capture admin",
  LEAD_GEN_FORMS_MANAGER: "Lead gen forms manager",
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role.toLowerCase().replace(/_/g, " ");
}

// ── Calls ──────────────────────────────────────────────────────────────

// What a failed call should say on screen. The functions already phrase
// their errors for people, so the message is used as it comes.
export function linkedInErrorMessage(err: unknown): string {
  const code = (err as { code?: string } | null)?.code ?? "";
  const message = err instanceof Error ? err.message : String(err);
  // A function that doesn't exist answers 404 with no CORS headers, which
  // the browser hides, so the SDK can only say a bare "internal". The
  // functions' own internal errors always carry a sentence.
  const bareInternal = code === "functions/internal" && /^internal$/i.test(message.trim());
  if (code === "functions/not-found" || code === "functions/unavailable" || bareInternal) {
    return "The LinkedIn functions couldn't be reached. They probably haven't been deployed yet: set the LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET secrets, then run firebase deploy --only functions from this branch.";
  }
  if (code === "functions/deadline-exceeded") {
    return "That took too long to answer. Check the page on LinkedIn before trying again, in case it went through.";
  }
  return err instanceof Error ? err.message : String(err);
}

// Start connecting: returns the address of LinkedIn's consent screen.
export async function linkedInConnectUrl(): Promise<string> {
  const call = httpsCallable<void, { url: string }>(functions, "linkedinConnect");
  return (await call()).data.url;
}

export async function linkedInDisconnect(): Promise<void> {
  await httpsCallable(functions, "linkedinDisconnect")();
}

export type LinkedInSyncSummary = {
  pages: number;
  posts: number;
  linked: number;
  warnings: string[];
};

export async function linkedInSyncNow(): Promise<LinkedInSyncSummary> {
  const call = httpsCallable<void, LinkedInSyncSummary>(functions, "linkedinSyncNow", {
    timeout: 300_000,
  });
  return (await call()).data;
}

export type LinkedInPublishInput = {
  postId: string;
  channel: string;
  // The copy as it should read on LinkedIn.
  text: string;
  // The CTA link: becomes a link card when no file is attached, otherwise
  // it's added to the end of the copy if it isn't in there already.
  link?: string;
  // The post's topic: names a document, and titles a link card whose page
  // doesn't give one.
  title?: string;
  altText?: string;
  file?: File | null;
};

export type LinkedInPublishResult = {
  urn: string;
  url: string;
  publishedAt: string;
  orgId: string;
  pageName: string;
};

export const LINKEDIN_MAX_FILE_BYTES = 20 * 1024 * 1024;
export const LINKEDIN_MAX_COPY_CHARS = 3000;

// What LinkedIn takes as a post's attachment through this route. Video
// needs a multi-part upload that isn't built yet.
export const LINKEDIN_FILE_ACCEPT =
  ".jpg,.jpeg,.png,.gif,.pdf,.ppt,.pptx,.doc,.docx,image/jpeg,image/png,image/gif,application/pdf";

const TYPE_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  pdf: "application/pdf",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

// A file's MIME type, from its extension when the browser didn't supply one
// (Windows often doesn't for Office files). "" when it isn't a kind
// LinkedIn takes here.
export function linkedInFileType(file: File): string {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const known = Object.values(TYPE_BY_EXTENSION);
  if (known.includes(file.type)) return file.type;
  return TYPE_BY_EXTENSION[ext] ?? "";
}

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("The file couldn't be read."));
    reader.onload = () => {
      const url = String(reader.result ?? "");
      resolve(url.slice(url.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

export async function linkedInPublish(input: LinkedInPublishInput): Promise<LinkedInPublishResult> {
  const { file, ...rest } = input;
  const payload = {
    ...rest,
    file: file
      ? { name: file.name, type: linkedInFileType(file), base64: await readBase64(file) }
      : null,
  };
  const call = httpsCallable<typeof payload, LinkedInPublishResult>(functions, "linkedinPublish", {
    timeout: 300_000,
  });
  return (await call(payload)).data;
}

// ── Formatting ─────────────────────────────────────────────────────────

const compact = new Intl.NumberFormat("en-AU", { notation: "compact", maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat("en-AU");

// 1,234 as it is; 12,345 as "12.3K".
export function formatCount(n: number | null | undefined): string {
  if (n === null || n === undefined) return "–";
  return Math.abs(n) >= 10_000 ? compact.format(n) : whole.format(n);
}

// 0.0234 → "2.3%".
export function formatRate(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return "–";
  return `${(rate * 100).toFixed(1)}%`;
}

const KIND_LABELS: Record<string, string> = {
  image: "Image",
  images: "Images",
  video: "Video",
  document: "Document",
  article: "Link",
  poll: "Poll",
  repost: "Repost",
  text: "Text",
};

export function postKindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}
