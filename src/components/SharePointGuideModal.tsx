import { useEffect, useState } from "react";

// The marketing team's campaign library on SharePoint, where every
// campaign's page is uploaded.
const SHAREPOINT_CAMPAIGNS_FOLDER =
  "https://wisetechglobal.sharepoint.com/:f:/r/SiteCollectionDocuments/Shared%20Documents/Marketing/Campaigns?d=wbb6a1759bb3a4fcfad7c554679e80e8c&csf=1&web=1&e=7v3dSL";

const CHECK_IN_IMAGE = `${import.meta.env.BASE_URL}sharepoint-check-in.png`;

type Props = {
  fileName: string;
  // The link supplied last time, if the page has been put up before.
  initialUrl?: string;
  onDownload: () => void;
  onSave: (url: string) => void;
  onCancel: () => void;
};

// Anything on SharePoint over https, so a stray paste (a Teams or Outlook
// URL, plain text) is caught here.
function isSharePointUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && url.hostname.endsWith(".sharepoint.com");
  } catch {
    return false;
  }
}

// Walks someone through putting a campaign's page on SharePoint and hands
// its link back to the campaign. Once the page has been downloaded there's
// no way out but supplying the link: a page uploaded and never linked is
// one nobody can find from Waypoint. Before the download, or when the
// campaign already has a link, it can be closed as normal.
export function SharePointGuideModal({
  fileName,
  initialUrl,
  onDownload,
  onSave,
  onCancel,
}: Props) {
  const [downloaded, setDownloaded] = useState(false);
  const [openedFolder, setOpenedFolder] = useState(false);
  const [url, setUrl] = useState(initialUrl ?? "");
  const [touched, setTouched] = useState(false);

  const canClose = !downloaded || !!initialUrl;
  const valid = isSharePointUrl(url);

  // A reload is the one exit the dialog can't block, so ask first.
  useEffect(() => {
    if (canClose) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [canClose]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && canClose) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canClose, onCancel]);

  function download() {
    onDownload();
    setDownloaded(true);
  }

  function save() {
    setTouched(true);
    if (valid) onSave(url.trim());
  }

  return (
    <div className="modal-overlay sp-guide-overlay">
      <div
        className="modal sp-guide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sp-guide-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <div>
            <h2 className="modal-title-static" id="sp-guide-title">
              Put this campaign on SharePoint
            </h2>
            <div className="modal-sub">
              Four steps. The page keeps itself up to date once it's there.
            </div>
          </div>
          {canClose && (
            <button className="icon-btn" onClick={onCancel} aria-label="Close">
              ✕
            </button>
          )}
        </header>

        <div className="modal-body">
          <ol className="sp-steps">
            <li className={`sp-step ${downloaded ? "done" : ""}`}>
              <span className="sp-step-num" aria-hidden>
                {downloaded ? "✓" : 1}
              </span>
              <div className="sp-step-body">
                <h3>Download the SharePoint page</h3>
                <p className="muted small">
                  Saves <code>{fileName}</code> to your Downloads folder.
                </p>
                <button
                  type="button"
                  className={downloaded ? "btn-mini" : "primary"}
                  onClick={download}
                >
                  {downloaded ? "Download again" : "Download page"}
                </button>
              </div>
            </li>

            <li className={`sp-step ${openedFolder ? "done" : ""}`}>
              <span className="sp-step-num" aria-hidden>
                {openedFolder ? "✓" : 2}
              </span>
              <div className="sp-step-body">
                <h3>Upload it to SharePoint</h3>
                <p className="muted small">
                  Opens the Marketing › Campaigns folder in a new tab. Drag the
                  downloaded file in, or use Upload › Files.
                </p>
                <a
                  className={`sp-step-link ${downloaded && !openedFolder ? "primary" : "btn-mini"}`}
                  href={SHAREPOINT_CAMPAIGNS_FOLDER}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpenedFolder(true)}
                >
                  Click here to go to SharePoint ↗
                </a>
              </div>
            </li>

            <li className="sp-step">
              <span className="sp-step-num" aria-hidden>
                3
              </span>
              <div className="sp-step-body">
                <h3>Check the file in</h3>
                <p className="muted small">
                  Until it's checked in, only you can see it. Click the{" "}
                  <strong>⋯</strong> next to the file, go to <strong>More</strong>,
                  then click <strong>Check in</strong>.
                </p>
                <img
                  className="sp-step-img"
                  src={CHECK_IN_IMAGE}
                  alt="The file's ⋯ menu in SharePoint, with More open and Check in highlighted"
                />
              </div>
            </li>

            <li className={`sp-step ${valid ? "done" : ""}`}>
              <span className="sp-step-num" aria-hidden>
                {valid ? "✓" : 4}
              </span>
              <div className="sp-step-body">
                <h3>Paste the page's link here</h3>
                <p className="muted small">
                  Click the <strong>⋯</strong> next to the file, then{" "}
                  <strong>Copy link</strong>.
                </p>
                <label className="field">
                  <input
                    aria-label="SharePoint link"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onBlur={() => setTouched(true)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") save();
                    }}
                    placeholder="https://wisetechglobal.sharepoint.com/…"
                    inputMode="url"
                  />
                  {touched && url.trim() && !valid && (
                    <span className="field-hint warn">
                      That isn't a SharePoint link. Copy it from the file's ⋯ menu.
                    </span>
                  )}
                </label>
              </div>
            </li>
          </ol>
        </div>

        <footer className="modal-foot">
          {!canClose && (
            <span className="muted small" style={{ marginRight: "auto" }}>
              Paste the link to finish.
            </span>
          )}
          {canClose && <button onClick={onCancel}>Cancel</button>}
          <button className="primary" onClick={save} disabled={!valid}>
            Save link
          </button>
        </footer>
      </div>
    </div>
  );
}
