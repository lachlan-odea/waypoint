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

export type TwentyThreeSpeakersResult = { speakersAdded: number; warnings: string[] };

// Send the kit’s speakers to a webinar that already exists in TwentyThree,
// skipping anyone it already lists.
export async function twentyThreeAddSpeakers(campaignId: string): Promise<TwentyThreeSpeakersResult> {
  const call = httpsCallable<{ campaignId: string }, TwentyThreeSpeakersResult>(functions, "twentyThreeAddSpeakers", {
    timeout: 300_000,
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
