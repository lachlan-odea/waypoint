import type { StorageConfig, Workspace } from "./types";
import { seedWorkspace } from "./seed";

const CONFIG_KEY = "pmtool.config.v1";
const LOCAL_DATA_KEY = "pmtool.workspace.v3";
const SESSION_KEY = "pmtool.session.v1";

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
    if (raw) return JSON.parse(raw);
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
  return record;
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
