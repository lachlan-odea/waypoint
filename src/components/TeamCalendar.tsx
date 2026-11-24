import { useMemo, useState } from "react";
import type { Designer, Project } from "../types";
import { formatLong, formatShort, todayIso } from "../dates";
import { Avatar } from "./Avatar";
import { CalendarRows } from "./calendarRows";

type Props = {
  // The team's active projects, the same ones the columns show.
  projects: Project[];
  // The people on this team, you first: the "who" filter.
  team: Designer[];
  // Everyone, so a task given to someone outside the team still shows a face.
  designers: Designer[];
  onOpenProject: (id: string) => void;
};

// One thing falling due: a project, or an open task on one.
type Due = {
  key: string;
  kind: "project" | "task";
  projectId: string;
  date: string;
  label: string;
  // The project a task belongs to; empty for the project itself.
  projectTitle: string;
  priority: Project["priority"];
  // Who it is on: a task's assignee, else the project's assignees.
  peopleIds: string[];
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const EVERYONE = "";
const NOBODY = "__unassigned__";
const PRIORITY_ORDER: Record<string, number> = { Urgent: 0, High: 1, Normal: 2, Low: 3 };

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

// The month as whole weeks, Monday first; null pads the edges.
function monthCells(ym: string): (string | null)[] {
  const [y, m] = ym.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const days = new Date(y, m, 0).getDate();
  const leading = (first.getDay() + 6) % 7;
  const cells: (string | null)[] = [];
  for (let i = 0; i < leading; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(`${ym}-${pad(d)}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

// Due dates are YYYY-MM-DD, but anything longer (a timestamp from an import)
// still lands on its day.
function dayOf(iso: string | undefined): string {
  const day = (iso ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "";
}

// The Team section's calendar: a month of when the team's active projects,
// and the open tasks on them, fall due. Filter it to one person; click
// anything to open its project.
export function TeamCalendar({ projects, team, designers, onOpenProject }: Props) {
  const today = todayIso();
  const thisMonth = today.slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const [who, setWho] = useState(EVERYONE);
  const cells = useMemo(() => monthCells(month), [month]);

  const all = useMemo(() => {
    const list: Due[] = [];
    for (const p of projects) {
      const date = dayOf(p.dueDate);
      if (date) {
        list.push({
          key: p.id,
          kind: "project",
          projectId: p.id,
          date,
          label: p.title || "Untitled project",
          projectTitle: "",
          priority: p.priority,
          peopleIds: p.assigneeIds,
        });
      }
      for (const m of p.milestones) {
        const taskDate = dayOf(m.dueDate);
        if (m.done || !taskDate) continue;
        list.push({
          key: `${p.id}:${m.id}`,
          kind: "task",
          projectId: p.id,
          date: taskDate,
          label: m.label || "Untitled task",
          projectTitle: p.title || "Untitled project",
          priority: p.priority,
          peopleIds: m.assigneeId ? [m.assigneeId] : p.assigneeIds,
        });
      }
    }
    return list;
  }, [projects]);

  const shown = useMemo(
    () =>
      who === EVERYONE
        ? all
        : who === NOBODY
          ? all.filter((d) => d.peopleIds.length === 0)
          : all.filter((d) => d.peopleIds.includes(who)),
    [all, who],
  );

  const byDate = useMemo(() => {
    const map = new Map<string, Due[]>();
    for (const d of shown) {
      const list = map.get(d.date) ?? [];
      list.push(d);
      map.set(d.date, list);
    }
    // A day reads projects first, then tasks, each most pressing first.
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          (a.kind === b.kind ? 0 : a.kind === "project" ? -1 : 1) ||
          (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9) ||
          a.label.localeCompare(b.label),
      );
    }
    return map;
  }, [shown]);

  // Overdue work in an earlier month is off the page, so say it's there.
  const monthStart = `${month}-01`;
  const overdueEarlier = shown.filter((d) => d.date < today && d.date < monthStart);
  const earliestOverdue = overdueEarlier.reduce((min, d) => (d.date < min ? d.date : min), "9999");
  const inMonth = shown.filter((d) => d.date.slice(0, 7) === month).length;
  const undated = projects.filter(
    (p) =>
      !dayOf(p.dueDate) &&
      (who === EVERYONE
        ? true
        : who === NOBODY
          ? p.assigneeIds.length === 0
          : p.assigneeIds.includes(who)),
  ).length;
  const hasUnassigned = all.some((d) => d.peopleIds.length === 0);
  const whoName =
    who === EVERYONE
      ? "the team"
      : who === NOBODY
        ? "unassigned work"
        : (team.find((d) => d.id === who)?.name ?? "this person");

  return (
    <div className="ler-cal team-cal">
      <div className="ler-cal-head">
        <div className="ler-cal-nav">
          <button
            type="button"
            className="icon-btn"
            onClick={() => setMonth(shiftMonth(month, -1))}
            aria-label="Previous month"
          >
            ‹
          </button>
          <h3>{monthLabel(month)}</h3>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setMonth(shiftMonth(month, 1))}
            aria-label="Next month"
          >
            ›
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setMonth(thisMonth)}
            disabled={month === thisMonth}
          >
            Today
          </button>
        </div>
        <span className="ler-cal-legend muted small" aria-hidden>
          <span className="team-cal-key project" /> Project due
          <span className="team-cal-key task" /> Task due
          <span className="team-cal-key overdue" /> Overdue
        </span>
      </div>

      <div className="team-cal-who" role="group" aria-label="Whose due dates to show">
        <button
          type="button"
          className="team-cal-person"
          aria-pressed={who === EVERYONE}
          onClick={() => setWho(EVERYONE)}
        >
          Everyone
        </button>
        {team.map((d) => (
          <button
            key={d.id}
            type="button"
            className="team-cal-person"
            aria-pressed={who === d.id}
            onClick={() => setWho(who === d.id ? EVERYONE : d.id)}
          >
            <Avatar designer={d} size={18} />
            {d.name}
          </button>
        ))}
        {hasUnassigned && (
          <button
            type="button"
            className="team-cal-person"
            aria-pressed={who === NOBODY}
            onClick={() => setWho(who === NOBODY ? EVERYONE : NOBODY)}
          >
            Unassigned
          </button>
        )}
      </div>

      <div
        className="ler-cal-grid"
        role="table"
        aria-label={`Due dates for ${whoName} in ${monthLabel(month)}`}
      >
        <div role="row" className="cal-row">
          {WEEKDAYS.map((d) => (
            <div key={d} className="ler-cal-wd" role="columnheader">
              {d}
            </div>
          ))}
        </div>
        <CalendarRows
          cells={cells.map((iso, i) => {
            if (!iso) return <div key={`pad-${i}`} className="ler-cal-cell empty" role="cell" />;
            const items = byDate.get(iso) ?? [];
            const past = iso < today;
            return (
              <div
                key={iso}
                role="cell"
                className={`ler-cal-cell team-cal-cell ${past && items.length === 0 ? "past" : ""} ${iso === today ? "today" : ""}`}
              >
                <div className="ler-cal-daybar">
                  <span className="ler-cal-daynum">{Number(iso.slice(8))}</span>
                </div>
                {items.map((d) => {
                  const people = d.peopleIds
                    .map((id) => designers.find((x) => x.id === id))
                    .filter((x): x is Designer => Boolean(x));
                  const names = people.map((x) => x.name).join(", ") || "Unassigned";
                  const what =
                    d.kind === "task" ? `Task on ${d.projectTitle}: ${d.label}` : `Project: ${d.label}`;
                  return (
                    <button
                      key={d.key}
                      type="button"
                      className={`team-cal-item ${d.kind} ${past ? "overdue" : ""}`}
                      title={`${what} · ${past ? "was due" : "due"} ${formatLong(d.date)} · ${d.priority} priority · ${names}`}
                      onClick={() => onOpenProject(d.projectId)}
                    >
                      <span className="team-cal-item-label">{d.label}</span>
                      {who === EVERYONE && people.length > 0 && (
                        <span className="team-cal-item-people" aria-hidden>
                          {people.slice(0, 2).map((x) => (
                            <Avatar key={x.id} designer={x} size={16} />
                          ))}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        />
      </div>

      <p className="muted small ler-cal-foot">
        {inMonth === 0
          ? `Nothing due for ${whoName} in ${monthLabel(month)}.`
          : `${inMonth} due date${inMonth === 1 ? "" : "s"} for ${whoName} in ${monthLabel(month)}.`}
        {overdueEarlier.length > 0 && (
          <>
            {" "}
            <button
              type="button"
              className="link-btn team-cal-overdue-link"
              onClick={() => setMonth(earliestOverdue.slice(0, 7))}
            >
              {overdueEarlier.length} overdue from before this month, the oldest due{" "}
              {formatShort(earliestOverdue)}
            </button>
            .
          </>
        )}
        {undated > 0 &&
          ` ${undated} active project${undated === 1 ? " has" : "s have"} no due date, so ${undated === 1 ? "it isn't" : "they aren't"} on the calendar.`}
      </p>
    </div>
  );
}
