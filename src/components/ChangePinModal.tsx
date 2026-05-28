import { useEffect, useState } from "react";
import type { Designer } from "../types";

type Props = {
  designer: Designer;
  onCancel: () => void;
  onSave: (newPin: string) => void;
};

export function ChangePinModal({ designer, onCancel, onSave }: Props) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  function submit() {
    if (current !== designer.pin) {
      setError("Current PIN is incorrect.");
      return;
    }
    if (next.length < 4) {
      setError("New PIN must be at least 4 digits.");
      return;
    }
    if (next !== confirm) {
      setError("New PIN and confirmation don't match.");
      return;
    }
    onSave(next);
  }

  const onlyDigits = (s: string) => s.replace(/\D/g, "");

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal modal-narrow" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2 className="modal-title-static">Change PIN</h2>
          <button className="icon-btn" onClick={onCancel} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="modal-body">
          <label className="field">
            <span>Current PIN</span>
            <input
              type="password"
              inputMode="numeric"
              value={current}
              onChange={(e) => {
                setCurrent(onlyDigits(e.target.value));
                setError(null);
              }}
              autoFocus
            />
          </label>
          <label className="field">
            <span>New PIN</span>
            <input
              type="password"
              inputMode="numeric"
              value={next}
              onChange={(e) => {
                setNext(onlyDigits(e.target.value));
                setError(null);
              }}
            />
          </label>
          <label className="field">
            <span>Confirm new PIN</span>
            <input
              type="password"
              inputMode="numeric"
              value={confirm}
              onChange={(e) => {
                setConfirm(onlyDigits(e.target.value));
                setError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </label>
          {error && <p className="login-error">{error}</p>}
        </div>
        <footer className="modal-foot">
          <button onClick={onCancel}>Cancel</button>
          <button className="primary" onClick={submit}>
            Save PIN
          </button>
        </footer>
      </div>
    </div>
  );
}
