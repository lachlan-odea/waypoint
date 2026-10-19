import { useCallback, useSyncExternalStore } from "react";

/**
 * True while `query` matches the viewport, and re-renders when that changes
 * (resize, rotation). Used to swap the sidebar for a drawer on phones so the
 * component tree and the ≤720px block in App.css agree on the breakpoint.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
