import { useEffect, useState } from "react";
import type { StorageConfig } from "../types";

type Props = {
  config: StorageConfig;
  onSave: (cfg: StorageConfig) => void;
  onCancel: () => void;
};

export function SettingsModal({ config, onSave, onCancel }: Props) {
  const [mode, setMode] = useState<StorageConfig["mode"]>(config.mode);
  const [binId, setBinId] = useState(config.binId ?? "");
  const [apiKey, setApiKey] = useState(config.apiKey ?? "");
  const [accessKey, setAccessKey] = useState(config.accessKey ?? "");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  function submit() {
    onSave({
      mode,
      binId: binId.trim() || undefined,
      apiKey: apiKey.trim() || undefined,
      accessKey: accessKey.trim() || undefined,
    });
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal modal-narrow" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2 className="modal-title-static">Storage</h2>
          <button className="icon-btn" onClick={onCancel} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="modal-body">
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
              Projects are saved locally in this browser. Good for trying it out — switch
              to JSONBin to share across devices and let the Outlook plugin post in.
            </p>
          ) : (
            <>
              <p className="muted">
                Create a bin at <a href="https://jsonbin.io" target="_blank" rel="noreferrer">jsonbin.io</a>,
                then paste its ID and your master key here. The Outlook plugin should
                POST/PUT to the same bin.
              </p>
              <label className="field">
                <span>Bin ID</span>
                <input value={binId} onChange={(e) => setBinId(e.target.value)} />
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
        </div>
        <footer className="modal-foot">
          <button onClick={onCancel}>Cancel</button>
          <button className="primary" onClick={submit}>
            Save
          </button>
        </footer>
      </div>
    </div>
  );
}
