// The app's side of the Basecamp connector (functions/src/basecamp.ts): the
// calls a super user can make, and the documents the functions write for
// everyone to read. Nothing here ever holds Basecamp's token; that stays in
// /basecampPrivate, which the Firestore rules close to clients.

import { useEffect, useState } from "react";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db, firebaseApp, firebaseConfig } from "./firebase";

const REGION = "us-central1";
const functions = getFunctions(firebaseApp, REGION);

// The address Basecamp sends the super user back to after its consent
// screen. It has to be the redirect URI of the integration registered at
// launchpad.37signals.com/integrations.
export const BASECAMP_REDIRECT_URL = `https://${REGION}-${firebaseConfig.projectId}.cloudfunctions.net/basecampAuthCallback`;

// /basecamp/status, written by the functions.
export type BasecampStatus = {
  connected: boolean;
  // The Basecamp person Waypoint acts as, and who connected them.
  identityName?: string;
  accountId?: string;
  accountName?: string;
  accounts?: { id: string; name: string }[];
  connectedByName?: string;
  connectedAt?: string;
  lastSyncAt?: string;
  lastSyncError?: string | null;
  lastSyncProjects?: number;
};

// /basecampProjects/{id}: one project in the Basecamp account, as of the
// last sync.
export type BasecampProject = {
  id: string;
  name: string;
  // Basecamp's rich-text description, flattened to plain text.
  description: string;
  status: "active" | "archived" | string;
  startDate?: string;
  endDate?: string;
  createdAt: string;
  updatedAt: string;
  // Where the project opens in Basecamp.
  appUrl: string;
  // The Waypoint project it was created from, when there is one.
  waypointProjectId?: string | null;
};

// /basecampLinks/{waypointProjectId}: a Waypoint project switched on for
// Basecamp, and how sending it there is going.
export type BasecampLink = {
  state: "creating" | "failed" | "linked";
  basecampId?: string;
  appUrl?: string;
  // What Basecamp's copy looked like at the last sync. A status of
  // "missing" means the connected account can no longer see it (trashed or
  // deleted there).
  remote?: { status?: string };
  // Assignees who couldn't be added to the Basecamp project because nobody
  // in the Basecamp account matches them, each as "Name (why not)".
  peopleMissing?: string[];
  error?: string | null;
  syncedAt?: string;
};

export type BasecampData = {
  // null until the first read lands (or when the rules refuse it).
  status: BasecampStatus | null;
  // Why nothing could be read, when that's the case.
  error: string | null;
};

// Whether Basecamp is connected, and how the last sync went, live.
export function useBasecampStatus(): BasecampData {
  const [status, setStatus] = useState<BasecampStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(
    () =>
      onSnapshot(
        doc(db, "basecamp", "status"),
        (snap) => {
          setError(null);
          setStatus(snap.exists() ? (snap.data() as BasecampStatus) : { connected: false });
        },
        (err) => {
          console.warn("Basecamp status not read", err);
          setError(err.message);
        },
      ),
    [],
  );
  return { status, error };
}

// Every mirrored Basecamp project, live. null until the first read lands.
export function useBasecampProjects(): { projects: BasecampProject[] | null; error: string | null } {
  const [projects, setProjects] = useState<BasecampProject[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(
    () =>
      onSnapshot(
        collection(db, "basecampProjects"),
        (snap) => {
          setError(null);
          setProjects(snap.docs.map((d) => d.data() as BasecampProject));
        },
        (err) => {
          console.warn("Basecamp projects not read", err);
          setError(err.message);
        },
      ),
    [],
  );
  return { projects, error };
}

// How sending one Waypoint project to Basecamp is going: undefined while
// loading, null when it has never been sent.
export function useBasecampLink(projectId: string): BasecampLink | null | undefined {
  // Keyed by project so a link read for one project is never shown on the
  // next one opened.
  const [read, setRead] = useState<{ projectId: string; link: BasecampLink | null } | null>(null);
  useEffect(
    () =>
      onSnapshot(
        doc(db, "basecampLinks", projectId),
        (snap) => setRead({ projectId, link: snap.exists() ? (snap.data() as BasecampLink) : null }),
        (err) => {
          console.warn("Basecamp link not read", err);
          setRead({ projectId, link: null });
        },
      ),
    [projectId],
  );
  return read?.projectId === projectId ? read.link : undefined;
}

// ── Calls ──────────────────────────────────────────────────────────────

// What a failed call should say on screen. The functions already phrase
// their errors for people, so the message is used as it comes.
export function basecampErrorMessage(err: unknown): string {
  const code = (err as { code?: string } | null)?.code ?? "";
  const message = err instanceof Error ? err.message : String(err);
  // A function that doesn't exist answers 404 with no CORS headers, which
  // the browser hides, so the SDK can only say a bare "internal". The
  // functions' own internal errors always carry a sentence.
  const bareInternal = code === "functions/internal" && /^internal$/i.test(message.trim());
  if (code === "functions/not-found" || code === "functions/unavailable" || bareInternal) {
    return "The Basecamp functions couldn't be reached. They probably haven't been deployed yet: set the BASECAMP_CLIENT_ID and BASECAMP_CLIENT_SECRET secrets, then run firebase deploy --only functions from this branch.";
  }
  if (code === "functions/deadline-exceeded") {
    return "That took too long to answer. Give it a minute, then check the Basecamp view before trying again.";
  }
  return message;
}

// Start connecting: returns the address of Basecamp's consent screen.
export async function basecampConnectUrl(): Promise<string> {
  const call = httpsCallable<void, { url: string }>(functions, "basecampConnect");
  return (await call()).data.url;
}

export async function basecampDisconnect(): Promise<void> {
  await httpsCallable(functions, "basecampDisconnect")();
}

export type BasecampSyncSummary = {
  // Basecamp projects now in the Basecamp view.
  projects: number;
  // Waypoint projects created in, or re-sent to, Basecamp.
  pushed: number;
  // Waypoint projects whose name or overview was updated from Basecamp.
  pulled: number;
  warnings: string[];
};

export async function basecampSyncNow(): Promise<BasecampSyncSummary> {
  const call = httpsCallable<void, BasecampSyncSummary>(functions, "basecampSyncNow", {
    timeout: 300_000,
  });
  return (await call()).data;
}

// "Read 42 projects from Basecamp. 1 sent there." for the note after a
// manual sync.
export function syncSummaryText(r: BasecampSyncSummary): string {
  return [
    `Read ${r.projects} project${r.projects === 1 ? "" : "s"} from Basecamp.`,
    r.pushed > 0 ? `${r.pushed} Waypoint project${r.pushed === 1 ? "" : "s"} sent there.` : "",
    r.pulled > 0 ? `${r.pulled} updated here from Basecamp.` : "",
    ...r.warnings,
  ]
    .filter(Boolean)
    .join(" ");
}

export function formatSyncTime(iso: string | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
