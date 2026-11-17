import { useEffect, useMemo, useState } from "react";
import type { AccessRequest, Designer } from "../types";
import { Icon } from "./Icon";

type Props = {
  requests: AccessRequest[];
  // Everyone in /designers, for linking a request to a profile set up in
  // advance (a placeholder from Manage users, or an old seed profile).
  designers: Designer[];
  onApprove: (request: AccessRequest, linkProfileId?: string) => Promise<void>;
  onDecline: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
};

const STATUS_LABELS: Record<AccessRequest["status"], string> = {
  pending: "Waiting",
  approved: "Approved",
  declined: "Declined",
};

function when(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

// A profile that isn't anyone's account yet, so a request can take it over.
function isUnclaimedProfile(d: Designer): boolean {
  return d.id.startsWith("placeholder-") || d.id.startsWith("d-");
}

// Super-user review of who has asked to join Waypoint. Approving creates
// the person's profile (or hands them a placeholder's, with its projects,
// teams and roles), which is what lets them in; declining keeps the
// request so they see the answer; removing it lets them ask again.
export function AccessRequestsModal({
  requests,
  designers,
  onApprove,
  onDecline,
  onDelete,
  onClose,
}: Props) {
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Which profile each request will be linked to, by request id. "" means
  // a new profile; a missing entry means the suggested one (see linkFor).
  const [links, setLinks] = useState<Record<string, string>>({});

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const unclaimed = useMemo(
    () => designers.filter(isUnclaimedProfile).sort((a, b) => a.name.localeCompare(b.name)),
    [designers],
  );
  const sorted = useMemo(
    () => requests.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [requests],
  );
  const pendingCount = sorted.filter((r) => r.status === "pending").length;
  const shown = filter === "pending" ? sorted.filter((r) => r.status === "pending") : sorted;

  // A placeholder set up with the same email is almost certainly them.
  function linkFor(r: AccessRequest): string {
    if (r.id in links) return links[r.id];
    const match = unclaimed.find((d) => d.email?.toLowerCase() === r.email.toLowerCase());
    return match?.id ?? "";
  }

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

  function approve(r: AccessRequest) {
    const link = linkFor(r);
    const linked = unclaimed.find((d) => d.id === link);
    const ok = window.confirm(
      linked
        ? `Let ${r.name} (${r.email}) into Waypoint as "${linked.name}"? They take over that profile's projects, teams and roles.`
        : `Let ${r.name} (${r.email}) into Waypoint with a new profile? They'll see everything a team member sees.`,
    );
    if (!ok) return;
    void run(r.id, () => onApprove(r, link || undefined));
  }

  function decline(r: AccessRequest) {
    const ok = window.confirm(`Decline ${r.name}'s request? They'll see that it wasn't approved.`);
    if (!ok) return;
    void run(r.id, () => onDecline(r.id));
  }

  function remove(r: AccessRequest) {
    const ok = window.confirm(
      `Remove ${r.name}'s request? ${r.status === "approved" ? "Their access stays as it is; this only clears the record." : "They'll be able to ask again."}`,
    );
    if (!ok) return;
    void run(r.id, () => onDelete(r.id));
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <header className="modal-head">
          <h2 className="modal-title-static">Access requests</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="modal-body">
          <p className="muted small">
            People who've asked to join Waypoint from the sign-in page. Each one has verified
            their email address. Approving lets them in straight away; to take someone's access
            away later, delete their profile in Manage users.
          </p>

          <div className="seg suggestions-seg">
            <button
              className={filter === "pending" ? "seg-on" : ""}
              onClick={() => setFilter("pending")}
            >
              Waiting ({pendingCount})
            </button>
            <button className={filter === "all" ? "seg-on" : ""} onClick={() => setFilter("all")}>
              All ({sorted.length})
            </button>
          </div>

          {error && <p className="login-error">{error}</p>}

          {shown.length === 0 ? (
            <p className="muted small suggestions-empty">
              {filter === "pending" ? "Nobody is waiting." : "Nobody has asked for access yet."}
            </p>
          ) : (
            <ul className="suggestions-list">
              {shown.map((r) => {
                const busy = busyId === r.id;
                const pending = r.status === "pending";
                return (
                  <li key={r.id} className="suggestion-row open">
                    <div className="suggestion-summary access-request-summary">
                      <span className="suggestion-title">{r.name}</span>
                      <span className="suggestion-meta muted small">
                        {[r.email, when(r.createdAt)].filter(Boolean).join(" · ")}
                      </span>
                      <span className={`suggestion-status access-status-${r.status}`}>
                        {STATUS_LABELS[r.status] ?? r.status}
                      </span>
                    </div>
                    <div className="suggestion-detail">
                      {pending ? (
                        <label className="field">
                          <span>Profile</span>
                          <select
                            value={linkFor(r)}
                            disabled={busy}
                            onChange={(e) => setLinks((cur) => ({ ...cur, [r.id]: e.target.value }))}
                          >
                            <option value="">New profile, named {r.name}</option>
                            {unclaimed.map((d) => (
                              <option key={d.id} value={d.id}>
                                Take over {d.name}
                                {d.email ? ` (${d.email})` : ""}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <p className="muted small">
                          {STATUS_LABELS[r.status]}
                          {r.decidedByName ? ` by ${r.decidedByName}` : ""}
                          {r.decidedAt ? ` on ${when(r.decidedAt)}` : ""}.
                        </p>
                      )}
                      <div className="suggestion-controls">
                        {pending && (
                          <div className="access-request-decide">
                            <button
                              className="btn btn-primary"
                              onClick={() => approve(r)}
                              disabled={busy}
                            >
                              {busy ? "Working…" : "Approve"}
                            </button>
                            <button
                              className="btn btn-secondary"
                              onClick={() => decline(r)}
                              disabled={busy}
                            >
                              Decline
                            </button>
                          </div>
                        )}
                        <button
                          className="btn btn-secondary suggestion-remove access-request-remove"
                          onClick={() => remove(r)}
                          disabled={busy}
                          title="Remove this request"
                        >
                          <Icon name="trash" size={14} /> Remove
                        </button>
                      </div>
                    </div>
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
