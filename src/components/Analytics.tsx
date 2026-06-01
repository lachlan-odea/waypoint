import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Designer, Priority, Project } from "../types";

type Props = {
  projects: Project[];
  designers: Designer[];
  canViewByDesigner: boolean;
};

const PRIORITIES: Priority[] = ["Urgent", "High", "Normal", "Low"];

const PRIORITY_COLORS: Record<Priority, string> = {
  Urgent: "#dc2626",
  High: "#ea580c",
  Normal: "#2563eb",
  Low: "#6b7280",
};

const NEUTRAL_BAR = "#4f46e5";

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
  const designerNames = (ids: string[]) =>
    ids.length === 0
      ? "Unassigned"
      : ids
          .map((id) => designers.find((d) => d.id === id)?.name ?? "")
          .filter(Boolean)
          .join("; ");
  const header = [
    "id",
    "title",
    "priority",
    "client",
    "brand",
    "contentType",
    "assignees",
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
    p.contentType,
    designerNames(p.assigneeIds),
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
        .join(","),
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

export function Analytics({ projects, designers, canViewByDesigner }: Props) {
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
      color: PRIORITY_COLORS[p],
    }));
    const byDesigner = designers
      .map((d) => ({
        label: d.name,
        color: d.color,
        count: filtered.filter((p) => p.assigneeIds.includes(d.id)).length,
      }))
      .sort((a, b) => b.count - a.count);
    const unassigned = filtered.filter((p) => p.assigneeIds.length === 0).length;
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
    const contentTypes = new Map<string, number>();
    filtered.forEach((p) => {
      const key = p.contentType || "—";
      contentTypes.set(key, (contentTypes.get(key) ?? 0) + 1);
    });
    const byContentType = [...contentTypes.entries()]
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
    const completedCount = filtered.filter((p) => p.status === "completed").length;
    const pausedCount = filtered.filter((p) => p.status === "paused").length;
    const archivedCount = filtered.filter((p) => p.archived).length;

    let totalMilestones = 0;
    let doneMilestones = 0;
    filtered.forEach((p) => {
      totalMilestones += p.milestones.length;
      doneMilestones += p.milestones.filter((m) => m.done).length;
    });

    const completionPct =
      totalMilestones === 0
        ? 0
        : Math.round((doneMilestones / totalMilestones) * 100);

    return {
      total,
      urgentCount,
      overdue,
      dueThisWeek,
      completedCount,
      pausedCount,
      archivedCount,
      byPriority,
      byDesigner,
      byBrand,
      byContentType,
      totalMilestones,
      doneMilestones,
      completionPct,
    };
  }, [filtered, designers]);

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

  const rangeLabel = from || to ? `${from || "…"} → ${to || "…"}` : "All time";

  const priorityChartData = stats.byPriority.filter((p) => p.count > 0);

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
        Showing projects commenced {rangeLabel} ({filtered.length} of{" "}
        {projects.length})
      </p>

      <div className="kpi-row">
        <Kpi label="Projects" value={stats.total} />
        <Kpi label="Urgent" value={stats.urgentCount} variant="urgent" />
        <Kpi label="Due in 7 days" value={stats.dueThisWeek} variant="duesoon" />
        <Kpi label="Overdue" value={stats.overdue} variant="overdue" />
        <CompletionKpi
          done={stats.doneMilestones}
          total={stats.totalMilestones}
          pct={stats.completionPct}
        />
      </div>

      <div className="kpi-row kpi-row-status">
        <Kpi
          label="Completed"
          value={stats.completedCount}
          variant="completed"
        />
        <Kpi label="Paused" value={stats.pausedCount} variant="paused" />
        <Kpi
          label="Archived"
          value={stats.archivedCount}
          variant="archived"
        />
      </div>

      <div className="panel-grid">
        <div className="panel">
          <h3>By priority</h3>
          {priorityChartData.length === 0 ? (
            <p className="muted small">No data.</p>
          ) : (
            <div className="chart-wrap" style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={priorityChartData}
                    dataKey="count"
                    nameKey="label"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {priorityChartData.map((entry) => (
                      <Cell key={entry.label} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => [value, "projects"]}
                  />
                  <Legend
                    verticalAlign="middle"
                    align="right"
                    layout="vertical"
                    iconType="circle"
                    wrapperStyle={{ fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="panel">
          <h3>By brand</h3>
          {stats.byBrand.length === 0 ? (
            <p className="muted small">No data.</p>
          ) : (
            <CategoryBars data={stats.byBrand} />
          )}
        </div>
      </div>

      {canViewByDesigner && (
        <div className="panel">
          <h3>By designer</h3>
          {stats.byDesigner.length === 0 ? (
            <p className="muted small">No data.</p>
          ) : (
            <CategoryBars
              data={stats.byDesigner}
              colored
              height={Math.max(220, stats.byDesigner.length * 36)}
            />
          )}
        </div>
      )}

      <div className="panel">
        <h3>By content type</h3>
        {stats.byContentType.length === 0 ? (
          <p className="muted small">No data.</p>
        ) : (
          <CategoryBars data={stats.byContentType} />
        )}
      </div>

      <div className="export-row">
        <button
          onClick={() =>
            download(
              `design-pm-projects-${todayISO()}.csv`,
              toCsv(filtered, designers),
              "text/csv;charset=utf-8",
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
              "application/json",
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
  variant?: "urgent" | "overdue" | "duesoon" | "completed" | "paused" | "archived";
}) {
  return (
    <div className={`kpi ${variant ?? ""}`}>
      <p className="kpi-label">{label}</p>
      <p className="kpi-value">{value}</p>
    </div>
  );
}

function CompletionKpi({
  done,
  total,
  pct,
}: {
  done: number;
  total: number;
  pct: number;
}) {
  return (
    <div className="kpi kpi-gauge">
      <div>
        <p className="kpi-label">Tasks</p>
        <p className="kpi-value">
          {done}
          <span className="kpi-sub"> / {total}</span>
        </p>
        <p className="muted small">{pct}% complete</p>
      </div>
      <div className="kpi-gauge-chart" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            innerRadius="70%"
            outerRadius="100%"
            data={[{ value: pct, fill: "#10b981" }]}
            startAngle={90}
            endAngle={-270}
          >
            <PolarAngleAxis
              type="number"
              domain={[0, 100]}
              tick={false}
              axisLine={false}
            />
            <RadialBar dataKey="value" cornerRadius={8} background />
          </RadialBarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

type CategoryRow = { label: string; count: number; color?: string };

function CategoryBars({
  data,
  colored,
  height,
}: {
  data: CategoryRow[];
  colored?: boolean;
  height?: number;
}) {
  const chartHeight = height ?? Math.max(180, data.length * 32);
  return (
    <div className="chart-wrap" style={{ height: chartHeight }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 20, bottom: 4, left: 8 }}
        >
          <XAxis
            type="number"
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "#6b7280" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            tick={{ fontSize: 12, fill: "#1d2433" }}
            axisLine={false}
            tickLine={false}
            width={120}
          />
          <Tooltip
            cursor={{ fill: "rgba(15, 23, 42, 0.04)" }}
            formatter={(value) => [value, "projects"]}
          />
          <Bar dataKey="count" radius={[0, 6, 6, 0]}>
            {data.map((row, i) => (
              <Cell
                key={i}
                fill={colored && row.color ? row.color : NEUTRAL_BAR}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
