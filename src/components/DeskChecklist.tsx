import { useMemo, useState } from "react";
import type { Designer, DeskItem, Milestone, Project, Workspace } from "../types";
import { Avatar } from "./Avatar";
import { GripDots } from "./DragGrip";
import { Icon } from "./Icon";
import { dropPosition, reorderIds } from "../dragReorder";
import {
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
  // Open project tasks assigned to this person, listed beside their own
  // ad hoc items.
  projectTasks: { project: Project; task: Milestone }[];
  designers: Designer[];
  workspaces: Workspace[];
  currentDesignerId: string;
  // A new ad hoc item, for `date` (YYYY-MM-DD) or today when omitted.
  onAdd: (text: string, date?: string) => void;
  onPatch: (id: string, patch: Partial<DeskItem>) => void;
  // Today's list in its new order (item ids, top first).
  onReorder: (ids: string[]) => void;
  onRemove: (id: string) => void;
  // Flags a project task done (or not) on its project.
  onToggleProjectTask: (projectId: string, taskId: string) => void;
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
            It waits on its day with a bell, then drops onto today's list
            when the time comes.
          </p>
        </>
      )}
    </div>
  );
}

// ── the agenda ─────────────────────────────────────────────────────────
// Everything you have to do in one list, soonest first: the project tasks
// assigned to you and your own ad hoc items. Grouped into "due" bands
// (overdue, today, tomorrow, later this week, next week, later, undated),
// then by day, then under the project each task belongs to.

type Entry =
  | { kind: "desk"; date: string; item: DeskItem }
  | { kind: "task"; date: string; project: Project; task: Milestone };

type BucketId = "overdue" | "today" | "tomorrow" | "week" | "nextweek" | "later" | "none";

const BUCKETS: { id: BucketId; label: string }[] = [
  { id: "overdue", label: "Overdue" },
  { id: "today", label: "Due today" },
  { id: "tomorrow", label: "Due tomorrow" },
  { id: "week", label: "Due later this week" },
  { id: "nextweek", label: "Due next week" },
  { id: "later", label: "Due later" },
  { id: "none", label: "No due date" },
];

// "Tue, 17 Nov" — the day down the left of the agenda and in each row's chip.
function dayLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

