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
