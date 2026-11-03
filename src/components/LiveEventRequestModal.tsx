import { useEffect, useMemo, useState } from "react";
import type { Designer, LiveEventBlackout, LiveEventIntake, LiveEventRequest } from "../types";
import {
  attentionFlags,
  audienceShort,
  blackoutFlag,
  deliverableShort,
  mailtoUrl,
  outlookComposeUrl,
  parseSubmission,
  replyEmail,
  requestBrief,
  requestStatusLabel,
  requestStatusTone,
  setupSummary,
  submissionDateLabel,
  submissionSections,
  submissionTimeLabel,
  whereLabel,
} from "../liveEventRequests";
import { intakeEmails } from "../liveEventRequestExport";
import { timeAgo } from "../dates";
import { copyText } from "../share";
import { Icon } from "./Icon";

type Props = {
  request: LiveEventRequest;
  currentDesigner: Designer;
  intake: LiveEventIntake;
  blackouts: LiveEventBlackout[];
  onUpdate: (id: string, patch: Partial<Omit<LiveEventRequest, "id">>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
};

// One request in full: what was asked for, what the team should notice,
// the decision (with the message that goes back to the requester), the
// team's own notes, and the reply email. Approving or declining writes
// the decision onto the request; the requester hears by email, which the
// buttons draft, until the Entra app can send the confirmation itself.
export function LiveEventRequestModal({
  request,
  currentDesigner,
  intake,
  blackouts,
  onUpdate,
  onDelete,
  onClose,
}: Props) {
  const s = useMemo(() => parseSubmission(request.json), [request.json]);
  const { facilitiesEmail } = intakeEmails(intake);
  const flags = useMemo(() => {
    const f = attentionFlags(s);
    const blocked = blackoutFlag(request, blackouts);
    return blocked ? [blocked, ...f] : f;
  }, [s, request, blackouts]);
  const sections = useMemo(() => submissionSections(s, facilitiesEmail), [s, facilitiesEmail]);

  const [note, setNote] = useState(request.decision?.note ?? "");
  const [editingDecision, setEditingDecision] = useState(!request.decision);
  const [notes, setNotes] = useState(request.teamNotes ?? "");
  const [busy, setBusy] = useState<"approved" | "declined" | "notes" | "delete" | null>(null);
  const [error, setError] = useState("");
  const [savedNotes, setSavedNotes] = useState(false);
  const [copied, setCopied] = useState(false);
  const [armDelete, setArmDelete] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!armDelete) return;
    const t = setTimeout(() => setArmDelete(false), 4000);
    return () => clearTimeout(t);
  }, [armDelete]);

  async function decide(status: "approved" | "declined") {
    setBusy(status);
    setError("");
    try {
      await onUpdate(request.id, {
        status,
        decision: {
          status,
          note: note.trim(),
          decidedAt: new Date().toISOString(),
          decidedById: currentDesigner.id,
          decidedByName: currentDesigner.name,
        },
      });
      setEditingDecision(false);
    } catch (err) {
      setError(`Couldn't save the decision: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  }

  async function saveNotes() {
    setBusy("notes");
    setError("");
    try {
      await onUpdate(request.id, {
        teamNotes: notes.trim(),
        teamNotesUpdatedAt: new Date().toISOString(),
      });
      setSavedNotes(true);
      setTimeout(() => setSavedNotes(false), 2500);
    } catch (err) {
      setError(`Couldn't save the notes: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!armDelete) {
      setArmDelete(true);
      return;
    }
    setBusy("delete");
    try {
      await onDelete(request.id);
      onClose();
    } catch (err) {
      setError(`Couldn't remove it: ${err instanceof Error ? err.message : String(err)}`);
      setBusy(null);
    }
  }

  async function copyBrief() {
    const ok = await copyText(requestBrief(request, s, facilitiesEmail));
    setCopied(ok);
    if (ok) setTimeout(() => setCopied(false), 2000);
  }

  const decision = request.decision;
  const reply = decision ? replyEmail(request, s, decision.status, decision.note) : null;
  const dirtyNotes = notes.trim() !== (request.teamNotes ?? "").trim();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal ler-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ler-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <div>
            <div className="ler-head-row">
              <h2 className="modal-title-static" id="ler-modal-title">
                {request.eventName || "Untitled event"}
              </h2>
              <span className={`soc-status wp-status ${requestStatusTone(request.status)}`}>
                {requestStatusLabel(request.status)}
              </span>
            </div>
            <div className="modal-sub">
              {submissionDateLabel(s)} · {submissionTimeLabel(s)} · {whereLabel(s)}
            </div>
            <div className="modal-sub">
              {request.source === "team" ? (
                <>
                  Added by <strong>{request.createdByName || "the team"}</strong>
                  {request.requesterName && request.requesterName !== request.createdByName
                    ? ` for ${request.requesterName}`
                    : ""}
                </>
              ) : (
                <>
                  From <strong>{request.requesterName || s.name || "unknown"}</strong>
                </>
              )}
              {s.team ? ` (${s.team})` : ""}
              {request.requesterEmail ? (
                <>
                  {" "}
                  · <a href={`mailto:${request.requesterEmail}`}>{request.requesterEmail}</a>
                </>
              ) : null}
              {request.createdAt
                ? ` · ${request.source === "team" ? "added" : "received"} ${timeAgo(request.createdAt)}`
                : ""}
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="modal-body ler-body">
          <div className="ler-tiles">
            <div className="ler-tile">
              <span className="eyebrow">In person</span>
              <strong>{s.inPerson || "—"}</strong>
            </div>
            <div className="ler-tile">
              <span className="eyebrow">Online</span>
              <strong>{s.online || "—"}</strong>
            </div>
            <div className="ler-tile">
              <span className="eyebrow">Audience</span>
              <strong>{audienceShort(s) || "—"}</strong>
            </div>
            <div className="ler-tile">
              <span className="eyebrow">Deliverable</span>
              <strong>{deliverableShort(s)}</strong>
            </div>
          </div>

          <p className="ler-setup">
            <strong>Setup.</strong> {setupSummary(s)}
          </p>

          {flags.length > 0 && (
            <div className="ler-attn">
              <span className="eyebrow">For attention</span>
              <ul>
                {flags.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          )}

          <section className="ler-block">
            <h3>Decision</h3>
            {decision && !editingDecision ? (
              <>
                <p className="ler-decided">
                  <span className={`soc-status wp-status ${requestStatusTone(decision.status)}`}>
                    {requestStatusLabel(decision.status)}
                  </span>{" "}
                  by {decision.decidedByName} · {timeAgo(decision.decidedAt)}
                </p>
                {decision.note ? (
                  <blockquote className="ler-note">{decision.note}</blockquote>
                ) : (
                  <p className="muted small">No message to the requester was added.</p>
                )}
                <div className="ler-actions">
                  {reply && (
                    <>
                      <a
                        className="btn btn-secondary btn-sm"
                        href={mailtoUrl(request.requesterEmail, reply.subject, reply.body)}
                      >
                        <Icon name="email" size={14} /> Email the decision
                      </a>
                      <a
                        className="btn btn-secondary btn-sm"
                        href={outlookComposeUrl(request.requesterEmail, reply.subject, reply.body)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Outlook on the web <Icon name="external-link" size={12} />
                      </a>
                    </>
                  )}
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setNote(decision.note);
                      setEditingDecision(true);
                    }}
                  >
                    <Icon name="edit" size={14} /> Change
                  </button>
                </div>
                <p className="muted small">
                  The requester hears by email. The buttons draft it with your message; once the
                  Entra app can send mail, this will go automatically.
                </p>
              </>
            ) : (
              <>
                <label className="field">
                  <span>Message to the requester</span>
                  <textarea
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="A reason, next steps, or anything they should know. Goes in the email."
                  />
                </label>
                <div className="ler-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy !== null}
                    onClick={() => decide("approved")}
                  >
                    <Icon name="checkmark" size={14} /> {busy === "approved" ? "Saving…" : "Approve"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={busy !== null}
                    onClick={() => decide("declined")}
                  >
                    <Icon name="close" size={14} /> {busy === "declined" ? "Saving…" : "Decline"}
                  </button>
                  {decision && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setEditingDecision(false)}
                    >
                      Keep as is
                    </button>
                  )}
                </div>
              </>
            )}
          </section>

          <section className="ler-block">
            <h3>Team notes</h3>
            <label className="field">
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Equipment to book, rehearsal times, reminders. Only the team sees these."
                aria-label="Team notes"
              />
            </label>
            <div className="ler-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={busy !== null || !dirtyNotes}
                onClick={saveNotes}
              >
                {busy === "notes" ? "Saving…" : savedNotes ? "Saved" : "Save notes"}
              </button>
              {request.teamNotesUpdatedAt && (
                <span className="muted small">Last saved {timeAgo(request.teamNotesUpdatedAt)}</span>
              )}
            </div>
          </section>

          <details className="ler-details">
            <summary>Everything the requester told us</summary>
            {sections.map((sec) => (
              <div className="ler-section" key={sec.title}>
                <h4>{sec.title}</h4>
                <dl className="ler-kv">
                  {sec.rows.map((row) => (
                    <div key={row.label}>
                      <dt>{row.label}</dt>
                      <dd>
                        {Array.isArray(row.value)
                          ? row.value.map((v, i) => <div key={i}>{v}</div>)
                          : row.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </details>

          {error && <p className="field-hint warn">{error}</p>}
        </div>

        <footer className="modal-foot ler-foot">
          <button type="button" className="btn btn-ghost btn-sm" onClick={copyBrief}>
            <Icon name="file" size={14} /> {copied ? "Copied" : "Copy as text"}
          </button>
          <button
            type="button"
            className={`btn btn-sm ${armDelete ? "btn-danger" : "btn-ghost"}`}
            disabled={busy === "delete"}
            onClick={remove}
          >
            <Icon name="trash" size={14} /> {armDelete ? "Click again to remove" : "Remove request"}
          </button>
          <span className="muted small ler-ref" title="Reference">
            Ref {request.id}
          </span>
          <button type="button" className="btn btn-secondary" onClick={onClose} style={{ marginLeft: "auto" }}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
