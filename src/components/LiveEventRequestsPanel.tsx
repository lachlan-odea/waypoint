import { useMemo, useState } from "react";
import type { Designer, LiveEventIntake, LiveEventRequest } from "../types";
import { timeAgo, todayIso } from "../dates";
import {
  attentionFlags,
  parseSubmission,
  requestIsUpcoming,
  requestStatusLabel,
  requestStatusTone,
  setupSummary,
  sortRequests,
  submissionDateLabel,
  submissionTimeLabel,
  whereLabel,
} from "../liveEventRequests";
import { Icon } from "./Icon";
import { LiveEventRequestModal } from "./LiveEventRequestModal";

type Props = {
  requests: LiveEventRequest[];
  intake: LiveEventIntake;
  currentDesigner: Designer;
  onUpdate: (id: string, patch: Partial<Omit<LiveEventRequest, "id">>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  // Opens the form's set-up: download, SharePoint link, settings.
  onOpenForm: () => void;
  // localStorage key for the collapsed state.
  storageKey: string;
};

type Filter = "pending" | "upcoming" | "declined" | "all";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "upcoming", label: "Upcoming" },
  { key: "declined", label: "Declined" },
  { key: "all", label: "All" },
];

// The Video team's inbox for live event requests, on their board: what has
// come in from the SharePoint form, what's waiting on a decision, and the
// approved events still ahead, which doubles as the team's schedule. A
// card opens the request for review.
export function LiveEventRequestsPanel({
  requests,
  intake,
  currentDesigner,
  onUpdate,
  onDelete,
  onOpenForm,
  storageKey,
}: Props) {
  const today = todayIso();
  const [collapsed, setCollapsedState] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === "true";
    } catch {
      return false;
    }
  });
  function setCollapsed(v: boolean) {
    setCollapsedState(v);
    try {
      localStorage.setItem(storageKey, String(v));
    } catch {
      // Storage unavailable — the toggle still works for this page load.
    }
  }
  const [filter, setFilter] = useState<Filter>("pending");
  const [openId, setOpenId] = useState<string | null>(null);

  const parsed = useMemo(
    () => new Map(requests.map((r) => [r.id, parseSubmission(r.json)])),
    [requests],
  );

  const counts = useMemo(
    () => ({
      pending: requests.filter((r) => r.status === "pending").length,
      upcoming: requests.filter((r) => requestIsUpcoming(r, today)).length,
      declined: requests.filter((r) => r.status === "declined").length,
      all: requests.length,
    }),
    [requests, today],
  );

  const shown = useMemo(() => {
    const list = requests.filter((r) => {
      switch (filter) {
        case "pending":
          return r.status === "pending";
        case "upcoming":
          return requestIsUpcoming(r, today);
        case "declined":
          return r.status === "declined";
        default:
          return true;
      }
    });
    if (filter === "upcoming") {
      return list.slice().sort((a, b) => (a.eventDate || "9999").localeCompare(b.eventDate || "9999"));
    }
    return sortRequests(list);
  }, [requests, filter, today]);

  const open = openId ? requests.find((r) => r.id === openId) ?? null : null;
  const formReady = !!intake.token;

  return (
    <section className="workspace-section ler-panel">
      <div className="section-head">
        <div className="section-head-title">
          <button
            className="collapse-toggle"
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? "Expand" : "Collapse"}
            aria-expanded={!collapsed}
          >
            <span className={`collapse-icon ${collapsed ? "" : "expanded"}`}>▶</span>
          </button>
          <h2>Live event requests</h2>
          {counts.pending > 0 && (
            <span className="ler-pending-badge" title={`${counts.pending} waiting on a decision`}>
              {counts.pending}
            </span>
          )}
        </div>
        <div className="ler-head-right">
          <span className="muted small">
            {counts.all === 0
              ? "nothing in yet"
              : `${counts.pending} pending · ${counts.upcoming} upcoming · ${counts.all} in total`}{" "}
            · from the request form on SharePoint
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onOpenForm}>
            <Icon name="settings" size={14} /> {formReady ? "Request form" : "Set up the form"}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {requests.length === 0 ? (
            <div className="ler-empty">
              <p>
                <strong>No requests yet.</strong>{" "}
                {formReady
                  ? "When someone fills in the Live event request form on SharePoint, it lands here for the team to approve or decline."
                  : "Download the Live event request form, put it on SharePoint, and every request people fill in lands here for the team to approve or decline."}
              </p>
              {!formReady && (
                <button type="button" className="btn btn-primary btn-sm" onClick={onOpenForm}>
                  Set up the form
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="filter-quick ler-filters" role="group" aria-label="Which requests">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    className={filter === f.key ? "active" : ""}
                    aria-pressed={filter === f.key}
                    onClick={() => setFilter(f.key)}
                  >
                    {f.label} <span className="ler-filter-n">{counts[f.key]}</span>
                  </button>
                ))}
              </div>

              {shown.length === 0 ? (
                <p className="muted small ler-none">
                  {filter === "pending"
                    ? "Nothing waiting on a decision."
                    : filter === "upcoming"
                      ? "No approved events coming up."
                      : filter === "declined"
                        ? "Nothing declined."
                        : "Nothing here."}
                </p>
              ) : (
                <div className="ler-list">
                  {shown.map((r) => {
                    const s = parsed.get(r.id) ?? parseSubmission(r.json);
                    const flags = attentionFlags(s);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        className={`ler-card ${r.status}`}
                        onClick={() => setOpenId(r.id)}
                      >
                        <div className="ler-card-top">
                          <span className="ler-card-name">{r.eventName || "Untitled event"}</span>
                          <span className={`soc-status wp-status ${requestStatusTone(r.status)}`}>
                            {requestStatusLabel(r.status)}
                          </span>
                        </div>
                        <div className="ler-card-when">
                          <Icon name="calendar" size={13} /> {submissionDateLabel(s, true)}
                          <span className="muted"> · {submissionTimeLabel(s)}</span>
                        </div>
                        <div className="ler-card-meta muted small">
                          {whereLabel(s)}
                          {s.inPerson || s.online
                            ? ` · ${[s.inPerson && `${s.inPerson} in person`, s.online && `${s.online} online`].filter(Boolean).join(", ")}`
                            : ""}
                        </div>
                        {filter === "upcoming" ? (
                          <div className="ler-card-setup small">{setupSummary(s)}</div>
                        ) : null}
                        <div className="ler-card-foot muted small">
                          <span>
                            {r.requesterName || s.name || "Unknown requester"}
                            {s.team ? ` · ${s.team}` : ""}
                          </span>
                          <span>
                            {flags.length > 0 && (
                              <span className="ler-flags" title={flags.join("\n")}>
                                <Icon name="flag" size={12} /> {flags.length}
                              </span>
                            )}
                            {r.teamNotes ? <span title="Has team notes"> 📝</span> : null}
                            {r.createdAt ? ` · ${timeAgo(r.createdAt)}` : ""}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </>
      )}

      {open && (
        <LiveEventRequestModal
          request={open}
          currentDesigner={currentDesigner}
          intake={intake}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onClose={() => setOpenId(null)}
        />
      )}
    </section>
  );
}
