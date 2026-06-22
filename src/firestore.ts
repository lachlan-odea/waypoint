import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { seedWorkspace } from "./seed";
import { DEFAULT_WORKSPACE_ID, SEED_WORKSPACES } from "./constants";
import type {
  Designer,
  Notification,
  Project,
  Workspace,
  WorkspaceData,
} from "./types";

// Designer avatar URLs are produced by Vite's asset pipeline and change
// between builds. We don't persist them — we re-overlay the current build's
// hashed URL on top of every designer we read from Firestore.
const seedAvatarById = new Map(
  seedWorkspace.designers.map((d) => [d.id, d.avatar] as const),
);

function overlayAvatar(d: Designer): Designer {
  const fresh = seedAvatarById.get(d.id);
  return fresh ? { ...d, avatar: fresh } : d;
}

const designersCol = () => collection(db, "designers");
const workspacesCol = () => collection(db, "workspaces");
const projectsCol = () => collection(db, "projects");
const notificationsCol = () => collection(db, "notifications");

// Backfill missing workspaceId on legacy docs that predate the multi-
// workspace feature. They all belonged to the original Design workspace.
function withDefaultWorkspace<T extends { workspaceId?: string }>(doc: T): T {
  return doc.workspaceId ? doc : { ...doc, workspaceId: DEFAULT_WORKSPACE_ID };
}

// Subscribe to the entire workspace. The callback fires whenever any
// document in any collection changes. We assemble a WorkspaceData shape so
// the rest of the app can stay the same.
export function subscribeWorkspace(
  onChange: (ws: Omit<WorkspaceData, "currentDesignerId">) => void,
  onError: (err: Error) => void,
): () => void {
  let designers: Designer[] = [];
  let workspaces: Workspace[] = [];
  let projects: Project[] = [];
  let notifications: Notification[] = [];
  let designersReady = false;
  let workspacesReady = false;
  let projectsReady = false;
  let notificationsReady = false;

  function emit() {
    if (
      !designersReady ||
      !workspacesReady ||
      !projectsReady ||
      !notificationsReady
    )
      return;
    onChange({ designers, workspaces, projects, notifications });
  }

  const unsubDesigners = onSnapshot(
    designersCol(),
    (snap) => {
      designers = snap.docs
        .map((d) => overlayAvatar(d.data() as Designer))
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

  return () => {
    unsubDesigners();
    unsubWorkspaces();
    unsubProjects();
    unsubNotifications();
  };
}

export async function setDesigner(d: Designer): Promise<void> {
  await setDoc(doc(designersCol(), d.id), stripAvatar(d));
}

// One-shot read used by the sign-up "claim existing profile" picker. Must be
// callable without auth, so /designers needs public read in firestore.rules.
export async function loadDesignerProfiles(): Promise<Designer[]> {
  const snap = await getDocs(designersCol());
  return snap.docs.map((d) => overlayAvatar(d.data() as Designer));
}

export async function loadDesigner(id: string): Promise<Designer | null> {
  const snap = await getDoc(doc(designersCol(), id));
  if (!snap.exists()) return null;
  return overlayAvatar(snap.data() as Designer);
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

function stripAvatar(d: Designer): Designer {
  // Don't persist Vite-hashed URLs; overlayAvatar re-applies them on read.
  const { avatar: _drop, ...rest } = d;
  return rest as Designer;
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

// Returns true if Firestore is empty (no designers and no projects). Used
// to gate the one-off JSONBin migrator on first launch.
export async function firestoreIsEmpty(): Promise<boolean> {
  const [designers, projects] = await Promise.all([
    getDocs(designersCol()),
    getDocs(projectsCol()),
  ]);
  return designers.empty && projects.empty;
}

// Bulk seed Firestore from a workspace blob. Uses one batch per collection
// (Firestore caps batches at 500 ops; the seed/JSONBin data is much smaller).
export async function seedFirestore(ws: WorkspaceData): Promise<void> {
  const batch = writeBatch(db);
  ws.workspaces.forEach((w) => batch.set(doc(workspacesCol(), w.id), w));
  ws.designers.forEach((d) =>
    batch.set(doc(designersCol(), d.id), stripAvatar(d)),
  );
  ws.projects.forEach((p) => batch.set(doc(projectsCol(), p.id), p));
  ws.notifications.forEach((n) =>
    batch.set(doc(notificationsCol(), n.id), n),
  );
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
