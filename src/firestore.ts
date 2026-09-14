import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getDocsFromServer,
  onSnapshot,
  query,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { DEFAULT_WORKSPACE_ID, SEED_HUBS, SEED_WORKSPACES } from "./constants";
import type {
  DeskItem,
  Designer,
  Hub,
  Notification,
  Project,
  SocialPost,
  Workspace,
  WorkspaceData,
} from "./types";

const designersCol = () => collection(db, "designers");
const workspacesCol = () => collection(db, "workspaces");
const projectsCol = () => collection(db, "projects");
const notificationsCol = () => collection(db, "notifications");
const deskItemsCol = () => collection(db, "deskItems");
const hubsCol = () => collection(db, "hubs");
const socialPostsCol = () => collection(db, "socialPosts");

// Backfill missing workspaceId on legacy docs that predate the multi-
// workspace feature. They all belonged to the original Design workspace.
function withDefaultWorkspace<T extends { workspaceId?: string }>(doc: T): T {
  return doc.workspaceId ? doc : { ...doc, workspaceId: DEFAULT_WORKSPACE_ID };
}

// Subscribe to the entire workspace. The callback fires whenever any
// document in any collection changes. We assemble a WorkspaceData shape so
// the rest of the app can stay the same.
export function subscribeWorkspace(
  onChange: (ws: WorkspaceData) => void,
  onError: (err: Error) => void,
): () => void {
  let designers: Designer[] = [];
  let workspaces: Workspace[] = [];
  let projects: Project[] = [];
  let notifications: Notification[] = [];
  let hubs: Hub[] = [];
  let designersReady = false;
  let workspacesReady = false;
  let projectsReady = false;
  let notificationsReady = false;
  let hubsReady = false;

  function emit() {
    if (
      !designersReady ||
      !workspacesReady ||
      !projectsReady ||
      !notificationsReady ||
      !hubsReady
    )
      return;
    onChange({ designers, workspaces, projects, notifications, hubs });
  }

  const unsubDesigners = onSnapshot(
    designersCol(),
    (snap) => {
      designers = snap.docs
        .map((d) => d.data() as Designer)
        .sort((a, b) => a.name.localeCompare(b.name));
      designersReady = true;
      emit();
    },
    onError,
  );

  const unsubWorkspaces = onSnapshot(
    workspacesCol(),
    (snap) => {
      workspaces = snap.docs.map((d) => d.data() as Workspace);
      workspacesReady = true;
      emit();
    },
    onError,
  );

  const unsubProjects = onSnapshot(
    projectsCol(),
    (snap) => {
      projects = snap.docs.map((d) =>
        withDefaultWorkspace(d.data() as Project),
      );
      projectsReady = true;
      emit();
    },
    onError,
  );

  const unsubNotifications = onSnapshot(
    notificationsCol(),
    (snap) => {
      notifications = snap.docs.map((d) =>
        withDefaultWorkspace(d.data() as Notification),
      );
      notificationsReady = true;
      emit();
    },
    onError,
  );

  const unsubHubs = onSnapshot(
    hubsCol(),
    (snap) => {
      hubs = snap.docs
        .map((d) => d.data() as Hub)
        // Alphabetical, so the admin list and the location pickers have a
        // stable order no matter what order the docs come back in. The clock
        // displays re-sort by UTC offset at render time (sortHubsByOffset),
        // which can't be done here — offsets move with daylight saving, and
        // this only runs when a doc changes.
        .sort((a, b) => a.name.localeCompare(b.name));
      hubsReady = true;
      emit();
    },
    onError,
  );

  return () => {
    unsubDesigners();
    unsubWorkspaces();
    unsubProjects();
    unsubNotifications();
    unsubHubs();
  };
}

// One-shot read used by the sign-up "claim existing profile" picker. Must be
// callable without auth, so /designers needs public read in firestore.rules.
export async function loadDesignerProfiles(): Promise<Designer[]> {
  const snap = await getDocs(designersCol());
  return snap.docs.map((d) => d.data() as Designer);
}

export async function loadDesigner(id: string): Promise<Designer | null> {
  const snap = await getDoc(doc(designersCol(), id));
  if (!snap.exists()) return null;
  return snap.data() as Designer;
}

