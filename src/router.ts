import { useMemo, useSyncExternalStore } from "react";

// Hash routes for the three kinds of work that open as a full page:
//
//   #project/<id>/<tab>   #campaign/<id>/<tab>   #event/<id>/<tab>
//
// The list views (boards, Campaigns, Events, Social calendar…) stay as
// App.tsx's `view` state; a hash route layers a page over whichever list
// was showing, so Back (or closeItem) returns to it. Tab changes replace
// the history entry rather than push one, so Back always closes the page
// instead of walking through every tab visited.
//
// Links are plain hashes, so a page address can be copied from the browser
// bar and shared: it still needs a sign-in, like every other Waypoint URL.

export type ItemKind = "project" | "campaign" | "event";

export type ItemRoute = {
  kind: ItemKind;
  id: string;
  // "overview" when the hash doesn't name one.
  tab: string;
};

const KINDS: readonly ItemKind[] = ["project", "campaign", "event"];

export function parseItemHash(hash: string): ItemRoute | null {
  const raw = hash.replace(/^#\/?/, "");
  if (!raw) return null;
  const [kind, id, tab] = raw.split("/");
  if (!id || !KINDS.includes(kind as ItemKind)) return null;
  return {
    kind: kind as ItemKind,
    id: safeDecode(id),
    tab: tab ? safeDecode(tab) : "overview",
  };
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export function itemHash(kind: ItemKind, id: string, tab = "overview"): string {
  return `#${kind}/${encodeURIComponent(id)}/${encodeURIComponent(tab)}`;
}

// Open an item's page (pushes a history entry).
export function openItem(kind: ItemKind, id: string, tab?: string): void {
  const next = itemHash(kind, id, tab);
  if (window.location.hash === next) return;
  window.location.hash = next;
}

// Switch tabs on the open page without adding to history.
export function replaceItemTab(kind: ItemKind, id: string, tab: string): void {
  const next = itemHash(kind, id, tab);
  if (window.location.hash === next) return;
  window.history.replaceState(null, "", next);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

// Leave the page and show the list underneath. Pushes a clean URL rather
// than calling history.back(), which could leave the app entirely if the
// page was the first thing opened from a shared link.
export function closeItem(): void {
  if (!window.location.hash) return;
  window.history.pushState(
    null,
    "",
    `${window.location.pathname}${window.location.search}`,
  );
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener("popstate", onChange);
  };
}

// The item page the address bar is asking for, or null for a list view.
export function useItemRoute(): ItemRoute | null {
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => "",
  );
  return useMemo(() => parseItemHash(hash), [hash]);
}
