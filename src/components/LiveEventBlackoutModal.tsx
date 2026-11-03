import { useEffect, useMemo, useState } from "react";
import type { LiveEventBlackout, LiveEventRequest } from "../types";
import { formatRequestDateShort } from "../liveEventRequests";
import { Icon } from "./Icon";

export type BlackoutDraft = {
  id?: string;
  start: string;
  end: string;
  reason: string;
};

type Props = {
  // null when adding.
  blackout: LiveEventBlackout | null;
  // The day to start a new period on.
  initialDate: string;
  requests: LiveEventRequest[];
  onSave: (draft: BlackoutDraft) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

// A period the Live Events Team isn't taking bookings for: the form
// refuses dates inside it, and the calendar shades it. Shows which
// events already sit in the period before it's saved.
export function LiveEventBlackoutModal({ blackout, initialDate, requests, onSave, onDelete, onClose }: Props) {
  const [start, setStart] = useState(blackout?.start ?? initialDate);
  const [end, setEnd] = useState(blackout?.end ?? initialDate);
  const [reason, setReason] = useState(blackout?.reason ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [armRemove, setArmRemove] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!armRemove) return;
    const t = setTimeout(() => setArmRemove(false), 4000);
    return () => clearTimeout(t);
  }, [armRemove]);

  const valid = ISO.test(start) && ISO.test(end) && end >= start;

  const inside = useMemo(
    () =>
      valid
        ? requests.filter((r) => r.status !== "declined" && r.eventDate >= start && r.eventDate <= end)
        : [],
    [requests, start, end, valid],
  );

  async function save() {
    if (!valid) return;
    setBusy(true);
    setError("");
    try {
      await onSave({ id: blackout?.id, start, end, reason: reason.trim() });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  async function remove() {
    if (!blackout) return;
    if (!armRemove) {
      setArmRemove(true);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onDelete(blackout.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal ler-blackout-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ler-blackout-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <div>
            <h2 className="modal-title-static" id="ler-blackout-title">
              {blackout ? "No-booking period" : "Block out dates"}
            </h2>
            <div className="modal-sub">
              The request form won't accept a date inside this period, and the calendar shades it.
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="modal-body">
          <div className="ler-form-grid">
            <label className="field">
              <span>From</span>
              <input
                type="date"
                value={start}
                onChange={(e) => {
                  setStart(e.target.value);
                  if (end < e.target.value) setEnd(e.target.value);
                }}
              />
            </label>
            <label className="field">
              <span>To (inclusive)</span>
              <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
              {ISO.test(start) && ISO.test(end) && end < start && (
                <span className="field-hint warn">The end is before the start.</span>
              )}
            </label>
          </div>
          <label className="field">
            <span>Reason (shown to requesters)</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Christmas shutdown, CargoWise Connect, team offsite"
              maxLength={80}
              onKeyDown={(e) => {
                if (e.key === "Enter" && valid && !busy) save();
              }}
            />
          </label>

          {inside.length > 0 && (
            <div className="ler-attn">
              <span className="eyebrow">Already in this period</span>
              <ul>
                {inside.map((r) => (
                  <li key={r.id}>
                    {formatRequestDateShort(r.eventDate)} · {r.eventName || "Untitled event"} ({r.status})
                  </li>
                ))}
              </ul>
              <p className="small" style={{ margin: "6px 0 0" }}>
                These stay as they are; the period only stops new requests choosing these dates.
              </p>
            </div>
          )}

          {error && <p className="field-hint warn">{error}</p>}
        </div>

        <footer className="modal-foot ler-modal-foot">
          <div>
            {blackout && (
              <button
                type="button"
                className={`btn btn-sm ${armRemove ? "btn-danger" : "btn-ghost"}`}
                disabled={busy}
                onClick={remove}
              >
                <Icon name="trash" size={13} /> {armRemove ? "Click again to remove" : "Remove"}
              </button>
            )}
          </div>
          <div className="ler-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={save} disabled={busy || !valid}>
              {busy ? "Saving…" : blackout ? "Save changes" : "Block out"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
