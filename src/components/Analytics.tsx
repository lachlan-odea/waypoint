import { useMemo, useState } from "react";
import type { Designer, Priority, Project } from "../types";

type Props = {
  projects: Project[];
  designers: Designer[];
};

const PRIORITIES: Priority[] = ["Urgent", "High", "Normal", "Low"];

function daysFromNow(iso: string): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

function commencedDate(p: Project): string {
  return (p.createdAt || "").slice(0, 10);
}

function toCsv(projects: Project[], designers: Designer[]): string {
  const designerName = (id: string | null) =>
    id ? designers.find((d) => d.id === id)?.name ?? "" : "Unassigned";
  const header = [
    "id",
    "title",
    "priority",
    "client",
    "brand",
    "productArea",
    "assignee",
    "dueDate",
    "commencedDate",
    "milestonesTotal",
    "milestonesDone",
    "commentCount",
    "source",
  ];
  const rows = projects.map((p) => [
    p.id,
    p.title,
    p.priority,
    p.client,
    p.brand,
    p.productArea,
    designerName(p.assigneeId),
    p.dueDate,
    commencedDate(p),
    p.milestones.length,
    p.milestones.filter((m) => m.done).length,
    p.comments.length,
    p.source ?? "manual",
  ]);
  return [header, ...rows]
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell ?? "");
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(",")
    )
    .join("\n");
}

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftDays(base: string, days: number): string {
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function startOfMonth(base: string): string {
  return `${base.slice(0, 7)}-01`;
}

export function Analytics({ projects, designers }: Props) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const filtered = useMemo(() => {
    if (!from && !to) return projects;
    return projects.filter((p) => {
      const c = commencedDate(p);
      if (!c) return false;
      if (from && c < from) return false;
      if (to && c > to) return false;
      return true;
    });
  }, [projects, from, to]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const byPriority = PRIORITIES.map((p) => ({
      label: p,
      count: filtered.filter((x) => x.priority === p).length,
    }));
    const byDesigner = designers
      .map((d) => ({
        label: d.name,
        color: d.color,
        count: filtered.filter((p) => p.assigneeId === d.id).length,
      }))
      .sort((a, b) => b.count - a.count);
    const unassigned = filtered.filter((p) => !p.assigneeId).length;
    if (unassigned > 0) {
      byDesigner.push({ label: "Unassigned", color: "#94a3b8", count: unassigned });
    }
    const brands = new Map<string, number>();
    filtered.forEach((p) => {
      const key = p.brand || "—";
      brands.set(key, (brands.get(key) ?? 0) + 1);
    });
    const byBrand = [...brands.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
    const productAreas = new Map<string, number>();
    filtered.forEach((p) => {
      const key = p.productArea || "—";
      productAreas.set(key, (productAreas.get(key) ?? 0) + 1);
    });
    const byProductArea = [...productAreas.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);

    let overdue = 0;
    let dueThisWeek = 0;
    filtered.forEach((p) => {
      const d = daysFromNow(p.dueDate);
      if (d === null) return;
      if (d < 0) overdue++;
      else if (d <= 7) dueThisWeek++;
    });

    const urgentCount = filtered.filter((p) => p.priority === "Urgent").length;

    let totalMilestones = 0;
    let doneMilestones = 0;
    filtered.forEach((p) => {
      totalMilestones += p.milestones.length;
      doneMilestones += p.milestones.filter((m) => m.done).length;
    });

    return {
      total,
      urgentCount,
      overdue,
      dueThisWeek,
      byPriority,
      byDesigner,
      byBrand,
      byProductArea,
      totalMilestones,
      doneMilestones,
    };
  }, [filtered, designers]);

  const maxDesigner = Math.max(1, ...stats.byDesigner.map((d) => d.count));
  const maxBrand = Math.max(1, ...stats.byBrand.map((d) => d.count));
  const maxArea = Math.max(1, ...stats.byProductArea.map((d) => d.count));
  const maxPrio = Math.max(1, ...stats.byPriority.map((d) => d.count));

  function applyQuickRange(kind: "7" | "30" | "90" | "month" | "all") {
    const today = todayISO();
    if (kind === "all") {
      setFrom("");
      setTo("");
      return;
    }
    if (kind === "month") {
      setFrom(startOfMonth(today));
      setTo(today);
      return;
    }
    setFrom(shiftDays(today, -Number(kind) + 1));
    setTo(today);
  }

  const rangeLabel =
    from || to
      ? `${from || "…"} → ${to || "…"}`
      : "All time";

  return (
    <div className="analytics">
      <div className="filter-bar">
        <div className="filter-fields">
          <label className="field-inline">
            <span>From</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              max={to || undefined}
            />
          </label>
          <label className="field-inline">
            <span>To</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              min={from || undefined}
            />
          </label>
        </div>
        <div className="filter-quick">
          <button onClick={() => applyQuickRange("7")}>Last 7d</button>
          <button onClick={() => applyQuickRange("30")}>Last 30d</button>
          <button onClick={() => applyQuickRange("90")}>Last 90d</button>
          <button onClick={() => applyQuickRange("month")}>This month</button>
          <button onClick={() => applyQuickRange("all")}>All time</button>
        </div>
      </div>
      <p className="muted small filter-summary">
        Showing projects commenced {rangeLabel} ({filtered.length} of {projects.length})
      </p>

      <div className="kpi-row">
        <Kpi label="Projects" value={stats.total} />
        <Kpi label="Urgent" value={stats.urgentCount} variant="urgent" />
        <Kpi label="Due in 7 days" value={stats.dueThisWeek} variant="duesoon" />
        <Kpi label="Overdue" value={stats.overdue} variant="overdue" />
        <Kpi
          label="Milestones complete"
          value={`${stats.doneMilestones} / ${stats.totalMilestones}`}
        />
      </div>

      <div className="panel">
        <h3>By priority</h3>
        {stats.byPriority.map((row) => (
          <div key={row.label} className={`bar-row ${row.label.toLowerCase()}`}>
            <span>{row.label}</span>
            <span className="bar">
              <span
                className="bar-fill"
                style={{ width: `${(row.count / maxPrio) * 100}%` }}
              />
            </span>
            <span className="bar-count">{row.count}</span>
          </div>
        ))}
      </div>

      <div className="panel">
        <h3>By designer</h3>
        {stats.byDesigner.map((row) => (
          <div key={row.label} className="bar-row">
            <span>{row.label}</span>
            <span className="bar">
              <span
                className="bar-fill"
                style={{
                  width: `${(row.count / maxDesigner) * 100}%`,
                  background: row.color,
                }}
              />
            </span>
            <span className="bar-count">{row.count}</span>
          </div>
        ))}
      </div>

      <div className="panel-grid">
        <div className="panel">
          <h3>By brand</h3>
          {stats.byBrand.length === 0 && <p className="muted small">No data.</p>}
          {stats.byBrand.map((row) => (
            <div key={row.label} className="bar-row">
              <span>{row.label}</span>
              <span className="bar">
                <span
                  className="bar-fill"
                  style={{ width: `${(row.count / maxBrand) * 100}%` }}
                />
              </span>
              <span className="bar-count">{row.count}</span>
            </div>
          ))}
        </div>
        <div className="panel">
          <h3>By product area</h3>
          {stats.byProductArea.length === 0 && <p className="muted small">No data.</p>}
          {stats.byProductArea.map((row) => (
            <div key={row.label} className="bar-row">
              <span>{row.label}</span>
              <span className="bar">
                <span
                  className="bar-fill"
                  style={{ width: `${(row.count / maxArea) * 100}%` }}
                />
              </span>
              <span className="bar-count">{row.count}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="export-row">
        <button
          onClick={() =>
            download(
              `design-pm-projects-${todayISO()}.csv`,
              toCsv(filtered, designers),
              "text/csv;charset=utf-8"
            )
          }
        >
          Export CSV
        </button>
        <button
          onClick={() =>
            download(
              `design-pm-projects-${todayISO()}.json`,
              JSON.stringify(filtered, null, 2),
              "application/json"
            )
          }
        >
          Export JSON
        </button>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  variant,
}: {
  label: string;
  value: number | string;
  variant?: "urgent" | "overdue" | "duesoon";
}) {
  return (
    <div className={`kpi ${variant ?? ""}`}>
      <p className="kpi-label">{label}</p>
      <p className="kpi-value">{value}</p>
    </div>
  );
}