// Create a brand-new Designer document for a freshly signed-up user.
// `id` is the Firebase Auth UID; we pick a friendly color from a palette
// based on the index of the existing designer count.
const COLOR_PALETTE = [
  "#7c5cff", "#ff7a59", "#22b8a6", "#f2c94c", "#3b82f6",
  "#ec4899", "#10b981", "#f97316", "#8b5cf6", "#06b6d4",
];

export async function createDesignerProfile(
  id: string,
  name: string,
  email: string,
): Promise<Designer> {
  const trimmed = name.trim();
  const initials = trimmed
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const existing = await getDocs(designersCol());
  const color = COLOR_PALETTE[existing.size % COLOR_PALETTE.length];
  const designer: Designer = {
    id,
    name: trimmed,
    initials: initials || "??",
    color,
    email,
  };
  await setDoc(doc(designersCol(), id), designer);
  return designer;
}

// Admin-created placeholder designer. Lives in /designers under a
// "placeholder-…" id so the person shows up in pickers / team rosters
// immediately. When the real user signs up, they pick this profile from
// the claim picker on the Login screen and claimDesignerProfile re-keys
// the doc + every reference to their Firebase UID.
export async function createPlaceholderDesigner(
  name: string,
  email?: string,
): Promise<Designer> {
  const trimmed = name.trim();
  const initials = trimmed
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const existing = await getDocs(designersCol());
  const color = COLOR_PALETTE[existing.size % COLOR_PALETTE.length];
  const id = `placeholder-${Date.now()}`;
  const designer: Designer = {
    id,
    name: trimmed,
    initials: initials || "??",
    color,
    ...(email && email.trim() ? { email: email.trim() } : {}),
  };
  await setDoc(doc(designersCol(), id), designer);
  return designer;
}

// Delete a designer doc outright. Their UID may still appear in project
// assigneeIds / reviewerIds / comment likes / notification recipientId
// fields — those become dangling but render harmlessly (avatars fall
// through). For a small team tool the cascade-cleanup tradeoff isn't
// worth it; revisit if/when the team grows.
export async function deleteDesigner(id: string): Promise<void> {
  await deleteDoc(doc(designersCol(), id));
}

// Atomically claim an existing seed designer profile (e.g. d-jess) for a
// freshly signed-up Firebase user. Creates a new designer doc at the user's
// UID with the legacy doc's name/initials/color, rewrites every project's
// assigneeIds and comment likes that reference the old ID, rewrites
// notifications addressed to the old ID, and deletes the legacy doc — all
// in a single batched write so partial failures are impossible.
export async function claimDesignerProfile(
  oldId: string,
  newId: string,
  email: string,
): Promise<Designer> {
  const legacySnap = await getDoc(doc(designersCol(), oldId));
  if (!legacySnap.exists()) {
    throw new Error(`Designer profile "${oldId}" no longer exists.`);
  }
  const legacy = legacySnap.data() as Designer;
  const next: Designer = {
    id: newId,
    name: legacy.name,
    initials: legacy.initials,
    color: legacy.color,
    email,
  };
  const [projectsSnap, notificationsSnap] = await Promise.all([
    getDocs(projectsCol()),
    getDocs(notificationsCol()),
  ]);

  const batch = writeBatch(db);
  batch.set(doc(designersCol(), newId), next);

  projectsSnap.docs.forEach((d) => {
    const p = d.data() as Project;
    let touched = false;
    const nextAssignees = p.assigneeIds.map((id) => {
      if (id === oldId) {
        touched = true;
        return newId;
      }
      return id;
    });
    const nextComments = p.comments.map((c) => {
      const likes = c.likes ?? [];
      if (!likes.includes(oldId)) return c;
      touched = true;
      return {
        ...c,
        likes: likes.map((id) => (id === oldId ? newId : id)),
      };
    });
    if (touched) {
      batch.update(d.ref, {
        assigneeIds: nextAssignees,
        comments: nextComments,
      });
    }
  });

  notificationsSnap.docs.forEach((d) => {
    const n = d.data() as Notification;
    if (n.recipientId === oldId) {
      batch.update(d.ref, { recipientId: newId });
    }
  });

  batch.delete(doc(designersCol(), oldId));
  await batch.commit();
  return next;
}

export async function setProject(p: Project): Promise<void> {
  await setDoc(doc(projectsCol(), p.id), p);
}

