import { itemHash, type ItemKind } from "./router";

// A shareable link to a single project. Deliberately just a deep link into
// the app, not a public token: the recipient still has to sign in, so sharing
// a link grants no access on its own and there's nothing to revoke. App.tsx's
// ?project= handler picks it up once the workspace has loaded, switching to
// the project's team on the way so the modal doesn't open over the wrong
// board.
//
// BASE_URL is Vite's build-time base ("/waypoint/"), so this stays correct
// wherever the app is deployed rather than hard-coding the path.
export function projectShareUrl(projectId: string): string {
  const base = import.meta.env.BASE_URL || "/";
  return `${window.location.origin}${base}?project=${encodeURIComponent(projectId)}`;
}

// The same for a campaign or event: the address of its page, which is a hash
// route (see router.ts), so it opens straight onto the page after sign-in.
export function itemShareUrl(kind: ItemKind, id: string): string {
  const base = import.meta.env.BASE_URL || "/";
  return `${window.location.origin}${base}${itemHash(kind, id)}`;
}

// navigator.clipboard is unavailable outside a secure context, which includes
// plain-http intranet hosting — hence the execCommand fallback. Deprecated,
// but it's still the only thing that works there, and silently failing to
// copy is worse than using it.
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through — a permissions failure is still worth retrying below.
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    // Keep it out of view and off the layout, but still focusable: an
    // element that's display:none or hidden can't be selected.
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "-1000px";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
