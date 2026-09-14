// Making sense of the Asset / Screenshot fields on a social post. They hold
// whatever the marketing team pasted into the spreadsheet: a direct file on
// the IntelligenceBank CDN, a SharePoint sharing link, an IntelligenceBank
// resource page, a Canva link, sometimes two links on separate lines, and
// occasionally just a file name ("Cosco Social #2.mp4"). The preview wants to
// know which of those it can actually render and which it can only open.

export type AssetKind =
  | "image"
  | "video"
  | "pdf"
  | "document"
  | "page"
  | "file";

export type AssetLink = {
  // Absolute URL, or "" for a bare file name we can't link to.
  url: string;
  kind: AssetKind;
  // Short human label: the file name where there is one, else the host.
  label: string;
  host: string;
  // True when it's worth asking the browser to load this in an
  // <img>/<video>/<iframe>. Not a promise: the preview always falls back to
  // a link card when the load fails.
  embeddable: boolean;
  // URL to load for the inline preview when it differs from the link
  // itself. SharePoint sharing links open an HTML viewer page, but with
  // `download=1` they serve the file bytes to a browser that's already
  // signed in to SharePoint; anyone who isn't gets a redirect to sign-in,
  // which fails the load and shows the card instead.
  previewUrl?: string;
};

const URL_RE = /https?:\/\/[^\s<>"'`]+/g;
const TRAILING_PUNCT = /[.,;:!?)\]}'"]+$/;

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v)$/i;
const PDF_EXT = /\.pdf$/i;
const DOC_EXT = /\.(docx?|pptx?|xlsx?|key|ai|psd|indd)$/i;

// SharePoint / OneDrive sharing links encode the file type in the path:
// /:i:/ image, /:b:/ PDF ("binary"), /:v:/ video, /:w:/ Word, /:p:/
// PowerPoint, /:x:/ Excel, /:f:/ folder, /:u:/ unknown.
const SHAREPOINT_TYPE = /\/:([ibvwpxfu]):\//;

function lastPathSegment(u: URL): string {
  const segments = u.pathname.split("/").filter(Boolean);
  const raw = segments[segments.length - 1] ?? "";
  try {
    return decodeURIComponent(raw).replace(/\+/g, " ");
  } catch {
    return raw;
  }
}

function classify(u: URL): Omit<AssetLink, "url"> {
  const host = u.hostname.replace(/^www\./, "");
  const file = lastPathSegment(u);

  const sp = SHAREPOINT_TYPE.exec(u.pathname);
  if (sp) {
    const kind: AssetKind =
      sp[1] === "i"
        ? "image"
        : sp[1] === "b"
          ? "pdf"
          : sp[1] === "v"
            ? "video"
            : sp[1] === "w" || sp[1] === "p" || sp[1] === "x"
              ? "document"
              : "page";
    // Only images are worth probing this way — a video or PDF pulled through
    // `download=1` is a big fetch to make on the off-chance.
    if (kind === "image") {
      const preview = new URL(u.toString());
      preview.searchParams.set("download", "1");
      return {
        kind,
        label: "SharePoint image",
        host,
        embeddable: true,
        previewUrl: preview.toString(),
      };
    }
    return { kind, label: "SharePoint " + describe(kind), host, embeddable: false };
  }

  if (IMAGE_EXT.test(file)) return { kind: "image", label: file, host, embeddable: true };
  if (VIDEO_EXT.test(file)) return { kind: "video", label: file, host, embeddable: true };
  if (PDF_EXT.test(file)) return { kind: "pdf", label: file, host, embeddable: true };
  if (DOC_EXT.test(file)) return { kind: "document", label: file, host, embeddable: false };

  // IntelligenceBank's CDN serves the file itself at /original/<name> with
  // no extension, so we can't tell an image from a PDF from the URL alone.
  // Call it an image and let the <img> tag find out; the preview falls back
  // to a link card if it fails to load.
  if (host === "cdn.intelligencebank.com" && /\/original\//.test(u.pathname)) {
    return { kind: "image", label: file || host, host, embeddable: true };
  }

  return { kind: "page", label: host, host, embeddable: false };
}

function describe(kind: AssetKind): string {
  switch (kind) {
    case "image":
      return "image";
    case "video":
      return "video";
    case "pdf":
      return "PDF";
    case "document":
      return "document";
    case "page":
      return "page";
    case "file":
      return "file";
  }
}

export const assetKindLabel = describe;

// Every link in a free-text asset field, in order. A field with no URL at
// all but some text yields one unlinked "file" entry so the name still shows.
export function parseAssetLinks(text: string): AssetLink[] {
  const links: AssetLink[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(URL_RE)) {
    const raw = match[0].replace(TRAILING_PUNCT, "");
    if (seen.has(raw)) continue;
    seen.add(raw);
    try {
      const u = new URL(raw);
      links.push({ url: raw, ...classify(u) });
    } catch {
      // Not a URL after all; skip it.
    }
  }
  if (links.length === 0) {
    const name = text.trim();
    if (name) {
      const kind: AssetKind = IMAGE_EXT.test(name)
        ? "image"
        : VIDEO_EXT.test(name)
          ? "video"
          : PDF_EXT.test(name)
            ? "pdf"
            : "file";
      links.push({ url: "", kind, label: name, host: "", embeddable: false });
    }
  }
  return links;
}

// The first link we can try to show as a picture. Used for card thumbnails,
// where a failed load is hidden rather than replaced with a card.
export function firstEmbeddableImage(text: string): AssetLink | null {
  return (
    parseAssetLinks(text).find((l) => l.kind === "image" && l.embeddable) ??
    null
  );
}
