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
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { DEFAULT_WORKSPACE_ID, SEED_HUBS, SEED_WORKSPACES } from "./constants";
import type {
  ActivityShare,
  BigRock,
  Campaign,
  Designer,
  DeskItem,
  EventItinerary,
  Hub,
  ItineraryAddition,
  ItineraryTravel,
  LiveEventBlackout,
  LiveEventIntake,
  LiveEventRequest,
  MarketingEvent,
  Notification,
  Project,
  PublicBlackout,
  SocialConfig,
  SocialPost,
  Speaker,
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
const socialConfigDoc = () => doc(collection(db, "socialConfig"), "default");
const campaignsCol = () => collection(db, "campaigns");
const eventsCol = () => collection(db, "events");
const speakersCol = () => collection(db, "speakers");
const bigRocksCol = () => collection(db, "bigRocks");

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
// Steps of the CargoWise palette, each dark enough to carry white text.
const COLOR_PALETTE = [
  "#371ee1", "#6a5cd8", "#244349", "#a3294d", "#b4501f",
  "#2f6fb0", "#1f7a4d", "#1d1765", "#6b7a12", "#c2335f",
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
      // Stamped as the claimer so the membership emails don't tell them
      // they've been "added" to every project they already had.
      batch.update(d.ref, {
        assigneeIds: nextAssignees,
        comments: nextComments,
        updatedBy: newId,
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

// Every full save of a project, campaign or event carries the signed-in
// user's id as `updatedBy`, so the membership-email Cloud Functions can
// leave out whoever made the change (see UpdatedBy in types.ts).
function stamped<T extends object>(data: T): T & { updatedBy?: string } {
  const uid = auth.currentUser?.uid;
  return uid ? { ...data, updatedBy: uid } : data;
}

export async function setProject(p: Project): Promise<void> {
  await setDoc(doc(projectsCol(), p.id), stamped(p));
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

// Whether being added to a project, campaign, webinar or event emails this
// person. Read by the Cloud Functions in functions/src/index.ts.
export async function setDesignerEmailAlerts(
  designerId: string,
  on: boolean,
): Promise<void> {
  await setDoc(
    doc(designersCol(), designerId),
    { emailAlerts: on },
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

// Just the posts linked to one project, for the project's detail window.
// A separate query rather than a filter over the full calendar so opening
// a project doesn't pull every post's copy down with it.
export function subscribeSocialPostsForProject(
  projectId: string,
  onChange: (posts: SocialPost[]) => void,
  onError: (err: Error) => void,
): () => void {
  return onSnapshot(
    query(socialPostsCol(), where("projectId", "==", projectId)),
    (snap) => onChange(snap.docs.map((d) => d.data() as SocialPost)),
    onError,
  );
}

export async function setSocialPost(post: SocialPost): Promise<void> {
  await setDoc(doc(socialPostsCol(), post.id), post);
}

// Move a post to another day, touching nothing else on it. Used to keep a
// campaign milestone's post on the milestone's date. Rejects if the post
// has been deleted.
export async function moveSocialPost(id: string, date: string): Promise<void> {
  await updateDoc(doc(socialPostsCol(), id), { date, month: date.slice(0, 7) });
}

export async function deleteSocialPost(id: string): Promise<void> {
  await deleteDoc(doc(socialPostsCol(), id));
}

// ── Marketing campaigns ────────────────────────────────────────────────
// Subscribed by the Social calendar view alongside the posts. Small
// collection (a few dozen a year), so the whole thing comes down at once.

export function subscribeCampaigns(
  onChange: (campaigns: Campaign[]) => void,
  onError: (err: Error) => void,
): () => void {
  return onSnapshot(
    campaignsCol(),
    (snap) => onChange(snap.docs.map((d) => d.data() as Campaign)),
    onError,
  );
}

// Campaigns a project contributes to, for the project's detail window.
// array-contains on a single field needs no composite index.
export function subscribeCampaignsForProject(
  projectId: string,
  onChange: (campaigns: Campaign[]) => void,
  onError: (err: Error) => void,
): () => void {
  return onSnapshot(
    query(campaignsCol(), where("projectIds", "array-contains", projectId)),
    (snap) => onChange(snap.docs.map((d) => d.data() as Campaign)),
    onError,
  );
}

export async function setCampaign(campaign: Campaign): Promise<void> {
  await setDoc(doc(campaignsCol(), campaign.id), stamped(campaign));
}

// ── Campaign pages ─────────────────────────────────────────────────────
// The public copy of a campaign behind its SharePoint page, at
// /campaignPages/{shareToken}. Anyone with the exact token can read it (the
// page isn't signed in); the rules refuse listing, so tokens can't be found.
// `json` is the page's data, serialised by campaignPageData in
// campaignExport.ts, so the page reads one string field rather than
// Firestore's typed values.

const campaignPagesCol = () => collection(db, "campaignPages");

export async function setCampaignPage(shareToken: string, json: string): Promise<void> {
  await setDoc(doc(campaignPagesCol(), shareToken), { json });
}

export async function deleteCampaignPage(shareToken: string): Promise<void> {
  await deleteDoc(doc(campaignPagesCol(), shareToken));
}

// Just the token, so it can be written from an open editor without saving
// (or overwriting) whatever else is mid-edit there.
export async function setCampaignShareToken(
  id: string,
  shareToken: string,
): Promise<void> {
  await updateDoc(doc(campaignsCol(), id), { shareToken });
}

// Same reasoning as the token: written from the open editor, on its own.
export async function setCampaignSharePointUrl(
  id: string,
  sharePointUrl: string,
): Promise<void> {
  await updateDoc(doc(campaignsCol(), id), { sharePointUrl });
}

export async function deleteCampaign(id: string): Promise<void> {
  await deleteDoc(doc(campaignsCol(), id));
}

// ── Events ─────────────────────────────────────────────────────────────
// Trade shows and conferences, for the Events page. Its own subscription,
// like campaigns: a hundred or so documents a year, all needed at once.

export function subscribeEvents(
  onChange: (events: MarketingEvent[]) => void,
  onError: (err: Error) => void,
): () => void {
  return onSnapshot(
    eventsCol(),
    (snap) => onChange(snap.docs.map((d) => d.data() as MarketingEvent)),
    onError,
  );
}

export async function setEvent(event: MarketingEvent): Promise<void> {
  await setDoc(doc(eventsCol(), event.id), stamped(event));
}

export async function deleteEvent(id: string): Promise<void> {
  await deleteDoc(doc(eventsCol(), id));
}

// The itinerary on its own, written from the itinerary editor so the event
// editor it may be open over isn't overwritten mid-edit.
export async function setEventItinerary(
  id: string,
  itinerary: EventItinerary,
): Promise<void> {
  await updateDoc(doc(eventsCol(), id), { itinerary });
}

// Just the token, like setCampaignShareToken.
export async function setEventItineraryShareToken(
  id: string,
  itineraryShareToken: string,
): Promise<void> {
  await updateDoc(doc(eventsCol(), id), { itineraryShareToken });
}

export async function setEventItinerarySharePointUrl(
  id: string,
  itinerarySharePointUrl: string,
): Promise<void> {
  await updateDoc(doc(eventsCol(), id), { itinerarySharePointUrl });
}

// ── Itinerary pages ────────────────────────────────────────────────────
// The public copy of an event's itinerary behind its SharePoint page, at
// /itineraryPages/{itineraryShareToken}. Same arrangement as campaign
// pages: anyone with the exact token can read it, listing is refused, and
// `json` is the page's data serialised by itineraryExport.ts.

const itineraryPagesCol = () => collection(db, "itineraryPages");

export async function setItineraryPage(shareToken: string, json: string): Promise<void> {
  await setDoc(doc(itineraryPagesCol(), shareToken), { json });
}

export async function deleteItineraryPage(shareToken: string): Promise<void> {
  await deleteDoc(doc(itineraryPagesCol(), shareToken));
}

// What readers of the page have added to its days (see ItineraryAddition).
// Subscribed by the itinerary editor while it's open.
const itineraryAdditionsCol = (shareToken: string) =>
  collection(doc(itineraryPagesCol(), shareToken), "additions");

export function subscribeItineraryAdditions(
  shareToken: string,
  onChange: (additions: ItineraryAddition[]) => void,
  onError: (err: Error) => void,
): () => void {
  return onSnapshot(
    itineraryAdditionsCol(shareToken),
    (snap) =>
      onChange(
        snap.docs
          .map((d) => ({ ...(d.data() as Omit<ItineraryAddition, "id">), id: d.id }))
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      ),
    onError,
  );
}

// Once an addition has been folded into the itinerary, or dismissed.
export async function deleteItineraryAddition(
  shareToken: string,
  additionId: string,
): Promise<void> {
  await deleteDoc(doc(itineraryAdditionsCol(shareToken), additionId));
}

// Attendees' travel and accommodation entered on the page (see
// ItineraryTravel). Read-only in Waypoint apart from removal.
const itineraryTravelCol = (shareToken: string) =>
  collection(doc(itineraryPagesCol(), shareToken), "travel");

export function subscribeItineraryTravel(
  shareToken: string,
  onChange: (travel: ItineraryTravel[]) => void,
  onError: (err: Error) => void,
): () => void {
  return onSnapshot(
    itineraryTravelCol(shareToken),
    (snap) =>
      onChange(
        snap.docs
          .map((d) => ({ ...(d.data() as Omit<ItineraryTravel, "id">), id: d.id }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      ),
    onError,
  );
}

export async function deleteItineraryTravel(
  shareToken: string,
  travelId: string,
): Promise<void> {
  await deleteDoc(doc(itineraryTravelCol(shareToken), travelId));
}

// Load the CargoWise Event Portal export (src/data/eventsSeed.json, made by
// scripts/event-portal-md-to-seed.py) into an empty /events collection.
// Same rules as the social posts seed: only into an empty collection, so a
// deleted event stays deleted; checked against the server, so an offline
// first boot fails quietly rather than queueing a re-import; and loaded
// on demand, so the seed only downloads on the visit that needs it.
export async function seedEventsIfMissing(): Promise<number> {
  const existing = await getDocsFromServer(eventsCol());
  if (!existing.empty) return 0;
  const { default: seed } = await import("./data/eventsSeed.json");
  const createdAt = new Date().toISOString();
  const CHUNK = 400;
  for (let i = 0; i < seed.length; i += CHUNK) {
    const batch = writeBatch(db);
    seed.slice(i, i + CHUNK).forEach((e) => {
      const event: MarketingEvent = {
        ...(e as unknown as Omit<MarketingEvent, "createdAt" | "source">),
        createdAt,
        source: "import",
      };
      batch.set(doc(eventsCol(), event.id), event);
    });
    await batch.commit();
  }
  return seed.length;
}

// ── Social calendar configuration ──────────────────────────────────────
// Categories and company hashtags, one document. `null` from the
// subscription means the document hasn't been written yet and the caller
// should use DEFAULT_SOCIAL_CONFIG.

export function subscribeSocialConfig(
  onChange: (config: SocialConfig | null) => void,
  onError: (err: Error) => void,
): () => void {
  return onSnapshot(
    socialConfigDoc(),
    (snap) => onChange(snap.exists() ? (snap.data() as SocialConfig) : null),
    onError,
  );
}

export async function setSocialConfig(config: SocialConfig): Promise<void> {
  await setDoc(socialConfigDoc(), config);
}

// Posts store a category's label, so renaming one has to visit every post
// that uses the old label. Batched, so a rename is all-or-nothing.
export async function relabelSocialPostCategory(
  oldLabel: string,
  newLabel: string,
): Promise<number> {
  if (oldLabel === newLabel) return 0;
  const snap = await getDocs(
    query(socialPostsCol(), where("category", "==", oldLabel)),
  );
  if (snap.empty) return 0;
  const CHUNK = 400;
  for (let i = 0; i < snap.docs.length; i += CHUNK) {
    const batch = writeBatch(db);
    snap.docs
      .slice(i, i + CHUNK)
      .forEach((d) => batch.update(d.ref, { category: newLabel }));
    await batch.commit();
  }
  return snap.size;
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

// ── Speakers ───────────────────────────────────────────────────────────
// The webinar speaker directory. Small and shared, so one subscription.

export function subscribeSpeakers(
  onChange: (speakers: Speaker[]) => void,
  onError: (err: Error) => void,
): () => void {
  return onSnapshot(
    speakersCol(),
    (snap) => onChange(snap.docs.map((d) => d.data() as Speaker)),
    onError,
  );
}

export async function setSpeaker(speaker: Speaker): Promise<void> {
  await setDoc(doc(speakersCol(), speaker.id), speaker);
}

export async function deleteSpeaker(id: string): Promise<void> {
  await deleteDoc(doc(speakersCol(), id));
}

// ── Big Rocks ──────────────────────────────────────────────────────────
// The marketing team's strategic priorities (BigRock in types.ts). A
// handful of documents, needed wherever a rock is picked or reported on,
// so one subscription, in list order.

export function subscribeBigRocks(
  onChange: (rocks: BigRock[]) => void,
  onError: (err: Error) => void,
): () => void {
  return onSnapshot(
    bigRocksCol(),
    (snap) =>
      onChange(
        snap.docs
          .map((d) => d.data() as BigRock)
          .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
      ),
    onError,
  );
}

// The Settings editor saves the whole list at once: every rock as it now
// stands, the removed ones deleted, and their ids taken off every project
// campaign, social post and event that carried them — one batch, so a
// half-applied edit is impossible. Removing a rock un-attributes its work;
// retiring it (the `retired` flag) keeps that, which is why the editor
// offers both.
export async function saveBigRocks(
  rocks: BigRock[],
  removedIds: string[],
): Promise<void> {
  const batch = writeBatch(db);
  rocks.forEach((r) => batch.set(doc(bigRocksCol(), r.id), r));
  removedIds.forEach((id) => batch.delete(doc(bigRocksCol(), id)));
  if (removedIds.length > 0) {
    const removed = new Set(removedIds);
    const snaps = await Promise.all(
      [projectsCol(), campaignsCol(), socialPostsCol(), eventsCol()].map((c) => getDocs(c)),
    );
    snaps.flatMap((s) => s.docs).forEach((d) => {
      const ids = (d.data() as { bigRockIds?: string[] }).bigRockIds;
      if (!ids?.some((id) => removed.has(id))) return;
      batch.update(d.ref, { bigRockIds: ids.filter((id) => !removed.has(id)) });
    });
  }
  await batch.commit();
}

// ── The marketing activity page ────────────────────────────────────────
// One public copy of every campaign, webinar and event for the SharePoint
// page (src/activityExport.ts), at /activityPages/{shareToken}, plus the
// token and SharePoint link in /settings/activityPage.

const activityPagesCol = () => collection(db, "activityPages");
const activityShareDoc = () => doc(collection(db, "settings"), "activityPage");

export async function setActivityPage(shareToken: string, json: string): Promise<void> {
  await setDoc(doc(activityPagesCol(), shareToken), { json });
}

export async function deleteActivityPage(shareToken: string): Promise<void> {
  await deleteDoc(doc(activityPagesCol(), shareToken));
}

export function subscribeActivityShare(
  onChange: (share: ActivityShare) => void,
  onError: (err: Error) => void,
): () => void {
  return onSnapshot(
    activityShareDoc(),
    (snap) => onChange((snap.data() as ActivityShare | undefined) ?? {}),
    onError,
  );
}

export async function setActivityShare(patch: ActivityShare): Promise<void> {
  await setDoc(activityShareDoc(), { ...patch, updatedAt: new Date().toISOString() }, { merge: true });
}

// ── Live event requests ──────────────────────────────────────────────────
// Submissions from the Live event request form on SharePoint, at
// /liveEventRequests. The form creates them (see the rules); Waypoint
// reads them all and writes the team's decisions and notes onto them. The
// form's configuration is one document, /settings/liveEventIntake.

const liveEventRequestsCol = () => collection(db, "liveEventRequests");
const liveEventIntakeDoc = () => doc(collection(db, "settings"), "liveEventIntake");

export function subscribeLiveEventRequests(
  onChange: (requests: LiveEventRequest[]) => void,
  onError: (err: Error) => void,
): () => void {
  return onSnapshot(
    liveEventRequestsCol(),
    (snap) =>
      onChange(
        snap.docs.map((d) => ({ ...(d.data() as Omit<LiveEventRequest, "id">), id: d.id })),
      ),
    onError,
  );
}

export async function updateLiveEventRequest(
  id: string,
  patch: Partial<Omit<LiveEventRequest, "id">>,
): Promise<void> {
  await updateDoc(doc(liveEventRequestsCol(), id), patch);
}

export async function deleteLiveEventRequest(id: string): Promise<void> {
  await deleteDoc(doc(liveEventRequestsCol(), id));
}

export function subscribeLiveEventIntake(
  onChange: (intake: LiveEventIntake) => void,
  onError: (err: Error) => void,
): () => void {
  return onSnapshot(
    liveEventIntakeDoc(),
    (snap) => onChange((snap.data() as LiveEventIntake | undefined) ?? {}),
    onError,
  );
}

export async function setLiveEventIntake(patch: LiveEventIntake): Promise<void> {
  await setDoc(
    liveEventIntakeDoc(),
    { ...patch, updatedAt: new Date().toISOString() },
    { merge: true },
  );
}

// An event the Video team adds from the board, already approved.
export async function createLiveEventRequest(data: Omit<LiveEventRequest, "id">): Promise<string> {
  const ref = doc(liveEventRequestsCol());
  await setDoc(ref, data);
  return ref.id;
}

const liveEventBlackoutsCol = () => collection(db, "liveEventBlackouts");
const liveEventPublicDoc = (token: string) => doc(collection(db, "liveEventPublic"), token);

export function subscribeLiveEventBlackouts(
  onChange: (blackouts: LiveEventBlackout[]) => void,
  onError: (err: Error) => void,
): () => void {
  return onSnapshot(
    liveEventBlackoutsCol(),
    (snap) =>
      onChange(
        snap.docs.map((d) => ({ ...(d.data() as Omit<LiveEventBlackout, "id">), id: d.id })),
      ),
    onError,
  );
}

export async function saveLiveEventBlackout(
  blackout: Omit<LiveEventBlackout, "id"> & { id?: string },
): Promise<string> {
  const { id, ...data } = blackout;
  const ref = id ? doc(liveEventBlackoutsCol(), id) : doc(liveEventBlackoutsCol());
  await setDoc(ref, data, { merge: true });
  return ref.id;
}

export async function deleteLiveEventBlackout(id: string): Promise<void> {
  await deleteDoc(doc(liveEventBlackoutsCol(), id));
}

// The copy of the blackouts the request form reads, under the current
// intake token (see firestore.rules): rewritten whenever the blackouts or
// the token change.
export async function publishLiveEventPublic(token: string, blackouts: PublicBlackout[]): Promise<void> {
  await setDoc(liveEventPublicDoc(token), { blackouts, updatedAt: new Date().toISOString() });
}

export async function deleteLiveEventPublic(token: string): Promise<void> {
  await deleteDoc(liveEventPublicDoc(token));
}
