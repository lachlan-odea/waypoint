// Helpers for the team's shared Tools (Tool in types.ts), used by the Tools
// page and the universal header's search.

// Put a scheme on a bare URL so "cargowise.com" opens off-site rather than
// resolving against the app's own origin. mailto: and other schemes are left
// as the person typed them.
export function normaliseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

// The host, for a tile's footer line — "brand.wisetechglobal.com".
export function hostOf(url: string): string {
  try {
    return new URL(normaliseUrl(url)).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
