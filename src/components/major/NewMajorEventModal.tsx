import { useEffect, useState } from "react";
import type { Designer, MarketingEvent } from "../../types";
import { EVENT_DIVISIONS } from "../../events";
import { MAJOR_EVENT_LABEL, MAJOR_OUTLINE, emptyMajorKit, newMajorEvent } from "../../majorEvent";
import { schedule } from "../../webinarKit";
import { formatShort, todayIso } from "../../dates";
import { Icon } from "../Icon";

// Start a WiseTech Global Major Event: an event with the Major Event
// Workflow attached. The event's dates set every section's due date,
// previewed below the form.

type Props = {
  designers: Designer[];
  currentDesignerId: string;
  onCancel: () => void;
  onCreate: (event: MarketingEvent) => void;
};

const DIVISIONS = ["WiseTech Global", ...EVENT_DIVISIONS];

export function NewMajorEventModal({ designers, currentDesignerId, onCancel, onCreate }: Props) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [location, setLocation] = useState("");
  const [division, setDivision] = useState(DIVISIONS[0]);
  const [lead, setLead] = useState(currentDesignerId);
  const [inPerson, setInPerson] = useState("400");
  const [online, setOnline] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const today = todayIso();
  const end = startDate && endDate >= startDate ? endDate : startDate;
  const sch = startDate ? schedule(emptyMajorKit({ goLive: startDate, end }), MAJOR_OUTLINE) : null;
  const late = sch ? MAJOR_OUTLINE.sections.filter((s) => sch[s.k].due && sch[s.k].due < today) : [];

  function create() {
    if (!name.trim()) {
      setError("Give the event a name.");
      return;
    }
    onCreate(
      newMajorEvent({
        name,
        startDate,
        endDate: end,
        location,
        division,
        lead: lead || undefined,
        leadName: designers.find((d) => d.id === lead)?.name,
        inPerson: Number(inPerson) > 0 ? Number(inPerson) : undefined,
        online: Number(online) > 0 ? Number(online) : undefined,
        by: currentDesignerId,
      }),
    );
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="nm-title">
        <header className="modal-head">
          <div>
            <h2 className="modal-title-static" id="nm-title">
              Start a major event
            </h2>
            <div className="modal-sub">A {MAJOR_EVENT_LABEL}, planned through the Major Event Workflow</div>
          </div>
          <button className="icon-btn" onClick={onCancel} aria-label="Close" type="button">
            <Icon name="close" size={16} />
          </button>
        </header>
        <div className="modal-body">
          <div className="kit-fields">
            <div className="kit-field">
              <label htmlFor="nm-name">Event name</label>
              <input id="nm-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" autoFocus />
            </div>
            <div className="kit-field half">
              <label htmlFor="nm-start">First day</label>
              <input
                id="nm-start"
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (!endDate || endDate < e.target.value) setEndDate(e.target.value);
                }}
              />
              <span className="kit-hint">Leave blank while the date is to be confirmed.</span>
            </div>
            <div className="kit-field half">
              <label htmlFor="nm-end">Last day</label>
              <input id="nm-end" type="date" value={endDate} min={startDate || undefined} disabled={!startDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="kit-field half">
              <label htmlFor="nm-venue">Venue</label>
              <input id="nm-venue" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Venue and city, if known" autoComplete="off" />
            </div>
            <div className="kit-field half">
              <label htmlFor="nm-division">Hosted by</label>
              <select id="nm-division" value={division} onChange={(e) => setDivision(e.target.value)}>
                {DIVISIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div className="kit-field half">
              <label htmlFor="nm-lead">Event Lead</label>
              <select id="nm-lead" value={lead} onChange={(e) => setLead(e.target.value)}>
                <option value="">Choose lead</option>
                {designers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="kit-field half">
              <label htmlFor="nm-guests">In-person guests</label>
              <input id="nm-guests" type="number" min={0} step={1} inputMode="numeric" value={inPerson} onChange={(e) => setInPerson(e.target.value)} />
              <span className="kit-hint">Guests only. Speakers, staff and suppliers are counted separately.</span>
            </div>
            <div className="kit-field half">
              <label htmlFor="nm-online">Online viewing target</label>
              <input id="nm-online" type="number" min={0} step={1} inputMode="numeric" value={online} onChange={(e) => setOnline(e.target.value)} />
            </div>
          </div>
          <div className="kit-field">
            <span className="kit-flabel">Workflow schedule</span>
            {!sch ? (
              <span className="kit-hint">Choose the first day to preview when each section is due.</span>
            ) : (
              <div className="item-stack">
                {late.length > 0 && (
                  <div className="kit-warnbox">
                    {late.length} {late.length === 1 ? "section is" : "sections are"} already past due with this date. The workflow starts planning 12 to 16 weeks out. You can still create the event and change dates in each section.
                  </div>
                )}
                <div className="kit-preview">
                  {MAJOR_OUTLINE.sections.map((s) => (
                    <div key={s.k} className="kit-preview-row">
                      <span className="kit-pn">{String(s.n).padStart(2, "0")}</span>
                      <span>{s.title}</span>
                      <span className={`kit-pd ${sch[s.k].due && sch[s.k].due < today ? "late" : ""}`}>{sch[s.k].due ? formatShort(sch[s.k].due) : "—"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          {error && <p className="login-error">{error}</p>}
        </div>
        <footer className="modal-foot">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={create}>
            Create major event
          </button>
        </footer>
      </div>
    </div>
  );
}
