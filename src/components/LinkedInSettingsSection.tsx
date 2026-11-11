import { useState } from "react";
import {
  canPostAs,
  canReadStats,
  LINKEDIN_REDIRECT_URL,
  linkedInConnectUrl,
  linkedInDisconnect,
  linkedInErrorMessage,
  linkedInSyncNow,
  roleLabel,
  saveLinkedInPages,
  useLinkedIn,
  type LinkedInPageMapping,
} from "../linkedin";

type Props = {
  // Channels in use on the Social calendar, offered when linking a page.
  channels: string[];
};

function day(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.floor((Date.parse(iso) - Date.now()) / 86_400_000);
}

// Settings → LinkedIn, for super users: connect the account Waypoint posts
// and reads statistics as, and say which page each channel goes to.
export function LinkedInSettingsSection({ channels }: Props) {
  const { status, mappings, error } = useLinkedIn(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [newChannel, setNewChannel] = useState("");
  const [newOrgId, setNewOrgId] = useState("");

  const organizations = status?.organizations ?? [];
  const connected = status?.connected === true;

  async function run(key: string, op: () => Promise<string | void>) {
    setBusy(key);
    setNote(null);
    try {
      const text = await op();
      if (text) setNote({ text, bad: false });
    } catch (err) {
      setNote({ text: linkedInErrorMessage(err), bad: true });
    } finally {
      setBusy(null);
    }
  }

  // The tab is opened inside the click so the browser doesn't treat it as a
  // pop-up, then pointed at LinkedIn once the function has answered.
  function connect() {
    const tab = window.open("", "_blank");
    void run("connect", async () => {
      try {
        const url = await linkedInConnectUrl();
        if (tab) {
          tab.opener = null;
          tab.location.href = url;
        } else {
          window.location.href = url;
        }
        return "LinkedIn's sign-in opened in a new tab. This panel updates by itself once it's done.";
      } catch (err) {
        tab?.close();
        throw err;
      }
    });
  }

  function savePages(next: LinkedInPageMapping[]) {
    void run("pages", () => saveLinkedInPages(next));
  }

  function addPage() {
    const channel = newChannel.trim();
    const orgId = newOrgId.trim();
    if (!channel || !/^\d+$/.test(orgId)) return;
    const others = mappings.filter((m) => m.channel.trim().toLowerCase() !== channel.toLowerCase());
    savePages([...others, { channel, orgId }]);
    setNewChannel("");
    setNewOrgId("");
  }

  const accessDays = daysUntil(status?.accessExpiresAt);
  const refreshDays = daysUntil(status?.refreshExpiresAt);
  // With a refresh token the sign-in renews itself until that runs out;
  // without one it ends when the access token does.
  const endsIso = status?.refreshExpiresAt ?? status?.accessExpiresAt;
  const endsInDays = status?.refreshExpiresAt ? refreshDays : accessDays;
  const unlinkedChannels = channels.filter(
    (c) => !mappings.some((m) => m.channel.trim().toLowerCase() === c.trim().toLowerCase()),
  );

  return (
    <section className="modal-section li-settings">
      <h3>LinkedIn</h3>
      <p className="muted small">
        Lets super users publish Social calendar posts straight to a company page, and brings each page's
        followers and post results back into the calendar's Performance tab every night.
      </p>

      {error ? (
        <p className="field-hint warn">
          The LinkedIn status couldn't be read ({error}). The Firestore rules for the LinkedIn collections
          probably haven't been deployed yet.
        </p>
      ) : status === null ? (
        <p className="muted small">Checking the connection…</p>
      ) : connected ? (
        <>
          <p className="muted small">
            Connected as <strong>{status.memberName}</strong>
            {status.connectedByName ? ` by ${status.connectedByName}` : ""}
            {status.connectedAt ? ` on ${day(status.connectedAt)}` : ""}.{" "}
            {endsIso &&
              (status.refreshExpiresAt
                ? `Renews itself until ${day(endsIso)}, then someone has to connect again.`
                : `LinkedIn's sign-in lasts until ${day(endsIso)}, then someone has to connect again.`)}
          </p>
          {endsInDays !== null && endsInDays <= 14 && (
            <p className="field-hint warn">
              {endsInDays < 0
                ? "The LinkedIn sign-in has expired. Reconnect to keep publishing and statistics working."
                : `The LinkedIn sign-in ends in ${endsInDays} day${endsInDays === 1 ? "" : "s"}. Reconnect before then.`}
            </p>
          )}
          {organizations.length === 0 ? (
            <p className="field-hint warn">
              {status.memberName} doesn't have a role on any LinkedIn page, so there's nothing to post to.
              Someone who administers the page needs to connect instead.
            </p>
          ) : (
            <ul className="li-orgs">
              {organizations.map((o) => (
                <li key={o.id}>
                  <strong>{o.name}</strong>
                  <span className="li-org-id">{o.id}</span>
                  <span>{o.roles.map(roleLabel).join(", ")}</span>
                  <span className="muted">
                    {canPostAs(o) ? "can post" : "can't post"} ·{" "}
                    {canReadStats(o) ? "statistics available" : "no statistics (Super admin only)"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          <p className="muted small">
            Not connected. Whoever connects needs to be a Super admin of the page on LinkedIn (a Content
            admin can post, but LinkedIn only gives statistics to Super admins). Waypoint then acts as them.
          </p>
          <p className="muted small">
            Before the first connection, the LinkedIn app needs this address under Auth → OAuth 2.0 settings
            → Authorized redirect URLs:
            <code className="li-redirect">{LINKEDIN_REDIRECT_URL}</code>
          </p>
        </>
      )}

      {!error && status !== null && (
        <>
          <h4 className="li-subhead">Channels and pages</h4>
          {mappings.length === 0 ? (
            <p className="muted small">No channel is linked to a page yet.</p>
          ) : (
            <ul className="li-mappings">
              {mappings.map((m) => {
                const org = organizations.find((o) => o.id === m.orgId);
                return (
                  <li key={`${m.channel}:${m.orgId}`}>
                    <span>
                      <strong>{m.channel}</strong> posts to{" "}
                      {org ? `${org.name} (${m.orgId})` : `page ${m.orgId}`}
                    </span>
                    {connected && !org && (
                      <span className="field-hint warn">the connected account has no role on it</span>
                    )}
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => savePages(mappings.filter((x) => x !== m))}
                      disabled={busy !== null}
                    >
                      Unlink
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="li-add">
            <input
              list="li-channel-options"
              value={newChannel}
              onChange={(e) => setNewChannel(e.target.value)}
              placeholder="Channel, e.g. WiseTech"
              aria-label="Channel"
            />
            <datalist id="li-channel-options">
              {unlinkedChannels.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            {organizations.length > 0 ? (
              <select value={newOrgId} onChange={(e) => setNewOrgId(e.target.value)} aria-label="LinkedIn page">
                <option value="">LinkedIn page…</option>
                {organizations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} ({o.id})
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={newOrgId}
                onChange={(e) => setNewOrgId(e.target.value.replace(/\D/g, ""))}
                placeholder="Page ID, e.g. 19179877"
                inputMode="numeric"
                aria-label="LinkedIn page ID"
              />
            )}
            <button
              type="button"
              className="btn-mini"
              onClick={addPage}
              disabled={busy !== null || !newChannel.trim() || !/^\d+$/.test(newOrgId)}
            >
              Link
            </button>
          </div>
          <p className="field-hint">
            The page ID is the number in the page's admin address: linkedin.com/company/<strong>19179877</strong>/admin.
          </p>

          {connected && (
            <p className="muted small">
              {status.lastSyncAt
                ? `Statistics last read ${new Date(status.lastSyncAt).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}${status.lastSyncPosts !== undefined ? `, ${status.lastSyncPosts} posts` : ""}.`
                : "Statistics haven't been read yet. They run every night at 3am Sydney time, or now."}
            </p>
          )}
          {connected && status.lastSyncError && <p className="field-hint warn">{status.lastSyncError}</p>}
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
              <span className="delete-confirm-prompt">Stop Waypoint using LinkedIn?</span>
              <button
                className="danger"
                disabled={busy !== null}
                onClick={() => {
                  setConfirmingDisconnect(false);
                  void run("disconnect", async () => {
                    await linkedInDisconnect();
                    return "Disconnected. The numbers already read stay where they are.";
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
                  <button className="btn btn-secondary" disabled={busy !== null} onClick={() => setConfirmingDisconnect(true)}>
                    Disconnect
                  </button>
                  <button
                    className="btn btn-secondary"
                    disabled={busy !== null}
                    onClick={() =>
                      void run("sync", async () => {
                        const r = await linkedInSyncNow();
                        return [
                          `Read ${r.posts} post${r.posts === 1 ? "" : "s"} from ${r.pages} page${r.pages === 1 ? "" : "s"}.`,
                          r.linked > 0 ? `${r.linked} newly matched to calendar posts.` : "",
                          ...r.warnings,
                        ]
                          .filter(Boolean)
                          .join(" ");
                      })
                    }
                  >
                    {busy === "sync" ? "Reading LinkedIn…" : "Read statistics now"}
                  </button>
                </>
              )}
              <button className="primary" disabled={busy !== null} onClick={connect}>
                {busy === "connect" ? "Opening LinkedIn…" : connected ? "Reconnect" : "Connect LinkedIn"}
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
