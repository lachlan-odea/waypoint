// The app's side of the TwentyThree integration (functions/src/
// twentythree.ts): asking the function to create a webinar's registration
// page from its kit. TwentyThree's keys never reach the browser.

import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseApp } from "./firebase";

const functions = getFunctions(firebaseApp, "us-central1");

export type TwentyThreeCreateInput = {
  campaignId: string;
  // Local date and time in `timezone`, "YYYY-MM-DDTHH:MM".
  startTime: string;
  // IANA zone, e.g. "Australia/Sydney".
  timezone: string;
  durationMinutes: number;
};

export type TwentyThreeCreateResult = {
  liveId: string;
  url: string;
  speakersAdded: number;
  // Things that didn't carry over and need doing by hand in TwentyThree.
  warnings: string[];
};

export async function twentyThreeCreateWebinar(input: TwentyThreeCreateInput): Promise<TwentyThreeCreateResult> {
  const call = httpsCallable<TwentyThreeCreateInput, TwentyThreeCreateResult>(functions, "twentyThreeCreateWebinar", {
    timeout: 300_000,
  });
  return (await call(input)).data;
}

export type TwentyThreeLinkResult = { liveId: string; url: string; name: string };

// Link the kit to a webinar that already exists in TwentyThree, from its
// link or id. Nothing is changed in TwentyThree.
export async function twentyThreeLinkWebinar(campaignId: string, link: string): Promise<TwentyThreeLinkResult> {
  const call = httpsCallable<{ campaignId: string; link: string }, TwentyThreeLinkResult>(functions, "twentyThreeLinkWebinar", {
    timeout: 120_000,
  });
  return (await call({ campaignId, link })).data;
}

export type TwentyThreeSpeakersResult ={ speakersAdded: number; headshotsAdded: number; warnings: string[] };

// Send the kit’s speakers to a webinar that already exists in TwentyThree,
// skipping anyone it already lists.
export async function twentyThreeAddSpeakers(campaignId: string): Promise<TwentyThreeSpeakersResult> {
  const call = httpsCallable<{ campaignId: string }, TwentyThreeSpeakersResult>(functions, "twentyThreeAddSpeakers", {
    timeout: 300_000,
  });
  return (await call({ campaignId })).data;
}

export type TwentyThreeResults = { filled: string[]; missing: string[] };

// Fill the kit’s Performance numbers from TwentyThree. The function
// writes them onto the kit; this says which it found and which it didn’t.
export async function twentyThreePullResults(campaignId: string): Promise<TwentyThreeResults> {
  const call = httpsCallable<{ campaignId: string }, TwentyThreeResults>(functions, "twentyThreePullResults", {
    timeout: 120_000,
  });
  return (await call({ campaignId })).data;
}

export function twentyThreeErrorMessage(err: unknown): string {
  const code = (err as { code?: string } | null)?.code ?? "";
  const message = err instanceof Error ? err.message : String(err);
  // A function that doesn't exist answers 404 with no CORS headers, which
  // the browser hides, so the SDK can only say a bare "internal".
  const bareInternal = code === "functions/internal" && /^internal$/i.test(message.trim());
  if (code === "functions/not-found" || code === "functions/unavailable" || bareInternal) {
    return "The TwentyThree function couldn't be reached. It probably hasn't been deployed yet: set the TWENTYTHREE_* secrets, then run firebase deploy --only functions.";
  }
  if (code === "functions/deadline-exceeded") {
    return "That took too long to answer. Check TwentyThree before trying again, in case the webinar was created.";
  }
  return message;
}

// The kit keeps duration as words ("15–20 minutes", "45–60 min", "1 hour").
// TwentyThree wants minutes; a range books the longer end.
export function durationMinutes(text: string): number | null {
  const nums = (text.match(/\d+(?:\.\d+)?/g) ?? []).map(Number).filter((n) => isFinite(n) && n > 0);
  if (!nums.length) return null;
  const top = Math.max(...nums);
  return Math.round(/\bh(ou)?rs?\b|\bh\b/i.test(text) && top <= 10 ? top * 60 : top);
}

// Time-zone abbreviations people write in the kit → the IANA zone
// TwentyThree wants. A region's standard and daylight names both map to the
// one zone, which knows which applies on the day ("3pm AEST" in November
// is 3pm in Sydney).
const ZONE_ABBR: Record<string, string> = {
  AEST: "Australia/Sydney", AEDT: "Australia/Sydney", AET: "Australia/Sydney",
  ACST: "Australia/Adelaide", ACDT: "Australia/Adelaide",
  AWST: "Australia/Perth",
  NZST: "Pacific/Auckland", NZDT: "Pacific/Auckland",
  SGT: "Asia/Singapore", HKT: "Asia/Hong_Kong", JST: "Asia/Tokyo", IST: "Asia/Kolkata", GST: "Asia/Dubai",
  GMT: "Europe/London", BST: "Europe/London", UK: "Europe/London",
  CET: "Europe/Berlin", CEST: "Europe/Berlin",
  ET: "America/New_York", EST: "America/New_York", EDT: "America/New_York",
  CT: "America/Chicago", CST: "America/Chicago", CDT: "America/Chicago",
  MT: "America/Denver", MST: "America/Denver", MDT: "America/Denver",
  PT: "America/Los_Angeles", PST: "America/Los_Angeles", PDT: "America/Los_Angeles",
  UTC: "UTC",
};

// The start time and zone out of the kit's "Date and time" line, e.g.
// "30 November 2026 - 3pm AEST" or "Session 1: APAC – 2:00pm AEST". With
// several sessions, the first line that has a time wins.
export function parseSession(text: string): { time: string; zone: string } {
  for (const line of text.split("\n")) {
    // "3pm", "2:00 pm", "10.30am", or a 24-hour "15:00".
    const m = line.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*([ap])\.?m\b\.?/i) ?? line.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    if (!m) continue;
    let hour = Number(m[1]);
    const minute = Number(m[2] ?? 0);
    const half = m[3]?.toLowerCase();
    if (half && (hour < 1 || hour > 12)) continue;
    if (half === "p" && hour < 12) hour += 12;
    if (half === "a" && hour === 12) hour = 0;
    if (hour > 23 || minute > 59) continue;
    const after = line.slice((m.index ?? 0) + m[0].length);
    const abbr = (after.match(/\b[A-Z]{2,4}\b/g) ?? []).find((a) => ZONE_ABBR[a]) ?? (line.match(/\b[A-Z]{2,4}\b/g) ?? []).find((a) => ZONE_ABBR[a]);
    return {
      time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
      zone: abbr ? ZONE_ABBR[abbr] : "",
    };
  }
  return { time: "", zone: "" };
}
