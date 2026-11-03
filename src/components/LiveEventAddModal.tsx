import { useEffect, useMemo, useState } from "react";
import type { Designer, LiveEventBlackout, LiveEventIntake, LiveEventRequest } from "../types";
import { AUDIENCE, TEAM_EVENT_PRESETS, blackoutRange, blackoutsOn, teamEventJson } from "../liveEventRequests";
import type { TeamEventInput } from "../liveEventRequests";
import { Icon } from "./Icon";

type Props = {
  initialDate: string;
  currentDesigner: Designer;
  blackouts: LiveEventBlackout[];
  // For the regular events' contacts.
  intake: LiveEventIntake;
  onCreate: (data: Omit<LiveEventRequest, "id">) => Promise<void>;
  onClose: () => void;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

// An event the Video team puts on the calendar themselves, without a
// request coming through the form: it's stored as an already-approved
// request, so it lists, reviews and prints like the rest.
export function LiveEventAddModal({ initialDate, currentDesigner, blackouts, intake, onCreate, onClose }: Props) {
  const [v, setV] = useState<TeamEventInput>({
    eventName: "",
    date: initialDate,
    time: "",
    endTime: "",
    room: "",
    audienceType: "",
    inPerson: "",
    online: "",
    forName: "",
    forEmail: "",
    forTeam: "",
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof TeamEventInput>(k: K, val: TeamEventInput[K]) => setV((cur) => ({ ...cur, [k]: val }));

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const inBlackout = useMemo(() => blackoutsOn(v.date, blackouts)[0] ?? null, [v.date, blackouts]);
  const timesOk = !v.time || !v.endTime || v.endTime > v.time;
  const emailOk = !v.forEmail.trim() || /^\S+@\S+\.\S+$/.test(v.forEmail.trim());
  const valid = v.eventName.trim().length > 0 && (v.date === "" || ISO.test(v.date)) && timesOk && emailOk;

  async function save() {
    if (!valid) return;
    setBusy(true);
    setError("");
    const now = new Date().toISOString();
    const input: TeamEventInput = {
      ...v,
      eventName: v.eventName.trim().slice(0, 160),
      forName: v.forName.trim(),
      forEmail: v.forEmail.trim(),
      forTeam: v.forTeam.trim(),
      room: v.room.trim(),
      notes: v.notes.trim(),
    };
    try {
      await onCreate({
        json: teamEventJson(input, currentDesigner, now),
        eventName: input.eventName,
        requesterName: (input.forName || currentDesigner.name).slice(0, 80),
        requesterEmail: input.forEmail.slice(0, 120),
        eventDate: input.date,
        createdAt: now,
        status: "approved",
        intakeToken: "",
        source: "team",
        createdById: currentDesigner.id,
        createdByName: currentDesigner.name,
        decision: {
          status: "approved",
          note: "",
          decidedAt: now,
          decidedById: currentDesigner.id,
          decidedByName: currentDesigner.name,
        },
        ...(input.notes ? { teamNotes: input.notes, teamNotesUpdatedAt: now } : {}),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal ler-add-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ler-add-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <div>
            <h2 className="modal-title-static" id="ler-add-title">
              Add a live event
            </h2>
            <div className="modal-sub">
              Goes straight on the calendar as approved. Anything the form would have asked can be
              added later in team notes.
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="modal-body">
          <div className="ler-presets" role="group" aria-label="Start from a regular event">
            <span className="muted small">Start from</span>
            {TEAM_EVENT_PRESETS.map(({ hint, ...p }) => {
              const contact = intake.presetContacts?.[p.eventName];
              return (
                <button
                  key={p.eventName}
                  type="button"
                  className={`ler-preset ${v.eventName === p.eventName ? "active" : ""}`}
                  title={contact?.name ? `${hint}; ${contact.name} (${p.forTeam})` : hint}
                  aria-pressed={v.eventName === p.eventName}
                  onClick={() =>
                    setV((cur) => ({
                      ...cur,
                      ...p,
                      forName: contact?.name ?? "",
                      forEmail: contact?.email ?? "",
                    }))
                  }
                >
                  {p.eventName}
                </button>
              );
            })}
          </div>
          <label className="field">
            <span>Event name</span>
            <input
              value={v.eventName}
              onChange={(e) => set("eventName", e.target.value)}
              placeholder="e.g. Finance Town Hall"
              maxLength={160}
              autoFocus
            />
          </label>
          <div className="ler-form-grid">
            <label className="field">
              <span>Date</span>
              <input type="date" value={v.date} onChange={(e) => set("date", e.target.value)} />
              <span className={`field-hint ${inBlackout ? "warn" : ""}`}>
                {inBlackout
                  ? `In a no-booking period: ${inBlackout.reason || "no bookings"} (${blackoutRange(inBlackout)}). You can still add it.`
                  : "Leave empty if the date isn't set yet; it then shows in Upcoming but not on the calendar."}
              </span>
            </label>
            <div className="ler-form-grid ler-form-grid-tight">
              <label className="field">
                <span>Start</span>
                <input type="time" value={v.time} onChange={(e) => set("time", e.target.value)} />
              </label>
              <label className="field">
                <span>End</span>
                <input type="time" value={v.endTime} onChange={(e) => set("endTime", e.target.value)} />
                {!timesOk && <span className="field-hint warn">Ends before it starts.</span>}
              </label>
            </div>
            <label className="field">
              <span>Audience</span>
              <select value={v.audienceType} onChange={(e) => set("audienceType", e.target.value)}>
                <option value="">Not decided</option>
                {Object.values(AUDIENCE).map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Room or venue</span>
              <input value={v.room} onChange={(e) => set("room", e.target.value)} placeholder="e.g. Level 3 Town Hall" />
            </label>
            <label className="field">
              <span>In person (expected)</span>
              <input inputMode="numeric" value={v.inPerson} onChange={(e) => set("inPerson", e.target.value.replace(/\D/g, ""))} placeholder="e.g. 120" />
            </label>
            <label className="field">
              <span>Online (expected)</span>
              <input inputMode="numeric" value={v.online} onChange={(e) => set("online", e.target.value.replace(/\D/g, ""))} placeholder="e.g. 400" />
            </label>
          </div>

          <h3 className="ler-sub-h">Who it's for</h3>
          <div className="ler-form-grid">
            <label className="field">
              <span>Contact name</span>
              <input value={v.forName} onChange={(e) => set("forName", e.target.value)} placeholder={currentDesigner.name} />
            </label>
            <label className="field">
              <span>Contact email</span>
              <input value={v.forEmail} onChange={(e) => set("forEmail", e.target.value)} inputMode="email" placeholder="Optional" />
              {!emailOk && <span className="field-hint warn">That email doesn't look right.</span>}
            </label>
            <label className="field">
              <span>Their team</span>
              <input value={v.forTeam} onChange={(e) => set("forTeam", e.target.value)} placeholder="Optional" />
            </label>
          </div>

          <label className="field">
            <span>Team notes</span>
            <textarea
              value={v.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={3}
              placeholder="Setup, presenters, anything the team needs to remember."
            />
          </label>

          {error && <p className="field-hint warn">{error}</p>}
        </div>

        <footer className="modal-foot">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy || !valid}>
            {busy ? "Adding…" : "Add to calendar"}
          </button>
        </footer>
      </div>
    </div>
  );
}
