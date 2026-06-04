// Login session lives in localStorage so a designer stays signed in across
// page reloads. Workspace data lives in Firestore (see src/firestore.ts).

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
