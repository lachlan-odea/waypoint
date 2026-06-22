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
import type { Designer, Priority, Project, Workspace } from "../types";

type Props = {
  // Every project across every workspace. Analytics filters this down based
  // on its own workspace selector — the sidebar's currently-active workspace
  // only sets the initial selection.
  allProjects: Project[];
  // Full designer list, used as the source for the By-designer chart. When
  // a single workspace is selected, the chart is narrowed to that
  // workspace's memberIds (if any).
  allDesigners: Designer[];
  // All known workspaces, used to populate the workspace selector.
  workspaces: Workspace[];
  canViewByDesigner: boolean;
};

const ALL_WORKSPACES = "__all__";

// A project counts toward the "needs attention" KPIs (Urgent / Due in 7
// days / Overdue) only if it's live work — active status and not archived.
// Matches the predicate used by the Overdue chip on project cards.
function isLiveWork(p: Project): boolean {
  if (p.archived) return false;
  return (p.status ?? "active") === "active";
}

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

type QuickRange = "7" | "30" | "90" | "month" | "all";

// Derive which quick-range button (if any) corresponds to the current
// from/to values. Returns null when the dates don't line up with a preset —
// e.g. the user typed a custom range. Today's-date-sensitive so it'll
// silently lose the highlight at midnight, which is fine.
function detectActiveQuickRange(from: string, to: string): QuickRange | null {
  if (!from && !to) return "all";
  if (!from || !to) return null;
  const today = todayISO();
  if (to !== today) return null;
  if (from === startOfMonth(today)) return "month";
  if (from === shiftDays(today, -6)) return "7";
  if (from === shiftDays(today, -29)) return "30";
  if (from === shiftDays(today, -89)) return "90";
  return null;
}

export function Analytics({
  allProjects,
  allDesigners,
  workspaces,
  canViewByDesigner,
}: Props) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  // Default to All workspaces so the page opens on the broadest view; users
  // narrow to a specific workspace via the dropdown.
  const [selectedWorkspaceId, setSelectedWorkspaceId] =
    useState<string>(ALL_WORKSPACES);

  // Projects narrowed to the selected workspace (or all of them when
  // ALL_WORKSPACES is picked).
  const workspaceProjects = useMemo(() => {
    if (selectedWorkspaceId === ALL_WORKSPACES) return allProjects;
    return allProjects.filter((p) => p.workspaceId === selectedWorkspaceId);
  }, [allProjects, selectedWorkspaceId]);

  // Designers shown in the By-designer chart. For a specific workspace, use
  // the workspace's memberIds when set; an empty memberIds list is "open"
  // (everyone). For "All workspaces", show the full designer list.
  const designers = useMemo(() => {
    if (selectedWorkspaceId === ALL_WORKSPACES) return allDesigners;
    const ws = workspaces.find((w) => w.id === selectedWorkspaceId);
    const members = ws?.memberIds ?? [];
    if (members.length === 0) return allDesigners;
    const memberSet = new Set(members);
    return allDesigners.filter((d) => memberSet.has(d.id));
  }, [allDesigners, workspaces, selectedWorkspaceId]);

  const filtered = useMemo(() => {
    if (!from && !to) return workspaceProjects;
    return workspaceProjects.filter((p) => {
      const c = commencedDate(p);
      if (!c) return false;
      if (from && c < from) return false;
      if (to && c > to) return false;
      return true;
    });
  }, [workspaceProjects, from, to]);

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

    // "Needs attention" KPIs are scoped to live work only — completed,
    // paused, and archived projects don't count as overdue / due-soon /
    // urgent even if their due date or priority would otherwise qualify.
    const live = filtered.filter(isLiveWork);

    let overdue = 0;
    let dueThisWeek = 0;
    live.forEach((p) => {
      const d = daysFromNow(p.dueDate);
      if (d === null) return;
      if (d < 0) overdue++;
      else if (d <= 7) dueThisWeek++;
    });

    const urgentCount = live.filter((p) => p.priority === "Urgent").length;
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

  function applyQuickRange(kind: QuickRange) {
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

  const activeQuickRange = detectActiveQuickRange(from, to);
  const rangeLabel = from || to ? `${from || "…"} → ${to || "…"}` : "All time";

  const priorityChartData = stats.byPriority.filter((p) => p.count > 0);

  return (
    <div className="analytics">
      <div className="filter-bar">
        <div className="filter-fields">
          <label className="field-inline">
            <span>Team</span>
            <select
              value={selectedWorkspaceId}
              onChange={(e) => setSelectedWorkspaceId(e.target.value)}
            >
              <option value={ALL_WORKSPACES}>All teams</option>
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
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
          {(
            [
              ["7", "Last 7d"],
              ["30", "Last 30d"],
              ["90", "Last 90d"],
              ["month", "This month"],
              ["all", "All time"],
            ] as Array<[QuickRange, string]>
          ).map(([kind, label]) => (
            <button
              key={kind}
              className={activeQuickRange === kind ? "active" : ""}
              onClick={() => applyQuickRange(kind)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className="muted small filter-summary">
        Showing {filtered.length} of {workspaceProjects.length}{" "}
        {selectedWorkspaceId === ALL_WORKSPACES
          ? "projects across all teams"
          : `${workspaces.find((w) => w.id === selectedWorkspaceId)?.name ?? ""} projects`}
        {", "}commenced {rangeLabel}
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
              `waypoint-projects-${todayISO()}.csv`,
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
              `waypoint-projects-${todayISO()}.json`,
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
