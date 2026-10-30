// Build stamp, filled in by `define` in vite.config.ts.
declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;
declare const __APP_BUILT_AT__: string;

export const APP_VERSION = __APP_VERSION__;
export const APP_COMMIT = __APP_COMMIT__;
export const APP_BUILT_AT = __APP_BUILT_AT__;

// "Version 1.0.0 · a1b2c3d · 16 Oct 2026" — the commit is left out when the
// build couldn't find one.
export function versionLabel(): string {
  const built = new Date(APP_BUILT_AT).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return [`Version ${APP_VERSION}`, APP_COMMIT, built].filter(Boolean).join(" · ");
}

// Releases that ask everyone to sign in again. Bump this when a release
// should start every browser from the login page (App signs the restored
// user out the first time it boots on a build with a new value). Keep it
// as it is for ordinary releases, which keep people signed in.
export const SESSION_EPOCH = "3.0.0";

const EPOCH_KEY = "waypoint.sessionEpoch";

// True when this browser last ran a build with a different epoch (or none).
export function sessionEpochChanged(): boolean {
  try {
    return localStorage.getItem(EPOCH_KEY) !== SESSION_EPOCH;
  } catch {
    return false;
  }
}

export function markSessionEpoch(): void {
  try {
    localStorage.setItem(EPOCH_KEY, SESSION_EPOCH);
  } catch {
    // Storage blocked: the sign-out will repeat on the next boot, which
    // is harmless.
  }
}
