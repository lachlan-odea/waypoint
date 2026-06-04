import { useEffect, useState } from "react";
import type { Designer } from "../types";

type Props = {
  currentDesigner: Designer;
  onChangePin: (newPin: string) => void;
  onClose: () => void;
};

const onlyDigits = (s: string) => s.replace(/\D/g, "");

export function SettingsModal({
  currentDesigner,
  onChangePin,
  onClose,
}: Props) {
  const [currentPin, setCurrentPin] = useState("");
  const [nextPin, setNextPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSaved, setPinSaved] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function savePin() {
    if (currentPin !== currentDesigner.pin) {
      setPinError("Current PIN is incorrect.");
      return;
    }
    if (nextPin.length < 4) {
      setPinError("New PIN must be at least 4 digits.");
      return;
    }
    if (nextPin !== confirmPin) {
      setPinError("New PIN and confirmation don't match.");
      return;
    }
    onChangePin(nextPin);
    setPinError(null);
    setCurrentPin("");
    setNextPin("");
    setConfirmPin("");
    setPinSaved(true);
    window.setTimeout(() => setPinSaved(false), 1500);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-narrow" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2 className="modal-title-static">Settings</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="modal-body">
          <section className="modal-section">
            <h3>Change PIN</h3>
            <label className="field">
              <span>Current PIN</span>
              <input
                type="password"
                inputMode="numeric"
                value={currentPin}
                onChange={(e) => {
                  setCurrentPin(onlyDigits(e.target.value));
                  setPinError(null);
                }}
              />
            </label>
            <label className="field">
              <span>New PIN</span>
              <input
                type="password"
                inputMode="numeric"
                value={nextPin}
                onChange={(e) => {
                  setNextPin(onlyDigits(e.target.value));
                  setPinError(null);
                }}
              />
            </label>
            <label className="field">
              <span>Confirm new PIN</span>
              <input
                type="password"
                inputMode="numeric"
                value={confirmPin}
                onChange={(e) => {
                  setConfirmPin(onlyDigits(e.target.value));
                  setPinError(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && savePin()}
              />
            </label>
            {pinError && <p className="login-error">{pinError}</p>}
            <div className="section-actions">
              {pinSaved && <span className="muted small">PIN updated</span>}
              <button className="primary" onClick={savePin}>
                Save PIN
              </button>
            </div>
          </section>
        </div>

        <footer className="modal-foot">
          <button onClick={onClose}>Close</button>
        </footer>
      </div>
    </div>
  );
}
