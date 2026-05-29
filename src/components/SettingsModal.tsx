import { useEffect, useState } from "react";
import type { Designer, StorageConfig } from "../types";

type Props = {
  config: StorageConfig;
  currentDesigner: Designer;
  onSaveStorage: (cfg: StorageConfig) => void;
  onChangePin: (newPin: string) => void;
  onClose: () => void;
};

const onlyDigits = (s: string) => s.replace(/\D/g, "");

export function SettingsModal({
  config,
  currentDesigner,
  onSaveStorage,
  onChangePin,
  onClose,
}: Props) {
  const [mode, setMode] = useState<StorageConfig["mode"]>(config.mode);
  const [binId, setBinId] = useState(config.binId ?? "");
  const [apiKey, setApiKey] = useState(config.apiKey ?? "");
  const [accessKey, setAccessKey] = useState(config.accessKey ?? "");
  const [storageSaved, setStorageSaved] = useState(false);

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

  function saveStorage() {
    onSaveStorage({
      mode,
      binId: binId.trim() || undefined,
      apiKey: apiKey.trim() || undefined,
      accessKey: accessKey.trim() || undefined,
    });
    setStorageSaved(true);
    window.setTimeout(() => setStorageSaved(false), 1500);
  }

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
            <h3>Storage</h3>
            <div className="seg">
              <button
                className={mode === "local" ? "seg-on" : ""}
                onClick={() => setMode("local")}
              >
                Browser only
              </button>
              <button
                className={mode === "jsonbin" ? "seg-on" : ""}
                onClick={() => setMode("jsonbin")}
              >
                JSONBin
              </button>
            </div>
            {mode === "local" ? (
              <p className="muted">
                Projects are saved locally in this browser. Good for trying it
                out — switch to JSONBin to share across devices and let the
                Outlook plugin post in.
              </p>
            ) : (
              <>
                <p className="muted">
                  Create a bin at{" "}
                  <a href="https://jsonbin.io" target="_blank" rel="noreferrer">
                    jsonbin.io
                  </a>
                  , then paste its ID and your master key here. The Outlook
                  plugin should POST/PUT to the same bin.
                </p>
                <label className="field">
                  <span>Bin ID</span>
                  <input
                    value={binId}
                    onChange={(e) => setBinId(e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Master key (X-Master-Key)</span>
                  <input
                    value={apiKey}
                    type="password"
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Access key (optional)</span>
                  <input
                    value={accessKey}
                    type="password"
                    onChange={(e) => setAccessKey(e.target.value)}
                  />
                </label>
              </>
            )}
            <div className="section-actions">
              {storageSaved && (
                <span className="muted small">Storage saved</span>
              )}
              <button className="primary" onClick={saveStorage}>
                Save storage
              </button>
            </div>
          </section>

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
