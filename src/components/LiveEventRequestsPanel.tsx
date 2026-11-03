import { useCallback, useMemo, useState } from "react";
import type { Designer, LiveEventBlackout, LiveEventIntake, LiveEventRequest } from "../types";
import { timeAgo, todayIso } from "../dates";
import {
  attentionFlags,
  blackoutsOn,
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
import { LiveEventCalendar } from "./LiveEventCalendar";
import { LiveEventAddModal } from "./LiveEventAddModal";
import { LiveEventBlackoutModal } from "./LiveEventBlackoutModal";
import type { BlackoutDraft } from "./LiveEventBlackoutModal";

type Props = {
  requests: LiveEventRequest[];
  blackouts: LiveEventBlackout[];
  intake: LiveEventIntake;
  currentDesigner: Designer;
  onUpdate: (id: string, patch: Partial<Omit<LiveEventRequest, "id">>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  // An event the team adds themselves, already approved.
  onCreate: (data: Omit<LiveEventRequest, "id">) => Promise<void>;
  onSaveBlackout: (draft: BlackoutDraft) => Promise<void>;
  onDeleteBlackout: (id: string) => Promise<void>;
  blackoutsError?: string;
  // Opens the form's set-up: download, SharePoint link, settings.
  onOpenForm: () => void;
  // localStorage key for the collapsed state; the view sits beside it.
  storageKey: string;
};

type Filter = "pending" | "upcoming" | "declined" | "all";
type View = "list" | "calendar";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "upcoming", label: "Upcoming" },
  { key: "declined", label: "Declined" },
  { key: "all", label: "All" },
];

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable — the choice still holds for this page load.
  }
}

// The Video team's live events, on their board: what has come in from the
// SharePoint form, what's waiting on a decision, and the approved events
// still ahead, as a list or a month calendar. The team can add events of
// their own and block out periods the form won't take bookings for. A
// card or calendar chip opens the request for review.
export function LiveEventRequestsPanel({
  requests,
  blackouts,
  intake,
  currentDesigner,
  onUpdate,
  onDelete,
  onCreate,
  onSaveBlackout,
  onDeleteBlackout,
  blackoutsError,
  onOpenForm,
  storageKey,
}: Props) {
  const today = todayIso();
  const [collapsed, setCollapsedState] = useState(() => readStored(storageKey) === "true");
  function setCollapsed(v: boolean) {
    setCollapsedState(v);
    writeStored(storageKey, String(v));
  }
  const viewKey = `${storageKey}.view`;
  const [view, setViewState] = useState<View>(() => (readStored(viewKey) === "calendar" ? "calendar" : "list"));
  function setView(v: View) {
    setViewState(v);
    writeStored(viewKey, v);
  }
  const [filter, setFilter] = useState<Filter>("pending");
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [blackoutEdit, setBlackoutEdit] = useState<{ blackout: LiveEventBlackout | null; date: string } | null>(
    null,
  );

  const parsed = useMemo(
    () => new Map(requests.map((r) => [r.id, parseSubmission(r.json)])),
    [requests],
  );
  const startTime = useCallback(
    (r: LiveEventRequest) => {
      const s = parsed.get(r.id);
      return s && !s.timeTbc ? s.time : "";
    },
    [parsed],
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
          <h2>Live events</h2>
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
              : `${counts.pending} pending · ${counts.upcoming} upcoming · ${counts.all} in total`}
          </span>
          <div className="filter-quick ler-view" role="group" aria-label="How to show them">
            <button
              type="button"
              className={view === "list" ? "active" : ""}
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
            >
              List
            </button>
            <button
              type="button"
              className={view === "calendar" ? "active" : ""}
              aria-pressed={view === "calendar"}
              onClick={() => setView("calendar")}
            >
              Calendar
            </button>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAdding(today)}>
            <Icon name="calendar" size={14} /> Add event
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onOpenForm}>
            <Icon name="settings" size={14} /> {formReady ? "Request form" : "Set up the form"}
          </button>
        </div>
      </div>

      {!collapsed && view === "calendar" && (
        <LiveEventCalendar
          requests={requests}
          blackouts={blackouts}
          today={today}
          startTime={startTime}
          onOpenRequest={setOpenId}
          onAddEvent={(date) => setAdding(date)}
          onAddBlackout={() => setBlackoutEdit({ blackout: null, date: today })}
          onEditBlackout={(b) => setBlackoutEdit({ blackout: b, date: b.start })}
          blackoutsError={blackoutsError}
        />
      )}

      {!collapsed && view === "list" && (
        <>
          {requests.length === 0 ? (
            <div className="ler-empty">
              <p>
                <strong>No requests yet.</strong>{" "}
                {formReady
                  ? "When someone fills in the Live event request form on SharePoint, it lands here for the team to approve or decline. Events the team runs without a request go on with Add event."
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
                    const blocked = r.status === "pending" ? blackoutsOn(r.eventDate, blackouts)[0] : undefined;
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
                          {blocked && (
                            <span className="ler-bo-tag" title={`No bookings: ${blocked.reason || "blocked out"}`}>
                              No-booking period
                            </span>
                          )}
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
                            {r.source === "team"
                              ? `Added by ${r.createdByName || "the team"}`
                              : r.requesterName || s.name || "Unknown requester"}
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
          blackouts={blackouts}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onClose={() => setOpenId(null)}
        />
      )}

      {adding !== null && (
        <LiveEventAddModal
          initialDate={adding}
          currentDesigner={currentDesigner}
          blackouts={blackouts}
          intake={intake}
          onCreate={onCreate}
          onClose={() => setAdding(null)}
        />
      )}

      {blackoutEdit && (
        <LiveEventBlackoutModal
          blackout={blackoutEdit.blackout}
          initialDate={blackoutEdit.date}
          requests={requests}
          onSave={onSaveBlackout}
          onDelete={onDeleteBlackout}
          onClose={() => setBlackoutEdit(null)}
        />
      )}
    </section>
  );
}
