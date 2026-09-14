import { useState } from "react";
import { assetKindLabel, parseAssetLinks, type AssetLink } from "../assetLinks";

type Props = {
  // The raw Asset / Screenshot field text. May hold several links.
  text: string;
};

const glyph = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function KindGlyph({ kind }: { kind: AssetLink["kind"] }) {
  switch (kind) {
    case "image":
      return (
        <svg {...glyph}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="m21 15-5-5L5 21" />
        </svg>
      );
    case "video":
      return (
        <svg {...glyph}>
          <rect x="2" y="5" width="15" height="14" rx="2" />
          <path d="m17 10 5-3v10l-5-3z" />
        </svg>
      );
    case "pdf":
    case "document":
      return (
        <svg {...glyph}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
          <path d="M8 13h8M8 17h8" />
        </svg>
      );
    case "page":
      return (
        <svg {...glyph}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
        </svg>
      );
    case "file":
      return (
        <svg {...glyph}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
        </svg>
      );
  }
}

// A single link's preview. Images and videos render inline; a PDF gets a
// viewer on request (it's a heavy load, and often the wrong one to make
// while someone is just reading the notes); everything else is a card that
// says what it is and opens it.
function LinkPreview({ link }: { link: AssetLink }) {
  const [failed, setFailed] = useState(false);
  const [enlarged, setEnlarged] = useState(false);
  const [showPdf, setShowPdf] = useState(false);

  if (link.embeddable && link.kind === "image" && !failed) {
    return (
      <figure className={`asset-figure ${enlarged ? "enlarged" : ""}`}>
        <button
          type="button"
          className="asset-figure-btn"
          onClick={() => setEnlarged((v) => !v)}
          title={enlarged ? "Shrink" : "Enlarge"}
        >
          <img
            src={link.previewUrl ?? link.url}
            alt={link.label}
            loading="lazy"
            onError={() => setFailed(true)}
          />
        </button>
        <figcaption>
          <span className="asset-caption-label" title={link.label}>
            {link.label}
          </span>
          <a href={link.url} target="_blank" rel="noreferrer">
            Open ↗
          </a>
        </figcaption>
      </figure>
    );
  }

  if (link.embeddable && link.kind === "video" && !failed) {
    return (
      <figure className="asset-figure enlarged">
        <video
          src={link.url}
          controls
          preload="metadata"
          onError={() => setFailed(true)}
        />
        <figcaption>
          <span className="asset-caption-label" title={link.label}>
            {link.label}
          </span>
          <a href={link.url} target="_blank" rel="noreferrer">
            Open ↗
          </a>
        </figcaption>
      </figure>
    );
  }

  if (link.embeddable && link.kind === "pdf" && showPdf) {
    return (
      <figure className="asset-figure enlarged">
        <iframe src={link.url} title={link.label} className="asset-pdf" />
        <figcaption>
          <span className="asset-caption-label" title={link.label}>
            {link.label}
          </span>
          <button type="button" className="link-btn" onClick={() => setShowPdf(false)}>
            Hide
          </button>
          <a href={link.url} target="_blank" rel="noreferrer">
            Open ↗
          </a>
        </figcaption>
      </figure>
    );
  }

  // Fallback card. `failed` means we tried to render it and the browser
  // couldn't — most often an IntelligenceBank CDN link that turned out to be
  // a PDF, or a host that needs a sign-in.
  const kindText = assetKindLabel(link.kind);
  const note = !link.url
    ? "File name only — no link to open"
    : failed
      ? link.host.includes("sharepoint")
        ? `${kindText} on SharePoint — sign in to SharePoint in this browser and reopen to see it here`
        : `Couldn't render this ${kindText} here — open it instead`
      : link.embeddable
        ? kindText.toUpperCase()
        : link.host.includes("sharepoint")
          ? `${kindText} on SharePoint · needs sign-in`
          : link.kind === "page"
            ? `Page on ${link.host}`
            : `${kindText} on ${link.host}`;

  return (
    <div className="asset-card">
      <span className={`asset-card-icon kind-${link.kind}`}>
        <KindGlyph kind={link.kind} />
      </span>
      <span className="asset-card-body">
        <span className="asset-card-label" title={link.url || link.label}>
          {link.label}
        </span>
        <span className="asset-card-note">{note}</span>
      </span>
      {link.embeddable && link.kind === "pdf" && (
        <button
          type="button"
          className="btn-mini"
          onClick={() => setShowPdf(true)}
        >
          Preview
        </button>
      )}
      {link.url && (
        <a
          className="btn-mini asset-card-open"
          href={link.url}
          target="_blank"
          rel="noreferrer"
        >
          Open ↗
        </a>
      )}
    </div>
  );
}

export function AssetPreview({ text }: Props) {
  const links = parseAssetLinks(text);
  if (links.length === 0) return null;
  return (
    <div className="asset-preview">
      {links.map((l, i) => (
        <LinkPreview key={`${l.url || l.label}-${i}`} link={l} />
      ))}
    </div>
  );
}
