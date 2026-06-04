import type { Project, StorageConfig, Workspace } from "./types";
import { seedWorkspace } from "./seed";

const CONFIG_KEY = "pmtool.config.v1";
const LOCAL_DATA_KEY = "pmtool.workspace.v3";
const SESSION_KEY = "pmtool.session.v1";

// Avatar URLs are produced by Vite's asset pipeline and change between builds
// (and when the base path changes). Persisted URLs therefore go stale, so we
// re-apply the current seed avatar for every known designer on load.
const seedAvatarById = new Map(
  seedWorkspace.designers.map((d) => [d.id, d.avatar] as const),
);

function withFreshAvatars(ws: Workspace): Workspace {
  return {
    ...ws,
    designers: ws.designers.map((d) => {
      const fresh = seedAvatarById.get(d.id);
      return fresh ? { ...d, avatar: fresh } : d;
    }),
    // Legacy migrations:
    //  - `reviewerId` → `flaggedForReview: true` (per-reviewer field replaced
    //     by a shared boolean).
    //  - `productArea` → `contentType` (field renamed).
    //  - `assigneeId: string | null` → `assigneeIds: string[]` (a project can
    //     now have multiple assignees).
    projects: ws.projects.map((p) => {
      const legacy = p as Project & {
        reviewerId?: string | null;
        productArea?: string;
        assigneeId?: string | null;
      };
      let next: Project = p;
      if (legacy.reviewerId && next.flaggedForReview === undefined) {
        const { reviewerId: _drop, ...rest } = legacy;
        next = { ...rest, flaggedForReview: true };
      }
      if (legacy.productArea !== undefined && !next.contentType) {
        const { productArea: _drop, ...rest } = next as Project & {
          productArea?: string;
        };
        next = { ...rest, contentType: legacy.productArea };
      }
      if (!Array.isArray((next as { assigneeIds?: unknown }).assigneeIds)) {
        const { assigneeId, ...rest } = next as Project & {
          assigneeId?: string | null;
        };
        next = {
          ...rest,
          assigneeIds: assigneeId ? [assigneeId] : [],
        };
      }
      return next;
    }),
    notifications: ws.notifications ?? [],
  };
}

export type Session = { designerId: string };

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return null;
}

export function saveSession(s: Session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function loadConfig(): StorageConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return { mode: "local" };
}

export function saveConfig(cfg: StorageConfig) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}

function loadLocal(): Workspace {
  try {
    const raw = localStorage.getItem(LOCAL_DATA_KEY);
    if (raw) return withFreshAvatars(JSON.parse(raw));
  } catch {
    // ignore
  }
  return seedWorkspace;
}

function saveLocal(ws: Workspace) {
  localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify(ws));
}

const JSONBIN_BASE = "https://api.jsonbin.io/v3/b";

async function readBin(cfg: StorageConfig): Promise<Workspace> {
  if (!cfg.binId || !cfg.apiKey) throw new Error("JSONBin not configured");
  const res = await fetch(`${JSONBIN_BASE}/${cfg.binId}/latest`, {
    headers: {
      "X-Master-Key": cfg.apiKey,
      ...(cfg.accessKey ? { "X-Access-Key": cfg.accessKey } : {}),
    },
  });
  if (!res.ok) throw new Error(`JSONBin read failed: ${res.status}`);
  const json = await res.json();
  const record = json.record as Workspace;
  if (!record || !Array.isArray(record.projects)) {
    return seedWorkspace;
  }
  return withFreshAvatars(record);
}