// "Kyleigh Lambert" → "Kyleigh L."
function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length < 2 ? name : `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

// Today's ad hoc items: dragged-into-place ones first, by their order; the
// rest after them, oldest first, so something just added lands at the bottom.
function byPlace(a: DeskItem, b: DeskItem): number {
  return (
    (a.order ?? Infinity) - (b.order ?? Infinity) || a.createdAt.localeCompare(b.createdAt)
  );
}

export function DeskChecklist({
  items,
  projects,
  projectTasks,
  designers,
  workspaces,
  currentDesignerId,
  onAdd,
  onPatch,
  onReorder,
  onRemove,
  onToggleProjectTask,
  onOpenProject,
  onFlash,
}: DeskChecklistProps) {
  const [text, setText] = useState("");
  // The day a new ad hoc task is for; empty means today.
  const [addDate, setAddDate] = useState("");
  const [moveFor, setMoveFor] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [undo, setUndo] = useState<{ label: string; revert: () => void } | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  // Drag to reorder today's ad hoc items: the one being dragged and where it
  // would land.
  const [dragging, setDragging] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; position: "before" | "after" } | null>(null);

  const today = todayIso();
  const me = designers.find((d) => d.id === currentDesignerId);

  // The ad hoc items that can be dragged into an order: today's, less any
  // reminder still waiting for its time.
  const todays = useMemo(
    () => items.filter((i) => !i.done && !i.remind && i.date <= today).sort(byPlace),
    [items, today],
  );
  const openDesk = useMemo(() => items.filter((i) => !i.done), [items]);

  const buckets = useMemo(() => {
    // Weeks run Monday to Sunday, like the calendars elsewhere in Waypoint.
    const dow = (new Date(`${today}T00:00:00`).getDay() + 6) % 7;
    const tomorrow = shiftIso(today, 1);
    const weekEnd = shiftIso(today, 6 - dow);
    const nextWeekEnd = shiftIso(weekEnd, 7);
    const bucketOf = (date: string): BucketId =>
      !date
        ? "none"
        : date < today
          ? "overdue"
          : date === today
            ? "today"
            : date === tomorrow
              ? "tomorrow"
              : date <= weekEnd
                ? "week"
                : date <= nextWeekEnd
                  ? "nextweek"
                  : "later";

    const entries: Entry[] = [
      // An unticked ad hoc item from an earlier day is today's job (the desk
      // rolls it forward), so it's never "overdue".
      ...items
        .filter((i) => !i.done)
        .map((item) => ({
          kind: "desk" as const,
          date: item.date < today ? today : item.date,
          item,
        })),
      ...projectTasks.map(({ project, task }) => ({
        kind: "task" as const,
        date: task.dueDate ?? "",
        project,
        task,
      })),
    ];

    return BUCKETS.map((bucket) => {
      const mine = entries.filter((e) => bucketOf(e.date) === bucket.id);
      const dates = [...new Set(mine.map((e) => e.date))].sort();
      return {
        ...bucket,
        count: mine.length,
        days: dates.map((date) => {
          const onDay = mine.filter((e) => e.date === date);
          const desk = onDay
            .flatMap((e) => (e.kind === "desk" ? [e.item] : []))
            .sort((a, b) => Number(!!a.remind) - Number(!!b.remind) || byPlace(a, b));
          const byProject = new Map<string, { project: Project; tasks: Milestone[] }>();
          onDay.forEach((e) => {
            if (e.kind !== "task") return;
            const group = byProject.get(e.project.id) ?? { project: e.project, tasks: [] };
            group.tasks.push(e.task);
            byProject.set(e.project.id, group);
          });
          return {
            date,
            desk,
            groups: [...byProject.values()].sort((a, b) =>
              a.project.title.localeCompare(b.project.title),
            ),
          };
        }),
      };
    }).filter((b) => b.count > 0);
  }, [items, projectTasks, today]);

  const completed = useMemo(
    () =>
      items
        .filter((i) => i.done)
        .sort((a, b) => (b.completedOn || "").localeCompare(a.completedOn || "")),
    [items],
  );

  const teamName = (p: Project) =>
    workspaces.find((w) => w.id === p.workspaceId)?.name ?? "";

  function endDrag() {
    setDragging(null);
    setDrop(null);
  }

  // Move one place up or down from the keyboard, keeping focus on the grip.
  function nudge(id: string, dir: -1 | 1) {
    const ids = todays.map((i) => i.id);
    const at = ids.indexOf(id);
    const to = at + dir;
    if (at < 0 || to < 0 || to >= ids.length) return;
    onReorder(reorderIds(ids, id, ids[to], dir < 0 ? "before" : "after"));
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>(`[data-desk-grip="${id}"]`)?.focus(),
    );
  }

  function submitAdd() {
    if (!text.trim()) return;
    onAdd(text.trim(), addDate && addDate > today ? addDate : undefined);
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
    setUndo({
      label: item.text,
      // Back where it was: same day, and still a reminder if it was one.
      revert: () =>
        onPatch(item.id, {
          done: false,
          completedOn: undefined,
          date: item.date < today ? today : item.date,
          remind: item.remind,
          remindTime: item.remindTime,
        }),
    });
  }

  // A project task, on the other hand, is the project's own: ticking it here
  // ticks it on the project.
  function tickTask(project: Project, task: Milestone) {
    onToggleProjectTask(project.id, task.id);
    setUndo({
      label: task.label,
      revert: () => onToggleProjectTask(project.id, task.id),
    });
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
      // Off today's list, so it gives up its place; it rejoins at the bottom.
      order: undefined,
    });
    setMoveFor(null);
    onFlash(
      remind
        ? `Reminder set for ${formatShort(date)} at ${time || "09:00"}.`
        : date <= today
          ? "Moved to today."
          : `Moved to ${formatShort(date)}.`,
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
    const chosen = openDesk.filter((i) => picked.includes(i.id));
    if (chosen.length === 0) return;
    downloadIcs(chosen, `waypoint-my-desk-${today}.ics`);
    onFlash(
      `${chosen.length} item${chosen.length === 1 ? "" : "s"} saved as a calendar file — open it to add them all.`,
    );
    setPicked([]);
  }

  const pickedCount = openDesk.filter((i) => picked.includes(i.id)).length;

  // ── rows ─────────────────────────────────────────────────────────────

  const who = me && (
    <span className="agenda-chip">
      <Avatar designer={me} size={16} /> {shortName(me.name)}
    </span>
  );

  function deskRow(item: DeskItem, orderable: boolean) {
    const dropHere =
      orderable && dragging && dragging !== item.id && drop?.id === item.id
        ? drop.position
        : null;
    const linked = item.projectId ? projects.find((p) => p.id === item.projectId) : undefined;
    const waiting = item.remind || item.date > today;
    return (
      <li
        key={item.id}
        className={
          [dragging === item.id ? "dragging" : "", dropHere ? `drop-${dropHere}` : ""]
            .filter(Boolean)
            .join(" ") || undefined
        }
        onDragOver={
          orderable
            ? (e) => {
                if (!dragging || dragging === item.id) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                const position = dropPosition(e);
                setDrop((cur) =>
                  cur?.id === item.id && cur.position === position
                    ? cur
                    : { id: item.id, position },
                );
              }
            : undefined
        }
        onDragLeave={
          orderable
            ? (e) => {
                const next = e.relatedTarget as Node | null;
                if (next && e.currentTarget.contains(next)) return;
                setDrop((cur) => (cur?.id === item.id ? null : cur));
              }
            : undefined
        }
        onDrop={
          orderable
            ? (e) => {
                e.preventDefault();
                if (dragging && drop?.id === item.id) {
                  onReorder(
                    reorderIds(todays.map((i) => i.id), dragging, item.id, drop.position),
                  );
                }
                endDrag();
              }
            : undefined
        }
      >
        <div className="desk-row agenda-row">
          {orderable && (
            <button
              type="button"
              className="item-task-grip"
              draggable
              data-desk-grip={item.id}
              title="Drag to reorder"
              aria-label={`Reorder ${item.text}. Use the up and down arrow keys to move it.`}
              onDragStart={(e) => {
                setDragging(item.id);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", item.id);
                const row = e.currentTarget.closest("li");
                if (row) e.dataTransfer.setDragImage(row, 16, row.offsetHeight / 2);
              }}
              onDragEnd={endDrag}
              onKeyDown={(e) => {
                if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
                e.preventDefault();
                nudge(item.id, e.key === "ArrowUp" ? -1 : 1);
              }}
            >
              <GripDots />
            </button>
          )}
          <button
            type="button"
            className="desk-tickbox"
            onClick={() => tick(item)}
            aria-label={`Complete ${item.text}`}
          />
          <div className="agenda-main">
            {renaming === item.id ? (
              <input
                autoFocus
                className="agenda-rename"
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
            <span className="agenda-chips">
              {who}
              {item.remind ? (
                <span className="agenda-chip" title="Waits here, then drops onto today's list when the time comes">
                  <Icon name="bell-notification" size={13} /> {dayLabel(item.date)}
                  {item.remindTime ? ` at ${item.remindTime}` : ""}
                </span>
              ) : (
                <span className="agenda-chip">
                  <Icon name="calendar" size={13} />{" "}
                  {dayLabel(item.date < today ? today : item.date)}
                </span>
              )}
              {!!item.rolled && (
                <span
                  className="agenda-chip"
                  title="Unticked items roll forward to today each morning"
                >
                  Rolled over {item.rolled}×
                </span>
              )}
              {item.fromReminder && <span className="agenda-chip">From a reminder</span>}
              {linked && (
                <button
                  type="button"
                  className="agenda-chip agenda-chip-link"
                  onClick={() => onOpenProject(linked.id)}
                  title={`Open ${linked.title}. Ticking this item leaves the project alone.`}
                >
                  {linked.title || "Untitled project"}
                </button>
              )}
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
              onClick={() => setMoveFor(moveFor === item.id ? null : item.id)}
            >
              Move to
            </button>
            {waiting && (
              <button
                type="button"
                className="desk-link"
                onClick={() => moveTo(item.id, today, false)}
              >
                Do today
              </button>
            )}
            <button type="button" className="desk-link" onClick={() => toCalendar(item)}>
              Calendar
            </button>
            <button
              type="button"
              className="desk-link danger"
              onClick={() => onRemove(item.id)}
            >
              Remove
            </button>
          </div>
          <label className="desk-select" title="Select for the calendar export">
            <input
              type="checkbox"
              checked={picked.includes(item.id)}
              aria-label={`Select ${item.text} for the calendar export`}
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
    );
  }

  function taskRow(project: Project, task: Milestone) {
    const late = !!task.dueDate && task.dueDate < today;
    return (
      <li key={`${project.id}-${task.id}`}>
        <div className="desk-row agenda-row">
          <button
            type="button"
            className="desk-tickbox"
            onClick={() => tickTask(project, task)}
            aria-label={`Complete ${task.label}`}
            title="Ticks the task off on the project too"
          />
          <div className="agenda-main">
            <span className="desk-text">{task.label}</span>
            <span className="agenda-chips">
              {who}
              <span className={`agenda-chip ${late ? "late" : ""}`}>
                <Icon name="calendar" size={13} />{" "}
                {task.dueDate ? dayLabel(task.dueDate) : "No date"}
                {late ? " · overdue" : ""}
              </span>
            </span>
          </div>
          <div className="desk-actions">
            <button
              type="button"
              className="desk-link"
              onClick={() => onOpenProject(project.id)}
            >
              Open project
            </button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <div className="desk-panels">
      <section className="mydesk-section desk-panel">
        <div className="desk-addrow">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitAdd()}
            placeholder="Add an ad hoc task…"
            aria-label="New ad hoc task"
          />
          <input
            type="date"
            className="agenda-adddate"
            min={today}
            value={addDate && addDate > today ? addDate : today}
            onChange={(e) => setAddDate(e.target.value)}
            aria-label="Due"
            title="The day it's due"
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
            <span>Ticked off “{undo.label}”.</span>
            <button
              type="button"
              className="btn-mini"
              onClick={() => {
                undo.revert();
                setUndo(null);
              }}
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

        {buckets.length === 0 ? (
          <p className="muted small">
            Nothing to do. Add an ad hoc task above; tasks assigned to you on a
            project turn up here too.
          </p>
        ) : (
          <div className="agenda">
            {buckets.map((bucket) => (
              <section
                key={bucket.id}
                className={`agenda-bucket ${bucket.id === "overdue" ? "late" : ""}`}
              >
                <h3 className="agenda-bucket-head">
                  <span className="agenda-tag">{bucket.label}</span>
                </h3>
                {bucket.days.map((day) => (
                  <div key={day.date || "none"} className="agenda-day">
                    <div className="agenda-date">
                      {day.date ? dayLabel(day.date) : "Any time"}
                    </div>
                    <div className="agenda-groups">
                      {day.desk.length > 0 && (
                        <div className="agenda-group">
                          <div className="agenda-group-head">
                            <b>Ad hoc</b> in <b>My Desk</b>
                          </div>
                          <ul className="desk-checklist">
                            {day.desk.map((item) =>
                              deskRow(
                                item,
                                bucket.id === "today" && !item.remind && todays.length > 1,
                              ),
                            )}
                          </ul>
                        </div>
                      )}
                      {day.groups.map(({ project, tasks }) => (
                        <div key={project.id} className="agenda-group">
                          <div className="agenda-group-head">
                            <button
                              type="button"
                              className="agenda-group-link"
                              onClick={() => onOpenProject(project.id)}
                              title="Open the project"
                            >
                              {project.title || "Untitled project"}
                            </button>
                            {teamName(project) && (
                              <>
                                {" "}
                                in <b>{teamName(project)}</b>
                              </>
                            )}
                          </div>
                          <ul className="desk-checklist">
                            {tasks.map((task) => taskRow(project, task))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            ))}
          </div>
        )}

        {openDesk.length > 0 && (
          <div className="desk-calbar">
            <button
              type="button"
              className="desk-link"
              onClick={() =>
                setPicked(pickedCount === openDesk.length ? [] : openDesk.map((i) => i.id))
              }
            >
              {pickedCount === openDesk.length ? "Clear selection" : "Select all ad hoc"}
            </button>
            <span className="muted small">{pickedCount} selected</span>
            <span className="desk-spacer" />
            <button
              type="button"
              className="btn-mini"
              disabled={pickedCount === 0}
              onClick={sendPicked}
            >
              Add selected to my calendar
            </button>
          </div>
        )}
      </section>

      {/* ── Completed ───────────────────────────────────────────── */}
      <section className="mydesk-section desk-panel">
        <div className="mydesk-section-head">
          <h3>Completed ad hoc</h3>
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
