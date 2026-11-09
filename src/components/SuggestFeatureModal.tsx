import { useEffect, useState } from "react";
import type { Designer, Suggestion, SuggestionKind } from "../types";
import { versionLabel } from "../version";
import { SUGGESTION_KIND_LABELS } from "../suggestions";
import { Icon } from "./Icon";

type Props = {
  currentDesigner: Designer;
  onSubmit: (suggestion: Omit<Suggestion, "id">) => Promise<void>;
  onClose: () => void;
};

const TITLE_MAX = 120;
const WHERE_MAX = 120;
const DETAILS_MAX = 2000;

// The copy changes with the kind, so a bug report asks for what happened
// and an idea asks for the problem it solves.
const COPY: Record<
  SuggestionKind,
  { titleLabel: string; titleHint: string; detailsLabel: string; detailsHint: string }
> = {
  feature: {
    titleLabel: "What would you like Waypoint to do?",
    titleHint: "One line, e.g. \"Export the week ahead to Outlook\"",
    detailsLabel: "Tell us more",
    detailsHint:
      "What you're trying to get done, how you do it today, and what would make it easier.",
  },
  improvement: {
    titleLabel: "What could work better?",
    titleHint: "One line, e.g. \"Let me sort My work by due date\"",
    detailsLabel: "Tell us more",
    detailsHint: "What gets in the way now, and what you'd change.",
  },
  bug: {
    titleLabel: "What's wrong?",
    titleHint: "One line, e.g. \"Dragging a card to On hold doesn't save\"",
    detailsLabel: "What happened?",
    detailsHint: "What you did, what you expected, and what happened instead.",
  },
};

// Settings → Suggest a feature. Anyone signed in can send an idea, an
// improvement or a bug report; it's stored in /suggestions with who sent
// it and the build they were on, and the super users are emailed
// (notifySuggestion in functions/src/index.ts).
export function SuggestFeatureModal({ currentDesigner, onSubmit, onClose }: Props) {
  const [kind, setKind] = useState<SuggestionKind>("feature");
  const [title, setTitle] = useState("");
  const [where, setWhere] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const copy = COPY[kind];
  const canSend = title.trim().length > 0 && !busy;

  async function send() {
    if (!canSend) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        kind,
        title: title.trim().slice(0, TITLE_MAX),
        where: where.trim().slice(0, WHERE_MAX),
        details: details.trim().slice(0, DETAILS_MAX),
        submittedById: currentDesigner.id,
        submittedByName: currentDesigner.name,
        submittedByEmail: currentDesigner.email ?? "",
        createdAt: new Date().toISOString(),
        appVersion: versionLabel(),
        status: "new",
      });
      setSent(true);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? `Couldn't send that: ${err.message}`
          : "Couldn't send that. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  function another() {
    setTitle("");
    setWhere("");
    setDetails("");
    setSent(false);
    setError(null);
  }

  return (
    <div className="modal-overlay">
      <div className="modal modal-narrow">
        <header className="modal-head">
          <h2 className="modal-title-static">Suggest a feature</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close" disabled={busy}>
            <Icon name="close" size={16} />
          </button>
        </header>

        {sent ? (
          <>
            <div className="modal-body">
              <div className="suggest-thanks">
                <Icon name="lightbulb" size={28} />
                <h3>
                  Thanks
                  {currentDesigner.name.trim() ? `, ${currentDesigner.name.trim().split(/\s+/)[0]}` : ""}
                </h3>
                <p className="muted">
                  Your {SUGGESTION_KIND_LABELS[kind].toLowerCase()} has gone to the people
                  who look after Waypoint. If they need more detail they'll get in touch
                  {currentDesigner.email ? ` at ${currentDesigner.email}` : ""}.
                </p>
              </div>
            </div>
            <footer className="modal-foot">
              <button onClick={another}>Send another</button>
              <button className="primary" onClick={onClose}>
                Done
              </button>
            </footer>
          </>
        ) : (
          <>
            <div className="modal-body">
              <p className="muted small">
                Got an idea, or something that isn't working? Tell the people who
                build Waypoint. Everything you send is kept with your name and the
                version you're on.
              </p>

              <div className="preference-group">
                <label className="preference-label">This is a…</label>
                <div className="theme-row">
                  {(Object.keys(SUGGESTION_KIND_LABELS) as SuggestionKind[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      className={`theme-btn ${kind === k ? "on" : ""}`}
                      onClick={() => setKind(k)}
                      disabled={busy}
                    >
                      {SUGGESTION_KIND_LABELS[k]}
                    </button>
                  ))}
                </div>
              </div>

              <label className="field">
                <span>{copy.titleLabel}</span>
                <input
                  type="text"
                  value={title}
                  maxLength={TITLE_MAX}
                  placeholder={copy.titleHint}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setError(null);
                  }}
                  disabled={busy}
                  autoFocus
                />
              </label>

              <label className="field">
                <span>
                  Where in Waypoint <span className="muted">(optional)</span>
                </span>
                <input
                  type="text"
                  value={where}
                  maxLength={WHERE_MAX}
                  placeholder="e.g. Social calendar, My Desk → Checklist, a project page"
                  onChange={(e) => setWhere(e.target.value)}
                  disabled={busy}
                />
              </label>

              <label className="field">
                <span>
                  {copy.detailsLabel} <span className="muted">(optional)</span>
                </span>
                <textarea
                  rows={5}
                  value={details}
                  maxLength={DETAILS_MAX}
                  placeholder={copy.detailsHint}
                  onChange={(e) => setDetails(e.target.value)}
                  disabled={busy}
                />
                <span className="field-hint">
                  Sent as {currentDesigner.name} · {versionLabel()}
                </span>
              </label>

              {error && <p className="login-error">{error}</p>}
            </div>

            <footer className="modal-foot">
              <button onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button className="primary" onClick={send} disabled={!canSend}>
                {busy ? "Sending…" : `Send ${SUGGESTION_KIND_LABELS[kind].toLowerCase()}`}
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
