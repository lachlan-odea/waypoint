import { useMemo, useState } from "react";
import type { Campaign, Designer, Speaker, WebinarKit } from "../../types";
import {
  ROLES,
  STAGES,
  STAGE_LABEL,
  STATUS,
  TYPES,
  allSeries,
  fmtDur,
  fmtNum,
  fmtPct,
  isMineKit,
  isMineSection,
  kitName,
  kitOf,
  kitState,
  resultRows,
  sectionPeople,
  seriesLabel,
  typeTag,
  type KitState,
  type SectionInfo,
} from "../../webinarKit";
import { formatShort, shiftIso, todayIso } from "../../dates";
import { Avatar } from "../Avatar";
import { Icon } from "../Icon";
import { EmptyNote, StatusChip } from "../pages/ItemPage";
import { KIT_STATUS_CHIP, pad } from "./kitUi";
import { NewWebinarModal } from "./NewWebinarModal";
import { SpeakerDirectory } from "./SpeakerDirectory";

// The Webinars tab of the Campaigns page: the pipeline of webinar
// campaigns by stage, the cross-webinar tracker and the results table.

type Props = {
  campaigns: Campaign[];
  designers: Designer[];
  currentDesignerId: string;
  onOpen: (campaignId: string, tab?: string) => void;
  onCreate: (campaign: Campaign) => void;
  // The speaker directory.
  speakers: Speaker[];
  onSaveSpeaker: (speaker: Speaker) => void;
  onDeleteSpeaker: (id: string) => void;
};

type Sub = "pipeline" | "tracker" | "results" | "speakers";

const UI_KEY = "waypoint.webinars.ui";
type Ui = { sub: Sub; q: string; type: string; mine: boolean; parked: boolean; group: "stage" | "series"; team: string; trMine: boolean; trDone: boolean };
const DEFAULT_UI: Ui = { sub: "pipeline", q: "", type: "all", mine: false, parked: false, group: "stage", team: "all", trMine: false, trDone: false };

function loadUi(): Ui {
  try {
    return { ...DEFAULT_UI, ...(JSON.parse(localStorage.getItem(UI_KEY) ?? "{}") as Partial<Ui>) };
  } catch {
    return DEFAULT_UI;
  }
}

