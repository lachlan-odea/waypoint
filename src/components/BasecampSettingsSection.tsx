import { useState } from "react";
import {
  BASECAMP_REDIRECT_URL,
  basecampConnectUrl,
  basecampDisconnect,
  basecampErrorMessage,
  basecampSyncNow,
  formatSyncTime,
  syncSummaryText,
  useBasecampStatus,
} from "../basecamp";

function day(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

// Settings → Basecamp, for super users: connect the account Waypoint reads
// the other team's projects from and creates switched-on projects in, and
// pull from it by hand when the hourly sync isn't soon enough.
export function BasecampSettingsSection() {
  const { status, error } = useBasecampStatus();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

  const connected = status?.connected === true;

  async function run(key: string, op: () => Promise<string | void>) {
    setBusy(key);
    setNote(null);
    try {
      const text = await op();
      if (text) setNote({ text, bad: false });
    } catch (err) {
      setNote({ text: basecampErrorMessage(err), bad: true });
    } finally {
      setBusy(null);
    }
  }

  // The tab is opened inside the click so the browser doesn't treat it as a
  // pop-up, then pointed at Basecamp once the function has answered.
  function connect() {
    const tab = window.open("", "_blank");
    void run("connect", async () => {
      try {
        const url = await basecampConnectUrl();
        if (tab) {
          tab.opener = null;
          tab.location.href = url;
        } else {
          window.location.href = url;
        }
        return "Basecamp's sign-in opened in a new tab. This panel updates by itself once it's done.";
      } catch (err) {
        tab?.close();
        throw err;
      }
    });
  }

  return (
    <section className="modal-section li-settings">
      <h3>Basecamp</h3>
      <p className="muted small">
        Shows the projects in the team's Basecamp account in the Basecamp view, refreshed every hour, and
        creates a Basecamp project for any Waypoint project with Sync to Basecamp switched on.
      </p>

      {error ? (
        <p className="field-hint warn">
          The Basecamp status couldn't be read ({error}). The Firestore rules for the Basecamp collections
          probably haven't been deployed yet.
        </p>
      ) : status === null ? (
        <p className="muted small">Checking the connection…</p>
      ) : connected ? (
        <>
          <p className="muted small">
            Connected as <strong>{status.identityName}</strong>
            {status.accountName ? (
              <>
                {" "}
                in <strong>{status.accountName}</strong>
              </>
            ) : null}
            {status.connectedByName ? ` by ${status.connectedByName}` : ""}
            {status.connectedAt ? ` on ${day(status.connectedAt)}` : ""}. Waypoint sees, creates and renames
            projects as them, and the sign-in renews itself.
          </p>
          <p className="muted small">
            {status.lastSyncAt
              ? `Last read ${formatSyncTime(status.lastSyncAt)}${
                  status.lastSyncProjects !== undefined
                    ? `, ${status.lastSyncProjects} project${status.lastSyncProjects === 1 ? "" : "s"}`
                    : ""
                }. Runs every hour, or now.`
              : "Basecamp hasn't been read yet. It runs every hour, or now."}
          </p>
          {status.lastSyncError && <p className="field-hint warn">{status.lastSyncError}</p>}
        </>
      ) : (
        <>
          <p className="muted small">
            Not connected. Whoever connects needs to be able to create projects in the team's Basecamp
            account, and should be someone who'll stay on it: Waypoint then acts as them.
          </p>
          <p className="muted small">
            Before the first connection, the integration registered at launchpad.37signals.com/integrations
            needs this as its redirect URI:
            <code className="li-redirect">{BASECAMP_REDIRECT_URL}</code>
          </p>
        </>
      )}

      {note && (
        <p className={note.bad ? "soc-publish-error" : "soc-publish-note"} role={note.bad ? "alert" : "status"}>
          {note.text}
        </p>
      )}

      {!error && status !== null && (
        <div className="section-actions">
          {connected && confirmingDisconnect ? (
            <>
              <span className="delete-confirm-prompt">Stop Waypoint using Basecamp?</span>
              <button
                className="danger"
                disabled={busy !== null}
                onClick={() => {
                  setConfirmingDisconnect(false);
                  void run("disconnect", async () => {
                    await basecampDisconnect();
                    return "Disconnected. Projects already in Basecamp, and the ones already read, stay where they are.";
                  });
                }}
              >
                Yes, disconnect
              </button>
              <button onClick={() => setConfirmingDisconnect(false)}>Keep</button>
            </>
          ) : (
            <>
              {connected && (
                <>
                  <button
                    className="btn btn-secondary"
                    disabled={busy !== null}
                    onClick={() => setConfirmingDisconnect(true)}
                  >
                    Disconnect
                  </button>
                  <button
                    className="btn btn-secondary"
                    disabled={busy !== null}
                    onClick={() => void run("sync", async () => syncSummaryText(await basecampSyncNow()))}
                  >
                    {busy === "sync" ? "Reading Basecamp…" : "Sync now"}
                  </button>
                </>
              )}
              <button className="primary" disabled={busy !== null} onClick={connect}>
                {busy === "connect" ? "Opening Basecamp…" : connected ? "Reconnect" : "Connect Basecamp"}
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