async function writeBin(cfg: StorageConfig, ws: Workspace): Promise<void> {
  if (!cfg.binId || !cfg.apiKey) throw new Error("JSONBin not configured");
  const res = await fetch(`${JSONBIN_BASE}/${cfg.binId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Master-Key": cfg.apiKey,
      ...(cfg.accessKey ? { "X-Access-Key": cfg.accessKey } : {}),
    },
    body: JSON.stringify(ws),
  });
  if (!res.ok) throw new Error(`JSONBin write failed: ${res.status}`);
}

export async function loadWorkspace(cfg: StorageConfig): Promise<Workspace> {
  if (cfg.mode === "jsonbin" && cfg.binId && cfg.apiKey) {
    return readBin(cfg);
  }
  return loadLocal();
}

// Three-way merge for collections of items with stable ids. Walks `local`
// first to preserve its ordering, then appends items only present remotely.
// Deletions: if the side that has the item didn't modify it, the delete from
// the other side wins; if it did modify it, the surviving (modified) copy
// wins (we'd rather keep an edit than silently discard it).
function mergeById<T extends { id: string }>(
  baseline: T[],
  local: T[],
  remote: T[],
  mergeItem: (b: T | undefined, l: T, r: T) => T,
): T[] {
  const baselineById = new Map(baseline.map((x) => [x.id, x]));
  const remoteById = new Map(remote.map((x) => [x.id, x]));
  const result: T[] = [];
  const seen = new Set<string>();
  for (const item of local) {
    seen.add(item.id);
    const b = baselineById.get(item.id);
    const r = remoteById.get(item.id);
    if (r) {
      result.push(mergeItem(b, item, r));
    } else if (!b) {
      // Brand new locally.
      result.push(item);
    } else if (JSON.stringify(item) !== JSON.stringify(b)) {
      // Remote deleted, we modified — keep our version.
      result.push(item);
    }
    // else: remote deleted, we didn't touch → honor delete.
  }
  for (const item of remote) {
    if (seen.has(item.id)) continue;
    if (baselineById.has(item.id)) {
      // We deleted it; honor delete even if remote modified.
      continue;
    }
    result.push(item);
  }
  return result;
}

// Pick local if it differs from baseline (we changed it), else remote.
function pickField<T>(b: T | undefined, l: T, r: T): T {
  if (b === undefined) return l;
  return JSON.stringify(l) !== JSON.stringify(b) ? l : r;
}

// String set diff: things we added or removed locally are reflected onto the
// remote set; other changes from remote are preserved.
function mergeStringSet(baseline: string[], local: string[], remote: string[]): string[] {
  const baseSet = new Set(baseline);
  const localSet = new Set(local);
  const removed = baseline.filter((x) => !localSet.has(x));
  const added = local.filter((x) => !baseSet.has(x));
  const result = remote.filter((x) => !removed.includes(x));
  for (const a of added) if (!result.includes(a)) result.push(a);
  return result;
}

function mergeProject(b: Project | undefined, l: Project, r: Project): Project {
  return {
    id: l.id,
    title: pickField(b?.title, l.title, r.title),
    overview: pickField(b?.overview, l.overview, r.overview),
    client: pickField(b?.client, l.client, r.client),
    brand: pickField(b?.brand, l.brand, r.brand),
    contentType: pickField(b?.contentType, l.contentType, r.contentType),
    briefUrl: pickField(b?.briefUrl, l.briefUrl, r.briefUrl),
    dueDate: pickField(b?.dueDate, l.dueDate, r.dueDate),
    priority: pickField(b?.priority, l.priority, r.priority),
    createdAt: b?.createdAt ?? l.createdAt ?? r.createdAt,
    source: pickField(b?.source, l.source, r.source),
    flaggedForReview: pickField(b?.flaggedForReview, l.flaggedForReview, r.flaggedForReview),
    status: pickField(b?.status, l.status, r.status),
    archived: pickField(b?.archived, l.archived, r.archived),
    assigneeIds: mergeStringSet(b?.assigneeIds ?? [], l.assigneeIds, r.assigneeIds),
    milestones: mergeById(b?.milestones ?? [], l.milestones, r.milestones, (mb, ml, mr) => ({
      id: ml.id,
      label: pickField(mb?.label, ml.label, mr.label),
      done: pickField(mb?.done, ml.done, mr.done),
    })),
    comments: mergeById(b?.comments ?? [], l.comments, r.comments, (cb, cl, cr) => ({
      id: cl.id,
      author: cb?.author ?? cl.author ?? cr.author,
      createdAt: cb?.createdAt ?? cl.createdAt ?? cr.createdAt,
      parentId: cb?.parentId ?? cl.parentId ?? cr.parentId,
      text: pickField(cb?.text, cl.text, cr.text),
      likes: mergeStringSet(cb?.likes ?? [], cl.likes ?? [], cr.likes ?? []),
    })),
  };
}

export function mergeWorkspaces(
  baseline: Workspace,
  local: Workspace,
  remote: Workspace,
): Workspace {
  return {
    currentDesignerId: local.currentDesignerId,
    designers: mergeById(baseline.designers, local.designers, remote.designers, (b, l, r) => ({
      id: l.id,
      name: pickField(b?.name, l.name, r.name),
      initials: pickField(b?.initials, l.initials, r.initials),
      color: pickField(b?.color, l.color, r.color),
      pin: pickField(b?.pin, l.pin, r.pin),
      avatar: pickField(b?.avatar, l.avatar, r.avatar),
    })),
    projects: mergeById(baseline.projects, local.projects, remote.projects, mergeProject),
    notifications: mergeById(
      baseline.notifications,
      local.notifications,
      remote.notifications,
      (_b, l, _r) => l,
    ),
  };
}

// Fetch the latest from JSONBin and three-way merge it with our local state.
// Returns the merged workspace + the snapshot to use as the new baseline,
// or null when nothing on the server differs from our baseline (so nothing
// to apply). Caller should pause when the tab is hidden.
export async function pullLatest(
  cfg: StorageConfig,
  current: Workspace,
  baseline: Workspace,
): Promise<{ workspace: Workspace; baseline: Workspace } | null> {
  if (cfg.mode !== "jsonbin" || !cfg.binId || !cfg.apiKey) return null;
  const remote = await readBin(cfg);
  if (JSON.stringify(remote) === JSON.stringify(baseline)) return null;
  const merged = mergeWorkspaces(baseline, current, remote);
  saveLocal(merged);
  return { workspace: merged, baseline: remote };
}

// Read latest from JSONBin, merge our local edits onto it, and write the
// merged result back. The returned workspace is the merged value — callers
// should both rebase their baseline and update local state with it so the
// UI reflects any concurrent changes another user just made.
export async function saveWorkspace(
  cfg: StorageConfig,
  ws: Workspace,
  baseline: Workspace | null,
): Promise<Workspace> {
  saveLocal(ws);
  if (cfg.mode !== "jsonbin" || !cfg.binId || !cfg.apiKey) return ws;
  let remote: Workspace;
  try {
    remote = await readBin(cfg);
  } catch {
    // If we can't read the latest, fall back to writing our local state.
    await writeBin(cfg, ws);
    return ws;
  }
  const merged = baseline ? mergeWorkspaces(baseline, ws, remote) : ws;
  await writeBin(cfg, merged);
  saveLocal(merged);
  return merged;
}