export function WebinarPipeline({ campaigns, designers, currentDesignerId, onOpen, onCreate, speakers, onSaveSpeaker, onDeleteSpeaker }: Props) {
  const [ui, setUiState] = useState<Ui>(loadUi);
  const setUi = (patch: Partial<Ui>) =>
    setUiState((cur) => {
      const next = { ...cur, ...patch };
      try {
        localStorage.setItem(UI_KEY, JSON.stringify(next));
      } catch {
        // per-browser preference only
      }
      return next;
    });
  const [creating, setCreating] = useState<null | { from?: Campaign; preset?: Partial<WebinarKit> & { name?: string } }>(null);
  const today = todayIso();

  const webinars = useMemo(() => campaigns.filter((c) => !!kitOf(c)), [campaigns]);
  const states = useMemo(() => new Map(webinars.map((c) => [c.id, kitState(kitOf(c)!, today)])), [webinars, today]);
  const active = webinars.filter((c) => !states.get(c.id)!.parked);

  function create(campaign: Campaign) {
    onCreate(campaign);
    setCreating(null);
    onOpen(campaign.id, "brief");
  }

  return (
    <div className="wb">
      <div className="wb-head">
        <div>
          <div className="eyebrow">CargoWise &amp; WiseTech Global · 2026</div>
          <h2>
            {ui.sub === "pipeline" ? "Webinar pipeline" : ui.sub === "tracker" ? "Tracker" : ui.sub === "results" ? "Results" : "Speakers"}
          </h2>
          <p className="muted">
            {ui.sub === "pipeline"
              ? "Every webinar from proposal to results. Due dates follow the 2026 webinar kit, counted back from each go-live date."
              : ui.sub === "tracker"
                ? "What is due, by whom, across every webinar in flight. Filter by team to see your hand-offs."
                : ui.sub === "results"
                  ? "Compare webinars on the same measures, against the targets set in each brief."
                  : "The people who present. Saved once, added to any webinar from its speaker list."}
          </p>
        </div>
        <div className="wb-head-right">
          <div className="item-tabs wb-subtabs" role="tablist" aria-label="Webinar views">
            {(["pipeline", "tracker", "results", "speakers"] as Sub[]).map((s) => (
              <button key={s} type="button" role="tab" aria-selected={ui.sub === s} className={`item-tab ${ui.sub === s ? "active" : ""}`} onClick={() => setUi({ sub: s })}>
                {s === "pipeline" ? "Pipeline" : s === "tracker" ? "Tracker" : s === "results" ? "Results" : "Speakers"}
                {s === "speakers" && speakers.length > 0 && <span className="item-tab-count">{speakers.length}</span>}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setCreating({})}>
            <Icon name="add-plus" size={16} /> New webinar
          </button>
        </div>
      </div>

      {ui.sub === "pipeline" && (
        <Pipeline webinars={webinars} active={active} states={states} ui={ui} setUi={setUi} designers={designers} me={currentDesignerId} onOpen={onOpen} onNew={() => setCreating({})} />
      )}
      {ui.sub === "tracker" && <Tracker active={active} states={states} ui={ui} setUi={setUi} designers={designers} me={currentDesignerId} onOpen={onOpen} />}
      {ui.sub === "results" && <Results webinars={webinars} onOpen={onOpen} />}
      {ui.sub === "speakers" && <SpeakerDirectory speakers={speakers} campaigns={campaigns} onSave={onSaveSpeaker} onDelete={onDeleteSpeaker} />}

      {creating && (
        <NewWebinarModal
          designers={designers}
          currentDesignerId={currentDesignerId}
          series={allSeries(campaigns)}
          preset={creating.from ? { ...creating.preset, from: creating.from } : creating.preset}
          onCancel={() => setCreating(null)}
          onCreate={create}
        />
      )}
    </div>
  );
}

// ── Pipeline ────────────────────────────────────────────────────────────

function Pipeline({
  webinars,
  active,
  states,
  ui,
  setUi,
  designers,
  me,
  onOpen,
  onNew,
}: {
  webinars: Campaign[];
  active: Campaign[];
  states: Map<string, KitState>;
  ui: Ui;
  setUi: (p: Partial<Ui>) => void;
  designers: Designer[];
  me: string;
  onOpen: Props["onOpen"];
  onNew: () => void;
}) {
  const today = todayIso();
  let dueWeek = 0, overdue = 0;
  for (const c of active) for (const i of states.get(c.id)!.infos) {
    if (i.late) overdue++;
    else if (i.open && i.due && i.days !== null && i.days <= 7) dueWeek++;
  }
  const nextLive = active
    .filter((c) => kitOf(c)!.goLive && kitOf(c)!.goLive >= today)
    .sort((a, b) => kitOf(a)!.goLive.localeCompare(kitOf(b)!.goLive))[0];

  if (!webinars.length) {
    return (
      <div className="item-missing">
        <h2>No webinar projects yet</h2>
        <p className="muted">
          Each webinar gets a workspace built from the 2026 webinar kit: brief, core message, landing page inputs, speakers and assets, runsheet, pre-promotion, final checks, post-promotion and results. Due dates are set from the go-live date you choose.
        </p>
        <button type="button" className="btn btn-primary" onClick={onNew}>
          <Icon name="add-plus" size={16} /> Start a webinar
        </button>
      </div>
    );
  }

  const q = ui.q.trim().toLowerCase();
  const list = webinars.filter((c) => {
    const kit = kitOf(c)!;
    const st = states.get(c.id)!;
    if (ui.type !== "all" && kit.type !== ui.type) return false;
    if (ui.mine && !isMineKit(kit, me)) return false;
    if (!ui.parked && st.parked) return false;
    if (q && ![c.name, kit.wt, kit.ft, kit.series].some((s) => s.toLowerCase().includes(q))) return false;
    return true;
  });
  const series = allSeries(webinars);
  const byLive = (a: Campaign, b: Campaign) => (kitOf(a)!.goLive || "9999").localeCompare(kitOf(b)!.goLive || "9999") || kitName(a).localeCompare(kitName(b));

  const groups: { label: string; sub?: string; items: Campaign[]; showStage?: boolean }[] = [];
  if (ui.group === "series" && series.length) {
    for (const name of series) {
      const items = list.filter((c) => kitOf(c)!.series === name).sort((a, b) => (kitOf(a)!.ep ?? 99) - (kitOf(b)!.ep ?? 99) || byLive(a, b));
      if (!items.length) continue;
      const lives = items.map((c) => kitOf(c)!.goLive).filter(Boolean).sort();
      groups.push({
        label: name,
        sub: `${items.length} ${items.length === 1 ? "episode" : "episodes"} · ${lives.length ? formatShort(lives[0]) + (lives.length > 1 ? ` to ${formatShort(lives[lives.length - 1])}` : "") : "Go-live dates not set"}`,
        items,
        showStage: true,
      });
    }
    const solo = list.filter((c) => !kitOf(c)!.series).sort(byLive);
    if (solo.length) groups.push({ label: "Standalone webinars", sub: String(solo.length), items: solo, showStage: true });
  } else {
    for (const s of STAGES) {
      const items = list.filter((c) => kitOf(c)!.stage === s.k).sort(byLive);
      if (items.length) groups.push({ label: s.label, sub: String(items.length), items });
    }
  }

  return (
    <>
      <div className="wb-summary">
        <span className="kit-chip">{active.length} active</span>
        <span className={`kit-chip ${dueWeek ? "warn" : ""}`}>{dueWeek} due in the next 7 days</span>
        <span className={`kit-chip ${overdue ? "bad" : "ok"}`}>{overdue} overdue</span>
        {nextLive && (
          <span className="kit-chip info">
            Next go-live: {kitName(nextLive)} · {formatShort(kitOf(nextLive)!.goLive)}
          </span>
        )}
      </div>
      <div className="wb-filters">
        <div className="wb-search">
          <Icon name="search" size={16} />
          <input type="search" value={ui.q} placeholder="Search webinars" aria-label="Search webinars" onChange={(e) => setUi({ q: e.target.value })} />
        </div>
        <div className="kit-seg" role="group" aria-label="Webinar type">
          <button type="button" aria-pressed={ui.type === "all"} onClick={() => setUi({ type: "all" })}>
            All types
          </button>
          {Object.entries(TYPES).map(([k, t]) => (
            <button key={k} type="button" aria-pressed={ui.type === k} onClick={() => setUi({ type: k })}>
              {t.tag}
            </button>
          ))}
        </div>
        <button type="button" className="kit-toggle" aria-pressed={ui.mine} onClick={() => setUi({ mine: !ui.mine })}>
          My webinars
        </button>
        <button type="button" className="kit-toggle" aria-pressed={ui.parked} onClick={() => setUi({ parked: !ui.parked })}>
          Show complete and parked
        </button>
        {series.length > 0 && (
          <div className="kit-seg" role="group" aria-label="Group webinars">
            <button type="button" aria-pressed={ui.group === "stage"} onClick={() => setUi({ group: "stage" })}>
              By stage
            </button>
            <button type="button" aria-pressed={ui.group === "series"} onClick={() => setUi({ group: "series" })}>
              By series
            </button>
          </div>
        )}
      </div>
      <Legend />
      {!list.length && <EmptyNote>No webinars match these filters.</EmptyNote>}
      {groups.map((g) => (
        <section key={g.label} className="wb-group">
          <div className="wb-group-title">
            <h3>{g.label}</h3>
            {g.sub && <span className="mono">{g.sub}</span>}
          </div>
          <div className="wb-cards">
            {g.items.map((c) => (
              <WebinarCard key={c.id} c={c} st={states.get(c.id)!} designers={designers} showStage={g.showStage} onOpen={onOpen} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

function Legend({ extra }: { extra?: React.ReactNode }) {
  return (
    <div className="kit-legend" aria-label="Legend">
      {(["todo", "doing", "review", "done", "blocked"] as const).map((k) => (
        <span key={k}>
          <i className={`kit-sdot st-${k}`} /> {STATUS[k]}
        </span>
      ))}
      <span>
        <i className="kit-ring" /> Overdue
      </span>
      {extra}
    </div>
  );
}

function tminus(n: number | null): string {
  if (n === null) return "";
  if (n > 0) return `T−${n}`;
  if (n === 0) return "Today";
  return `T+${-n}`;
}

function daysTo(iso: string, today: string): number {
  return Math.round((new Date(`${iso}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86400000);
}

function WebinarCard({ c, st, designers, showStage, onOpen }: { c: Campaign; st: KitState; designers: Designer[]; showStage?: boolean; onOpen: Props["onOpen"] }) {
  const kit = kitOf(c)!;
  const today = todayIso();
  const n = kit.goLive ? daysTo(kit.goLive, today) : null;
  const sub = kit.ft || kit.wt;
  const next = st.next;
  const lead = kit.lead ? designers.find((d) => d.id === kit.lead) : undefined;
  return (
    <button type="button" className="wb-card" onClick={() => onOpen(c.id, "overview")}>
      <div className="wb-card-top">
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">{typeTag(kit)}</div>
          {kit.series && <p className="wb-series">{seriesLabel(kit)}</p>}
          <h4>{kitName(c)}</h4>
          {sub && sub !== kitName(c) && <p className="wb-ttl">{sub}</p>}
        </div>
        <HealthChip st={st} kit={kit} />
      </div>
      <div className="wb-mstrip-row">
        <div className="wb-mstrip" role="img" aria-label={`${st.done} of ${st.total} sections done${st.late.length ? `, ${st.late.length} overdue` : ""}`}>
          {st.infos.map((i) => (
            <i key={i.s.k} className={`st-${i.st} ${i.late ? "late" : ""}`} title={`${i.s.short}: ${STATUS[i.st]}${i.late ? " · overdue" : ""}`} />
          ))}
        </div>
        <span className="mono">
          {st.done}/{st.total}
        </span>
      </div>
      <dl className="wb-kv">
        {showStage && (
          <>
            <dt>Stage</dt>
            <dd>{STAGE_LABEL[kit.stage]}</dd>
          </>
        )}
        <dt>Go-live</dt>
        <dd>{kit.goLive ? `${formatShort(kit.goLive)} · ${n === 0 ? "today" : n! > 0 ? `in ${n} days` : `${-n!} days ago`}` : "Not set"}</dd>
        <dt>Next</dt>
        <dd className={next?.late ? "late" : ""}>
          {next ? `${next.s.short}${next.due ? `${next.late ? " · overdue since " : " · due "}${formatShort(next.due)}` : ""}` : "All sections done"}
        </dd>
      </dl>
      <div className="wb-card-foot">
        {lead ? (
          <span className="item-person">
            <Avatar designer={lead} size={20} /> {lead.name}
          </span>
        ) : (
          <span className="item-hint">No lead yet</span>
        )}
        <span className="mono">{tminus(n)}</span>
      </div>
    </button>
  );
}

function HealthChip({ st, kit }: { st: KitState; kit: WebinarKit }) {
  if (kit.archived) return <span className="kit-chip line">Archived</span>;
  if (!st.health) return <span className="kit-chip line">{STAGE_LABEL[kit.stage]}</span>;
  return <StatusChip status={st.health.k === "bad" ? "blocked" : st.health.k === "warn" ? "scheduled" : "live"}>{st.health.label}</StatusChip>;
}

// ── Tracker ─────────────────────────────────────────────────────────────

type Row = { c: Campaign; days: number } & ({ i: SectionInfo; ev?: undefined } | { i?: undefined; ev: "Recording" | "Go-live"; date: string });

function Tracker({
  active,
  states,
  ui,
  setUi,
  designers,
  me,
  onOpen,
}: {
  active: Campaign[];
  states: Map<string, KitState>;
  ui: Ui;
  setUi: (p: Partial<Ui>) => void;
  designers: Designer[];
  me: string;
  onOpen: Props["onOpen"];
}) {
  const today = todayIso();
  const projs = active.slice().sort((a, b) => (kitOf(a)!.goLive || "9999").localeCompare(kitOf(b)!.goLive || "9999"));
  const rows: Row[] = [];
  for (const c of projs) {
    const kit = kitOf(c)!;
    for (const i of states.get(c.id)!.infos) {
      if (!i.due) continue;
      if (!i.open && !ui.trDone) continue;
      if (ui.team !== "all" && i.s.owner !== ui.team && !i.s.with.includes(ui.team)) continue;
      if (ui.trMine && !isMineSection(kit, i.s, me)) continue;
      rows.push({ c, i, days: i.days ?? 0 });
    }
    if (ui.team === "all" && !ui.trMine) {
      const rec = kit.delivery === "prerecorded" ? kit.recordDate : "";
      if (rec && rec >= today) rows.push({ c, ev: "Recording", date: rec, days: daysTo(rec, today) });
      if (kit.goLive && kit.goLive >= today) rows.push({ c, ev: "Go-live", date: kit.goLive, days: daysTo(kit.goLive, today) });
    }
  }
  rows.sort((a, b) => a.days - b.days);
  const groups = [
    { k: "late", label: "Overdue", test: (r: Row) => !!r.i?.late },
    { k: "week", label: "Next 7 days", test: (r: Row) => !r.i?.late && r.days <= 6 },
    { k: "two", label: "In 1–3 weeks", test: (r: Row) => !r.i?.late && r.days > 6 && r.days <= 20 },
    { k: "later", label: "Later", test: (r: Row) => !r.i?.late && r.days > 20 },
  ];
  return (
    <>
      <div className="wb-filters">
        <select value={ui.team} onChange={(e) => setUi({ team: e.target.value })} aria-label="Team" style={{ minWidth: 240 }}>
          <option value="all">All teams</option>
          {Object.entries(ROLES).map(([k, r]) => (
            <option key={k} value={k}>
              {r.label}
            </option>
          ))}
        </select>
        <button type="button" className="kit-toggle" aria-pressed={ui.trMine} onClick={() => setUi({ trMine: !ui.trMine })}>
          Assigned to me
        </button>
        <button type="button" className="kit-toggle" aria-pressed={ui.trDone} onClick={() => setUi({ trDone: !ui.trDone })}>
          Include done
        </button>
      </div>
      <section className="item-card wb-tl-card">
        <div className="item-card-head">
          <h3>Timeline</h3>
          <Legend
            extra={
              <>
                <span>
                  <i className="kit-dia rec" /> Recording
                </span>
                <span>
                  <i className="kit-dia" /> Go-live
                </span>
              </>
            }
          />
        </div>
        <div className="item-card-body">
          <TrackerTimeline projs={projs} states={states} today={today} onOpen={onOpen} />
        </div>
      </section>
      {groups.map((g) => {
        const rs = rows.filter(g.test);
        if (!rs.length) return null;
        return (
          <section key={g.k} className="wb-due-group">
            <h3 className={g.k === "late" ? "late" : ""}>
              {g.label} <span className="mono">· {rs.length}</span>
            </h3>
            <ul className="wb-duelist item-card">
              {rs.map((r, idx) => (
                <li key={`${r.c.id}-${r.i ? r.i.s.k : r.ev}-${idx}`}>
                  <DueRow r={r} designers={designers} onOpen={onOpen} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {!rows.length && <EmptyNote>{projs.length ? "Nothing due for this filter." : "No active webinars yet."}</EmptyNote>}
    </>
  );
}

function DueRow({ r, designers, onOpen }: { r: Row; designers: Designer[]; onOpen: Props["onOpen"] }) {
  const kit = kitOf(r.c)!;
  if (r.ev) {
    return (
      <button type="button" className="wb-drow" onClick={() => onOpen(r.c.id, "overview")}>
        <span className="wb-dd mono">
          {formatShort(r.date)}
          <br />
          <span className="item-hint">{tminus(r.days)}</span>
        </span>
        <span className="wb-dt">
          <b>{r.ev}</b>
          <span>
            {kitName(r.c)}
            {kit.series ? ` · ${seriesLabel(kit)}` : ""}
          </span>
        </span>
        <span className="wb-dw">Key date</span>
        <span className="wb-ds">
          <span className="kit-chip info">{r.ev}</span>
        </span>
      </button>
    );
  }
  const i = r.i!;
  const people = sectionPeople(kit, i.s).map((id) => designers.find((d) => d.id === id)).filter((d) => !!d);
  return (
    <button type="button" className="wb-drow" onClick={() => onOpen(r.c.id, i.s.k)}>
      <span className={`wb-dd mono ${i.late ? "late" : ""}`}>
        {formatShort(i.due)}
        <br />
        <span className={i.late ? "" : "item-hint"}>{i.late ? `${-r.days} days late` : tminus(r.days)}</span>
      </span>
      <span className="wb-dt">
        <b>
          {pad(i.s.n)} · {i.s.title}
        </b>
        <span>
          {kitName(r.c)}
          {kit.series ? ` · ${seriesLabel(kit)}` : ` · ${typeTag(kit)}`}
        </span>
      </span>
      <span className="wb-dw">
        {people.length ? (
          <>
            <Avatar designer={people[0]} size={20} /> {people[0].name}
            {people.length > 1 ? ` +${people.length - 1}` : ""}
          </>
        ) : (
          ROLES[i.s.owner].label
        )}
      </span>
      <span className="wb-ds">
        <StatusChip status={KIT_STATUS_CHIP[i.st]}>{STATUS[i.st]}</StatusChip>
      </span>
    </button>
  );
}

function TrackerTimeline({ projs, states, today, onOpen }: { projs: Campaign[]; states: Map<string, KitState>; today: string; onOpen: Props["onOpen"] }) {
  let earliest = shiftIso(today, -28);
  for (const c of projs) for (const i of states.get(c.id)!.infos) if (i.late && i.due < earliest) earliest = i.due;
  const start = [shiftIso(today, -84), shiftIso(earliest, -5)].sort()[1];
  const end = shiftIso(today, 112);
  const span = Math.max(1, daysTo(end, start));
  const pos = (iso: string) => `${Math.max(0, Math.min(100, (-daysTo(start, iso) / span) * 100))}%`;
  const ticks: string[] = [];
  const step = span > 150 ? 14 : 7;
  let d = start;
  while (new Date(`${d}T00:00:00`).getDay() !== 1) d = shiftIso(d, 1);
  for (; d <= end; d = shiftIso(d, step)) ticks.push(d);
  return (
    <div className="kit-gantt wb-gantt">
      <div className="kit-g-axis">
        <span className="eyebrow">Webinar</span>
        <div className="kit-g-ticks">
          {ticks.map((t) => (
            <span key={t} className="kit-g-tick" style={{ left: pos(t) }}>
              {new Date(`${t}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" }).toUpperCase()}
            </span>
          ))}
        </div>
      </div>
      {!projs.length && (
        <div className="kit-g-row">
          <div className="kit-g-label item-hint">No active webinars</div>
          <div className="kit-g-track" />
        </div>
      )}
      {projs.map((c) => {
        const kit = kitOf(c)!;
        const st = states.get(c.id)!;
        const starts = st.infos.map((i) => i.start).filter(Boolean).sort();
        const dues = st.infos.map((i) => i.due).filter(Boolean).sort();
        const a = starts[0], b = dues[dues.length - 1];
        const rec = kit.delivery === "prerecorded" ? kit.recordDate : "";
        return (
          <div key={c.id} className="kit-g-row">
            <div className="kit-g-label">
              <button type="button" className="link-btn" onClick={() => onOpen(c.id, "overview")} title={kit.series ? `${seriesLabel(kit)} · ${kitName(c)}` : kitName(c)}>
                {kit.series && kit.ep ? `Ep ${kit.ep} · ` : ""}
                {kitName(c)}
              </button>
            </div>
            <div className="kit-g-track">
              {a && b && b >= start && a <= end && <span className="kit-g-span" style={{ left: pos(a), width: `calc(${pos(b)} - ${pos(a)})` }} />}
              {st.infos
                .filter((i) => i.due && i.due >= start && i.due <= end)
                .map((i) => (
                  <button
                    key={i.s.k}
                    type="button"
                    className={`kit-g-dot st-${i.st} ${i.late ? "late" : ""}`}
                    style={{ left: pos(i.due) }}
                    title={`${kitName(c)}\n${pad(i.s.n)} ${i.s.title}\n${STATUS[i.st]} · due ${formatShort(i.due)}${i.late ? " · overdue" : ""}`}
                    aria-label={`${i.s.title}, ${STATUS[i.st]}, due ${formatShort(i.due)}`}
                    onClick={() => onOpen(c.id, i.s.k)}
                  />
                ))}
              {rec && rec >= start && rec <= end && <span className="kit-g-dia rec" style={{ left: pos(rec) }} title={`Recording · ${formatShort(rec)}`} />}
              {kit.goLive && kit.goLive >= start && kit.goLive <= end && <span className="kit-g-dia" style={{ left: pos(kit.goLive) }} title={`Go-live · ${formatShort(kit.goLive)}`} />}
            </div>
          </div>
        );
      })}
      <span className="kit-g-today" style={{ left: `calc(132px + (100% - 132px) * ${parseFloat(pos(today)) / 100})` }} />
    </div>
  );
}

// ── Results ─────────────────────────────────────────────────────────────

function Results({ webinars, onOpen }: { webinars: Campaign[]; onOpen: Props["onOpen"] }) {
  const rows = resultRows(webinars);
  if (!rows.length) {
    return <EmptyNote>No results yet. Results appear here once Digital adds registrants and attendees in section 09 of a webinar.</EmptyNote>;
  }
  const avg = (pick: (r: (typeof rows)[number]) => number | null) => {
    const xs = rows.map(pick).filter((x): x is number => x != null);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  };
  const learn = rows.filter((r) => r.v.worked || r.v.under || r.v.recs);
  const s = (x: unknown) => (typeof x === "string" ? x : "");
  return (
    <>
      <section className="item-card">
        <div className="wb-tbl-wrap">
          <table className="wb-tbl">
            <thead>
              <tr>
                <th>Webinar</th>
                <th>Go-live</th>
                <th className="n">Registrants</th>
                <th className="n">Attendees</th>
                <th className="n">Attendance</th>
                <th className="n">Page → reg</th>
                <th className="n">Live watch</th>
                <th className="n">On-demand watch</th>
                <th>Decision</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.c.id}>
                  <td>
                    <button type="button" className="link-btn" onClick={() => onOpen(r.c.id, "results")}>
                      {kitName(r.c)}
                    </button>
                    <span className="wb-sub">{r.kit.series ? seriesLabel(r.kit) : typeTag(r.kit)}</span>
                  </td>
                  <td className="mono">{r.kit.goLive ? formatShort(r.kit.goLive) : "—"}</td>
                  <td className="n">
                    {fmtNum(r.regs)}
                    {r.tReg ? <span className="wb-sub">target {fmtNum(r.tReg)}</span> : null}
                  </td>
                  <td className="n">{fmtNum(r.atts)}</td>
                  <td className="n">
                    {fmtPct(r.att)}
                    {r.tAtt ? <span className="wb-sub">target {r.tAtt}%</span> : null}
                  </td>
                  <td className="n">{fmtPct(r.conv)}</td>
                  <td className="n">{fmtDur(r.live)}</td>
                  <td className="n">{fmtDur(r.od)}</td>
                  <td>{r.decision || <span className="item-hint">Not decided</span>}</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 1 && (
              <tfoot>
                <tr>
                  <td>Average of {rows.length}</td>
                  <td />
                  <td className="n">{fmtNum(avg((r) => r.regs) == null ? null : Math.round(avg((r) => r.regs)!))}</td>
                  <td className="n">{fmtNum(avg((r) => r.atts) == null ? null : Math.round(avg((r) => r.atts)!))}</td>
                  <td className="n">{fmtPct(avg((r) => r.att))}</td>
                  <td className="n">{fmtPct(avg((r) => r.conv))}</td>
                  <td className="n">{fmtDur(avg((r) => r.live) == null ? null : Math.round(avg((r) => r.live)!))}</td>
                  <td className="n">{fmtDur(avg((r) => r.od) == null ? null : Math.round(avg((r) => r.od)!))}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
      <div className="wb-head" style={{ paddingTop: 24 }}>
        <div>
          <h2 style={{ fontSize: 22 }}>Learnings</h2>
          <p className="muted">What each webinar taught the team, from section 09.</p>
        </div>
      </div>
      {learn.length ? (
        <div className="wb-cards">
          {learn.map((r) => (
            <section key={r.c.id} className="item-card wb-gcard">
              <div className="item-card-body">
                <div className="eyebrow">{typeTag(r.kit)}</div>
                <h4>{kitName(r.c)}</h4>
                {s(r.v.worked) && (
                  <>
                    <div className="eyebrow">Worked well</div>
                    <p>{s(r.v.worked)}</p>
                  </>
                )}
                {s(r.v.under) && (
                  <>
                    <div className="eyebrow">Underperformed</div>
                    <p>{s(r.v.under)}</p>
                  </>
                )}
                {s(r.v.recs) && (
                  <>
                    <div className="eyebrow">Next time</div>
                    <p>{s(r.v.recs)}</p>
                  </>
                )}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <EmptyNote>No learnings recorded yet. Add them in section 09 of each webinar.</EmptyNote>
      )}
    </>
  );
}

