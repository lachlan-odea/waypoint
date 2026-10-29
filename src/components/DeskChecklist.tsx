import { useMemo, useState } from "react";
import type { DeskItem, Project } from "../types";
import {
  countdownLabel,
  daysSince,
  formatShort,
  shiftIso,
  todayIso,
} from "../dates";

// Completed items linger for a fortnight so you can see what you got through
// last week, then MyDesk's housekeeping deletes them.
export const KEEP_COMPLETED_DAYS = 14;

interface DeskChecklistProps {
  items: DeskItem[];
  projects: Project[];
  onAdd: (text: string) => void;
  onPatch: (id: string, patch: Partial<DeskItem>) => void;
  onRemove: (id: string) => void;
  onOpenProject: (id: string) => void;
  onFlash: (message: string) => void;
}

// ── calendar export ────────────────────────────────────────────────────
// Items go out as all-day VEVENTs. The .ics download works with any
// calendar client; the Outlook deeplink is the fast path for the one
// everybody here actually uses.

function escapeIcs(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function buildIcs(items: DeskItem[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Waypoint//My Desk//EN",
    "CALSCALE:GREGORIAN",
  ];
  items.forEach((item) => {
    const start = item.date.replace(/-/g, "");
    const end = shiftIso(item.date, 1).replace(/-/g, "");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${item.id}@waypoint`,
      `DTSTAMP:${start}T000000Z`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${escapeIcs(item.text)}`,
      "END:VEVENT",
    );
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function downloadIcs(items: DeskItem[], filename: string) {
  const url = URL.createObjectURL(
    new Blob([buildIcs(items)], { type: "text/calendar;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function slug(text: string): string {
  return text.replace(/\W+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "task";
}

// ── move-to / remind-me popover ────────────────────────────────────────

interface MoveToProps {
  onPick: (date: string, remind: boolean, time?: string) => void;
  onCancel: () => void;
}

function MoveTo({ onPick, onCancel }: MoveToProps) {
  const [mode, setMode] = useState<"move" | "remind">("move");
  const [date, setDate] = useState(shiftIso(todayIso(), 1));
  const [time, setTime] = useState("09:00");

  return (
    <div className="desk-movebox">
      <div className="desk-movetabs">
        <button
          type="button"
          className={`desk-mtab ${mode === "move" ? "active" : ""}`}
          onClick={() => setMode("move")}
        >
          Move to a day
        </button>
        <button
          type="button"
          className={`desk-mtab ${mode === "remind" ? "active" : ""}`}
          onClick={() => setMode("remind")}
        >
          Remind me
        </button>
      </div>

      {mode === "move" ? (
        <div className="desk-moverow">
          <button
            type="button"
            className="btn-mini"
            onClick={() => onPick(shiftIso(todayIso(), 1), false)}
          >
            Tomorrow
          </button>
          <button
            type="button"
            className="btn-mini"
            onClick={() => onPick(shiftIso(todayIso(), 7), false)}
          >
            Next week
          </button>
          <span className="desk-lbl">or pick a day</span>
          <input
            type="date"
            min={todayIso()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <button
            type="button"
            className="btn-mini primary"
            onClick={() => onPick(date, false)}
          >
            Move
          </button>
          <button type="button" className="desk-link" onClick={onCancel}>
            Cancel
          </button>
        </div>
      ) : (
        <>
          <div className="desk-moverow">
            <span className="desk-lbl">in</span>
            <button
              type="button"
              className="btn-mini"
              onClick={() => setDate(shiftIso(todayIso(), 7))}
            >
              1 week
            </button>
            <button
              type="button"
              className="btn-mini"
              onClick={() => setDate(shiftIso(todayIso(), 14))}
            >
              2 weeks
            </button>
            <button
              type="button"
              className="btn-mini"
              onClick={() => setDate(shiftIso(todayIso(), 30))}
            >
              1 month
            </button>
          </div>
          <div className="desk-moverow">
            <span className="desk-lbl">on</span>
            <input
              type="date"
              min={todayIso()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <span className="desk-lbl">at</span>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
            <button
              type="button"
              className="btn-mini primary"
              onClick={() => onPick(date, true, time)}
            >
              Set reminder
            </button>
            <button type="button" className="desk-link" onClick={onCancel}>
              Cancel
            </button>
          </div>
          <p className="desk-hint">
            It waits in Upcoming with a countdown, then drops onto today's
            list when the time comes.
          </p>
        </>
      )}
    </div>
  );
}

// ── the checklist ──────────────────────────────────────────────────────

export function DeskChecklist({
  items,
  projects,
  onAdd,
  onPatch,
  onRemove,
  onOpenProject,
  onFlash,
}: DeskChecklistProps) {
  const [text, setText] = useState("");
  const [moveFor, setMoveFor] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [undo, setUndo] = useState<DeskItem | null>(null);
  const [picked, setPicked] = useState<string[]>([]);

  const today = todayIso();

  const todays = useMemo(
    () =>
      items
        .filter((i) => !i.done && !i.remind && i.date <= today)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [items, today],
  );

  const later = useMemo(
    () =>
      items
        .filter((i) => !i.done && (i.remind || i.date > today))
        .sort((a, b) => a.date.localeCompare(b.date)),
    [items, today],
  );

  const completed = useMemo(
    () =>
      items
        .filter((i) => i.done)
        .sort((a, b) => (b.completedOn || "").localeCompare(a.completedOn || "")),
    [items],
  );

  const projectTitle = (id: string | undefined) =>
    id ? projects.find((p) => p.id === id)?.title : undefined;

  function submitAdd() {
    if (!text.trim()) return;
    onAdd(text.trim());
    setText("");
  }

  // Ticking only ever affects this list. A desk item linked to a project is
  // a note to self about that project, not the project's status.
  function tick(item: DeskItem) {
    onPatch(item.id, {
      done: true,
      completedOn: today,
      remind: false,
      remindTime: undefined,
    });
    setUndo(item);
  }

  function untick(id: string) {
    onPatch(id, { done: false, completedOn: undefined, date: today });
    setUndo(null);
  }

  function moveTo(id: string, date: string, remind: boolean, time?: string) {
    onPatch(id, {
      date,
      remind,
      remindTime: remind ? time || "09:00" : undefined,
    });
    setMoveFor(null);
    onFlash(
      remind
        ? `Reminder set for ${formatShort(date)} at ${time || "09:00"}.`
        : `Moved to Upcoming — back on your list ${formatShort(date)}.`,
    );
  }

  function commitRename(id: string) {
    if (draft.trim()) onPatch(id, { text: draft.trim() });
    setRenaming(null);
    setDraft("");
  }

  function toCalendar(item: DeskItem) {
    window.open(
      "https://outlook.office.com/calendar/0/deeplink/compose?path=/calendar/action/compose" +
        `&subject=${encodeURIComponent(item.text)}` +
        `&startdt=${item.date}&enddt=${item.date}&allday=true`,
      "_blank",
      "noopener",
    );
    downloadIcs([item], `${slug(item.text)}.ics`);
    onFlash("Opened Outlook and saved an .ics copy.");
  }

  function sendPicked() {
    const chosen = todays.filter((i) => picked.includes(i.id));
    if (chosen.length === 0) return;
    downloadIcs(chosen, `waypoint-my-desk-${today}.ics`);
    onFlash(
      `${chosen.length} item${chosen.length === 1 ? "" : "s"} saved as a calendar file — open it to add them all.`,
    );
    setPicked([]);
  }

  return (
    <div className="desk-panels">
      {/* ── Today ───────────────────────────────────────────────── */}
      <section className="mydesk-section desk-panel">
        <div className="mydesk-section-head">
          <h3>Today</h3>
          <span className="badge">{todays.length}</span>
        </div>

        <div className="desk-addrow">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitAdd()}
            placeholder="What do you need to finish today?"
          />
          <button
            type="button"
            className="btn-mini primary"
            onClick={submitAdd}
            disabled={!text.trim()}
          >
            Add
          </button>
        </div>

        {undo && (
          <div className="desk-undobar">
            <span>Ticked off “{undo.text}”.</span>
            <button
              type="button"
              className="btn-mini"
              onClick={() => untick(undo.id)}
            >
              Undo
            </button>
            <button
              type="button"
              className="desk-dismiss"
              onClick={() => setUndo(null)}
              aria-label="Dismiss"
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        )}

        {todays.length === 0 ? (
          <p className="muted small">Nothing on today's list yet.</p>
        ) : (
          <ul className="desk-checklist">
            {todays.map((item) => (
              <li key={item.id}>
                <div className="desk-row">
                  <button
                    type="button"
                    className="desk-tickbox"
                    onClick={() => tick(item)}
                    aria-label={`Complete ${item.text}`}
                  />
                  <div className="desk-body">
                    {renaming === item.id ? (
                      <input
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename(item.id);
                          if (e.key === "Escape") setRenaming(null);
                        }}
                        onBlur={() => commitRename(item.id)}
                      />
                    ) : (
                      <span className="desk-text">{item.text}</span>
                    )}
                    <span className="desk-meta">
                      {item.projectId
                        ? "from a project · ticking this leaves the project alone"
                        : item.fromReminder
                          ? "from a reminder"
                          : "personal"}
                      {item.date < today
                        ? ` · was due ${formatShort(item.date)}`
                        : ""}
                      {item.rolled ? ` · rolled over ${item.rolled}×` : ""}
                    </span>
                  </div>
                  <div className="desk-actions">
                    <button
                      type="button"
                      className="desk-link"
                      onClick={() => {
                        setRenaming(item.id);
                        setDraft(item.text);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="desk-link"
                      onClick={() =>
                        setMoveFor(moveFor === item.id ? null : item.id)
                      }
                    >
                      Move to
                    </button>
                    <button
                      type="button"
                      className="desk-link"
                      onClick={() => toCalendar(item)}
                    >
                      Calendar
                    </button>
                    {item.projectId && (
                      <button
                        type="button"
                        className="desk-link"
                        onClick={() => onOpenProject(item.projectId!)}
                        title={projectTitle(item.projectId)}
                      >
                        Project
                      </button>
                    )}
                    <button
                      type="button"
                      className="desk-link danger"
                      onClick={() => onRemove(item.id)}
                    >
                      Remove
                    </button>
                  </div>
                  <label
                    className="desk-select"
                    title="Select for the calendar export"
                  >
                    <input
                      type="checkbox"
                      checked={picked.includes(item.id)}
                      onChange={() =>
                        setPicked((prev) =>
                          prev.includes(item.id)
                            ? prev.filter((x) => x !== item.id)
                            : [...prev, item.id],
                        )
                      }
                    />
                  </label>
                </div>
                {moveFor === item.id && (
                  <MoveTo
                    onPick={(d, r, t) => moveTo(item.id, d, r, t)}
                    onCancel={() => setMoveFor(null)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}

        {todays.length > 0 && (
          <div className="desk-calbar">
            <button
              type="button"
              className="desk-link"
              onClick={() =>
                setPicked(
                  picked.length === todays.length
                    ? []
                    : todays.map((i) => i.id),
                )
              }
            >
              {picked.length === todays.length
                ? "Clear selection"
                : "Select all"}
            </button>
            <span className="muted small">{picked.length} selected</span>
            <span className="desk-spacer" />
            <button
              type="button"
              className="btn-mini"
              disabled={picked.length === 0}
              onClick={sendPicked}
            >
              Add selected to my calendar
            </button>
          </div>
        )}
      </section>

      {/* ── Upcoming ────────────────────────────────────────────── */}
      <section className="mydesk-section desk-panel">
        <div className="mydesk-section-head">
          <h3>Upcoming</h3>
          <span className="badge">{later.length}</span>
        </div>
        {later.length === 0 ? (
          <p className="muted small">
            Nothing scheduled ahead. Use “Move to” on anything you can't get
            to today.
          </p>
        ) : (
          <ul className="desk-checklist">
            {later.map((item) => (
              <li key={item.id}>
                <div className="desk-row">
                  <button
                    type="button"
                    className="desk-tickbox"
                    onClick={() => tick(item)}
                    aria-label={`Complete ${item.text}`}
                  />
                  <div className="desk-body">
                    <span className="desk-text">{item.text}</span>
                    <span className="desk-meta">
                      {item.remind
                        ? `reminder · ${countdownLabel(item.date)}${
                            item.remindTime ? ` at ${item.remindTime}` : ""
                          }`
                        : `lands on your list ${formatShort(item.date)}`}
                    </span>
                  </div>
                  <div className="desk-actions">
                    <button
                      type="button"
                      className="desk-link"
                      onClick={() =>
                        setMoveFor(moveFor === item.id ? null : item.id)
                      }
                    >
                      Move to
                    </button>
                    <button
                      type="button"
                      className="desk-link"
                      onClick={() => toCalendar(item)}
                    >
                      Calendar
                    </button>
                    <button
                      type="button"
                      className="desk-link"
                      onClick={() => moveTo(item.id, today, false)}
                    >
                      Do today
                    </button>
                    {item.projectId && (
                      <button
                        type="button"
                        className="desk-link"
                        onClick={() => onOpenProject(item.projectId!)}
                        title={projectTitle(item.projectId)}
                      >
                        Project
                      </button>
                    )}
                    <button
                      type="button"
                      className="desk-link danger"
                      onClick={() => onRemove(item.id)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
                {moveFor === item.id && (
                  <MoveTo
                    onPick={(d, r, t) => moveTo(item.id, d, r, t)}
                    onCancel={() => setMoveFor(null)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Completed ───────────────────────────────────────────── */}
      <section className="mydesk-section desk-panel">
        <div className="mydesk-section-head">
          <h3>Completed</h3>
          <div className="desk-head-right">
            <span className="badge">{completed.length}</span>
            <span className="muted small">kept for two weeks</span>
          </div>
        </div>
        {completed.length === 0 ? (
          <p className="muted small">Nothing ticked off yet.</p>
        ) : (
          <ul className="desk-checklist done">
            {completed.map((item) => {
              const since = daysSince(item.completedOn);
              const left =
                since === null ? KEEP_COMPLETED_DAYS : KEEP_COMPLETED_DAYS - since;
              return (
                <li key={item.id}>
                  <div className="desk-row">
                    <span className="desk-tickdone" aria-hidden="true">
                      <Icon name="checkmark" size={14} />
                    </span>
                    <div className="desk-body">
                      <span className="desk-text struck">{item.text}</span>
                      <span className="desk-meta">
                        done {formatShort(item.completedOn)} · removed in{" "}
                        {Math.max(left, 0)} days
                      </span>
                    </div>
                    <div className="desk-actions">
                      <button
                        type="button"
                        className="desk-link"
                        onClick={() => untick(item.id)}
                      >
                        Put back on today
                      </button>
                      <button
                        type="button"
                        className="desk-link danger"
                        onClick={() => onRemove(item.id)}
                      >
                        Remove now
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

import { Icon } from "./Icon";