export async function deleteProject(id: string): Promise<void> {
  await deleteDoc(doc(projectsCol(), id));
}

export async function setNotification(n: Notification): Promise<void> {
  await setDoc(doc(notificationsCol(), n.id), n);
}

export async function deleteNotification(id: string): Promise<void> {
  await deleteDoc(doc(notificationsCol(), id));
}

export async function deleteNotificationsForRecipient(
  recipientId: string,
): Promise<void> {
  const snap = await getDocs(notificationsCol());
  const targets = snap.docs.filter(
    (d) => (d.data() as Notification).recipientId === recipientId,
  );
  if (targets.length === 0) return;
  const batch = writeBatch(db);
  targets.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

// Persist a user-supplied headshot URL onto their designer doc. Pass an
// empty string to clear it.
export async function setDesignerPhotoUrl(
  designerId: string,
  photoUrl: string,
): Promise<void> {
  const trimmed = photoUrl.trim();
  await setDoc(
    doc(designersCol(), designerId),
    { photoUrl: trimmed },
    { merge: true },
  );
}

// Flip the super-user flag on a designer doc. Gated to existing super users
// at the UI layer; the Firestore rules currently allow any signed-in user to
// write to a designer doc, so this is trust-based and would need a stricter
// rule if we ever opened the workspace to untrusted users.
export async function setDesignerSuperUser(
  designerId: string,
  isSuperUser: boolean,
): Promise<void> {
  await setDoc(
    doc(designersCol(), designerId),
    { isSuperUser },
    { merge: true },
  );
}

// Flip the reviewer flag on a designer doc. Same trust model as
// setDesignerSuperUser — gated by the UI, not Firestore rules.
export async function setDesignerReviewer(
  designerId: string,
  isReviewer: boolean,
): Promise<void> {
  await setDoc(
    doc(designersCol(), designerId),
    { isReviewer },
    { merge: true },
  );
}

// Admin write: update a workspace's member list.
export async function setWorkspaceMembers(
  workspaceId: string,
  memberIds: string[],
): Promise<void> {
  await setDoc(
    doc(workspacesCol(), workspaceId),
    { memberIds },
    { merge: true },
  );
}

// ── My Desk checklist ──────────────────────────────────────────────────
// Deliberately a separate subscription from subscribeWorkspace: desk items
// are private to one person, so we query by ownerId rather than pulling the
// whole collection down and filtering client-side. Kept out of
// WorkspaceData so the board isn't waiting on it to render.

export function subscribeDeskItems(
  ownerId: string,
  onChange: (items: DeskItem[]) => void,
  onError: (err: Error) => void,
): () => void {
  return onSnapshot(
    query(deskItemsCol(), where("ownerId", "==", ownerId)),
    (snap) => onChange(snap.docs.map((d) => d.data() as DeskItem)),
    onError,
  );
}

export async function setDeskItem(item: DeskItem): Promise<void> {
  await setDoc(doc(deskItemsCol(), item.id), item);
}

export async function deleteDeskItem(id: string): Promise<void> {
  await deleteDoc(doc(deskItemsCol(), id));
}

// Batched multi-write used by the daily housekeeping in MyDesk (rolling
// yesterday's leftovers forward, promoting due reminders, sweeping old
// completed items). One commit so a half-applied rollover is impossible.
export async function applyDeskItemChanges(
  updated: DeskItem[],
  removedIds: string[],
): Promise<void> {
  if (updated.length === 0 && removedIds.length === 0) return;
  const batch = writeBatch(db);
  updated.forEach((item) => batch.set(doc(deskItemsCol(), item.id), item));
  removedIds.forEach((id) => batch.delete(doc(deskItemsCol(), id)));
  await batch.commit();
}

// ── Locations & time zones ─────────────────────────────────────────────
// Shared config, not per-user: a hub added here shows up in everybody's
// sidebar. Writes are gated to super users at the UI layer, same trust model
// as setDesignerSuperUser.

export async function setHub(hub: Hub): Promise<void> {
  await setDoc(doc(hubsCol(), hub.id), hub);
}

// Removing a hub leaves `hubId` dangling on any designer who was in it. They
// render as unassigned, which is the same state as never having been given
// one, so there's nothing to repair — but clear the references anyway so the
// team list doesn't quietly disagree with the location list.
export async function deleteHub(hubId: string): Promise<void> {
  const designersSnap = await getDocs(designersCol());
  const affected = designersSnap.docs.filter(
    (d) => (d.data() as Designer).hubId === hubId,
  );
  const batch = writeBatch(db);
  batch.delete(doc(hubsCol(), hubId));
  affected.forEach((d) => batch.update(d.ref, { hubId: "" }));
  await batch.commit();
}

// Assign a designer to a hub. Pass an empty string to unassign.
export async function setDesignerHub(
  designerId: string,
  hubId: string,
): Promise<void> {
  await setDoc(doc(designersCol(), designerId), { hubId }, { merge: true });
}

// Same idempotent-seed pattern as seedWorkspacesIfMissing: creates Sydney and
// Chicago on first boot and never touches them again, so an admin's later
// edits (or deletions) stick.
export async function seedHubsIfMissing(): Promise<void> {
  const existing = await getDocs(hubsCol());
  // Only seed a genuinely empty collection. Checking for individual missing
  // ids would resurrect a hub an admin deliberately deleted.
  if (!existing.empty) return;
  const batch = writeBatch(db);
  SEED_HUBS.forEach((h) => batch.set(doc(hubsCol(), h.id), { ...h }));
  await batch.commit();
}

// ── Social calendar ────────────────────────────────────────────────────
// Its own subscription rather than part of subscribeWorkspace: the posts are
// only needed on the Social calendar view, and they carry full post copy, so
// there's no reason to make the board wait on them.

export function subscribeSocialPosts(
  onChange: (posts: SocialPost[]) => void,
  onError: (err: Error) => void,
): () => void {
  return onSnapshot(
    socialPostsCol(),
    (snap) => onChange(snap.docs.map((d) => d.data() as SocialPost)),
    onError,
  );
}

export async function setSocialPost(post: SocialPost): Promise<void> {
  await setDoc(doc(socialPostsCol(), post.id), post);
}

export async function deleteSocialPost(id: string): Promise<void> {
  await deleteDoc(doc(socialPostsCol(), id));
}

// Load the marketing team's 2026 calendar (src/data/socialPostsSeed.json,
// generated from their spreadsheet by scripts/social-calendar-xlsx-to-seed.py)
// into an empty /socialPosts collection. Same only-when-empty rule as the
// hubs seed, so deleting an imported post sticks.
//
// Two differences from the other seeds. The check goes to the server rather
// than the local cache: a first boot while offline would see an empty cache,
// queue 200 writes, and on reconnect overwrite whatever teammates had edited
// in the meantime — failing (and logging) offline is the safer outcome. And
// the seed is a dynamic import, so the ~200 KB of post copy only ever
// downloads on the one visit that actually needs it.
export async function seedSocialPostsIfMissing(): Promise<number> {
  const existing = await getDocsFromServer(socialPostsCol());
  if (!existing.empty) return 0;
  const { default: seed } = await import("./data/socialPostsSeed.json");
  const createdAt = new Date().toISOString();
  // Firestore caps a batch at 500 writes.
  const CHUNK = 400;
  for (let i = 0; i < seed.length; i += CHUNK) {
    const batch = writeBatch(db);
    seed.slice(i, i + CHUNK).forEach((p) => {
      const post: SocialPost = {
        ...(p as Omit<SocialPost, "createdAt" | "source">),
        createdAt,
        source: "import",
      };
      batch.set(doc(socialPostsCol(), post.id), post);
    });
    await batch.commit();
  }
  return seed.length;
}

// Ensures the seed workspaces (Design / Video / Marketing) exist in the
// /workspaces collection. Safe to call on every boot — only creates docs
// that aren't already there. Lets the multi-workspace feature roll out
// onto an existing Firestore project that predates it.
export async function seedWorkspacesIfMissing(): Promise<void> {
  const existing = await getDocs(workspacesCol());
  const existingIds = new Set(existing.docs.map((d) => d.id));
  const missing = SEED_WORKSPACES.filter((w) => !existingIds.has(w.id));
  if (missing.length === 0) return;
  const batch = writeBatch(db);
  missing.forEach((w) =>
    batch.set(doc(workspacesCol(), w.id), { id: w.id, name: w.name }),
  );
  await batch.commit();
}
