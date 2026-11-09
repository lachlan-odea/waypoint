import { useEffect, useMemo, useState } from "react";
import type { Suggestion, SuggestionStatus } from "../types";
import { Icon } from "./Icon";
import {
  isOpenSuggestion,
  SUGGESTION_KIND_LABELS,
  SUGGESTION_STATUS_LABELS,
  SUGGESTION_STATUS_ORDER as STATUS_ORDER,
} from "../suggestions";

type Props = {
  suggestions: Suggestion[];
  onUpdate: (id: string, patch: Partial<Omit<Suggestion, "id">>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
};

function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

// Super-user review of what people have sent from Settings → Suggest a
// feature: newest first, open ones by default, each with its status
// changeable in place, a note on the decision, and a remove.
export function SuggestionsReviewModal({ suggestions, onUpdate, onDelete, onClose }: Props) {
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Notes are typed locally and written when the field loses focus.
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sorted = useMemo(
    () => suggestions.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [suggestions],
  );
  const shown = filter === "open" ? sorted.filter(isOpenSuggestion) : sorted;
  const openCount = sorted.filter(isOpenSuggestion).length;

  async function run(id: string, work: () => Promise<void>) {
    setBusyId(id);
    setError(null);
    try {
      await work();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  function remove(s: Suggestion) {
    const ok = window.confirm(
      `Remove "${s.title}" from ${s.submittedByName || "the sender"}? This can't be undone.`,
    );
    if (!ok) return;
    void run(s.id, () => onDelete(s.id));
  }

  function saveNote(s: Suggestion) {
    const draft = noteDrafts[s.id];
    if (draft === undefined || draft === (s.notes ?? "")) return;
    void run(s.id, () => onUpdate(s.id, { notes: draft.trim() }));
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <header className="modal-head">
          <h2 className="modal-title-static">Suggestions</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="modal-body">
          <p className="muted small">
            What people have asked for from Settings → Suggest a feature. Set a status
            as you decide; the sender's name and the build they were on are kept with
            each one.
          </p>

          <div className="seg suggestions-seg">
            <button
              className={filter === "open" ? "seg-on" : ""}
              onClick={() => setFilter("open")}
            >
              Open ({openCount})
            </button>
            <button
              className={filter === "all" ? "seg-on" : ""}
              onClick={() => setFilter("all")}
            >
              All ({sorted.length})
            </button>
          </div>

          {error && <p className="login-error">{error}</p>}

          {shown.length === 0 ? (
            <p className="muted small suggestions-empty">
              {filter === "open"
                ? "Nothing waiting. Everything sent in has been decided."
                : "Nobody has sent a suggestion yet."}
            </p>
          ) : (
            <ul className="suggestions-list">
              {shown.map((s) => {
                const open = expandedId === s.id;
                const busy = busyId === s.id;
                return (
                  <li
                    key={s.id}
                    className={`suggestion-row kind-${s.kind} status-${s.status} ${open ? "open" : ""}`}
                  >
                    <button
                      className="suggestion-summary"
                      onClick={() => setExpandedId(open ? null : s.id)}
                      aria-expanded={open}
                    >
                      <span className={`suggestion-kind kind-${s.kind}`}>
                        {SUGGESTION_KIND_LABELS[s.kind] ?? s.kind}
                      </span>
                      <span className="suggestion-title">{s.title}</span>
                      <span className="suggestion-meta muted small">
                        {[s.submittedByName, when(s.createdAt), s.where].filter(Boolean).join(" · ")}
                      </span>
                      <span className={`suggestion-status status-${s.status}`}>
                        {SUGGESTION_STATUS_LABELS[s.status] ?? s.status}
                      </span>
                    </button>

                    {open && (
                      <div className="suggestion-detail">
                        {s.details ? (
                          <p className="suggestion-details">{s.details}</p>
                        ) : (
                          <p className="muted small">No further detail was given.</p>
                        )}
                        <dl className="suggestion-facts">
                          <dt>From</dt>
                          <dd>
                            {s.submittedByName || "Unknown"}
                            {s.submittedByEmail && (
                              <>
                                {" · "}
                                <a
                                  href={`mailto:${s.submittedByEmail}?subject=${encodeURIComponent(
                                    `Re: your Waypoint suggestion – ${s.title}`,
                                  )}`}
                                >
                                  {s.submittedByEmail}
                                </a>
                              </>
                            )}
                          </dd>
                          {s.where && (
                            <>
                              <dt>Where</dt>
                              <dd>{s.where}</dd>
                            </>
                          )}
                          <dt>Sent</dt>
                          <dd>
                            {when(s.createdAt)}
                            {s.appVersion ? ` · ${s.appVersion}` : ""}
                          </dd>
                        </dl>

                        <div className="suggestion-controls">
                          <label className="field-inline">
                            <span>Status</span>
                            <select
                              value={s.status}
                              disabled={busy}
                              onChange={(e) =>
                                void run(s.id, () =>
                                  onUpdate(s.id, { status: e.target.value as SuggestionStatus }),
                                )
                              }
                            >
                              {STATUS_ORDER.map((st) => (
                                <option key={st} value={st}>
                                  {SUGGESTION_STATUS_LABELS[st]}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button
                            className="btn btn-secondary suggestion-remove"
                            onClick={() => remove(s)}
                            disabled={busy}
                            title="Remove this suggestion"
                          >
                            <Icon name="trash" size={14} /> Remove
                          </button>
                        </div>

                        <label className="field">
                          <span>
                            Notes <span className="muted">(for the reviewers)</span>
                          </span>
                          <textarea
                            rows={2}
                            value={noteDrafts[s.id] ?? s.notes ?? ""}
                            placeholder="Why it was planned or declined, or where it shipped."
                            onChange={(e) =>
                              setNoteDrafts((cur) => ({ ...cur, [s.id]: e.target.value }))
                            }
                            onBlur={() => saveNote(s)}
                            disabled={busy}
                          />
                        </label>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="modal-foot">
          <button onClick={onClose}>Close</button>
        </footer>
      </div>
    </div>
  );
}
