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
    projects: ws.projects.map((p) => {
      const legacy = p as Project & {
        reviewerId?: string | null;
        productArea?: string;
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

export async function saveWorkspace(cfg: StorageConfig, ws: Workspace): Promise<void> {
  saveLocal(ws);
  if (cfg.mode === "jsonbin" && cfg.binId && cfg.apiKey) {
    await writeBin(cfg, ws);
  }
}
