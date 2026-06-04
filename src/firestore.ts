import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { seedWorkspace } from "./seed";
import type { Designer, Notification, Project, Workspace } from "./types";

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
const projectsCol = () => collection(db, "projects");
const notificationsCol = () => collection(db, "notifications");

// Subscribe to the entire workspace. The callback fires whenever any
// document in any collection changes. We assemble a Workspace shape so the
// rest of the app can stay the same.
export function subscribeWorkspace(
  onChange: (ws: Omit<Workspace, "currentDesignerId">) => void,
  onError: (err: Error) => void,
): () => void {
  let designers: Designer[] = [];
  let projects: Project[] = [];
  let notifications: Notification[] = [];
  let designersReady = false;
  let projectsReady = false;
  let notificationsReady = false;

  function emit() {
    if (!designersReady || !projectsReady || !notificationsReady) return;
    onChange({ designers, projects, notifications });
  }

  const unsubDesigners = onSnapshot(
    designersCol(),
    (snap) => {
      designers = snap.docs.map((d) => overlayAvatar(d.data() as Designer));
      designersReady = true;
      emit();
    },
    onError,
  );

  const unsubProjects = onSnapshot(
    projectsCol(),
    (snap) => {
      projects = snap.docs.map((d) => d.data() as Project);
      projectsReady = true;
      emit();
    },
    onError,
  );

  const unsubNotifications = onSnapshot(
    notificationsCol(),
    (snap) => {
      notifications = snap.docs.map((d) => d.data() as Notification);
      notificationsReady = true;
      emit();
    },
    onError,
  );

  return () => {
    unsubDesigners();
    unsubProjects();
    unsubNotifications();
  };
}

export async function setDesigner(d: Designer): Promise<void> {
  await setDoc(doc(designersCol(), d.id), stripAvatar(d));
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
export async function seedFirestore(ws: Workspace): Promise<void> {
  const batch = writeBatch(db);
  ws.designers.forEach((d) =>
    batch.set(doc(designersCol(), d.id), stripAvatar(d)),
  );
  ws.projects.forEach((p) => batch.set(doc(projectsCol(), p.id), p));
  ws.notifications.forEach((n) =>
    batch.set(doc(notificationsCol(), n.id), n),
  );
  await batch.commit();
}
