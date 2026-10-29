import { useState } from "react";
import type { Campaign } from "../../types";
import {
  OV_FIELDS,
  ROLES,
  SEC_BY_KEY,
  STATUS,
  kitState,
  sectionPeople,
  type KitState,
} from "../../webinarKit";
import { formatShort, shiftIso, timeAgo, todayIso } from "../../dates";
import { Avatar } from "../Avatar";
import { Icon } from "../Icon";
import { EmptyNote, ItemGrid, SideCard, StatusChip } from "../pages/ItemPage";
import { KitField } from "./KitField";
import { KitFilesCard } from "./KitSection";
import { pad } from "./kitUi";
import type { KitApi } from "./kitApi";

// The Overview tab of a webinar campaign: what's next, the schedule, the
// project details, the team and recent activity.

export function KitOverview({
  api,
  onSection,
  onTab,
  manage,
}: {
  api: KitApi;
  onSection: (key: string) => void;
  onTab: (tab: string) => void;
  manage?: React.ReactNode;
}) {
  const today = todayIso();
  const st = kitState(api.kit, today);
  return (
    <ItemGrid
      main={
        <>
          <SideCard title="Schedule">
            <KitGantt api={api} st={st} onSection={onSection} />
          </SideCard>
          <SideCard title="Project details">
            <div className="kit-fields">
              {OV_FIELDS.filter((f) => !f.show || f.show(api.kit)).map((f) => (
                <KitField key={f.k} f={f} sec="" api={api} />
              ))}
            </div>
          </SideCard>
          <SideCard title="Team" aside={<span className="item-hint">Section owners come from these roles</span>}>
            <TeamEditor api={api} />
          </SideCard>
        </>
      }
      sideTop={
        <>
          <SideCard title="Up next" aside={<span className="item-hint">{st.infos.filter((i) => i.open).length} open</span>}>
            <UpNext api={api} st={st} onSection={onSection} />
          </SideCard>
          <SideCard
            title="Recent activity"
            aside={
              <button type="button" className="link-btn" onClick={() => onTab("activity")}>
                All activity
              </button>
            }
          >
            <KitActivityList api={api} max={6} />
          </SideCard>
        </>
      }
      sideBottom={
        <>
          <KitFilesCard section="" api={api} all />
          {manage && <SideCard title="Manage">{manage}</SideCard>}
        </>
      }
    />
  );
}

function UpNext({ api, st, onSection }: { api: KitApi; st: KitState; onSection: (k: string) => void }) {
  const open = st.infos.filter((i) => i.open).sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999")).slice(0, 4);
  if (!open.length) return <EmptyNote>Every section is done or not needed.</EmptyNote>;
  return (
    <ul className="kit-next">
      {open.map((i) => {
        const people = sectionPeople(api.kit, i.s).map((id) => api.designers.find((d) => d.id === id)).filter((d) => !!d);
        return (
          <li key={i.s.k}>
            <button type="button" onClick={() => onSection(i.s.k)}>
              <span className="kit-nn">{pad(i.s.n)}</span>
              <span className="kit-nmain">
                <span className="kit-nl">{i.s.title}</span>
                <span className="kit-no">
                  {ROLES[i.s.owner].label}
                  {people[0] ? ` · ${people[0].name}` : ""} · {STATUS[i.st]}
                </span>
              </span>
              <span className={`kit-nd ${i.late ? "late" : ""}`}>
                {i.due ? formatShort(i.due) : "No date"}
                <br />
                <span>{i.due ? (i.late ? `${-i.days!} days late` : i.days === 0 ? "today" : `T−${i.days}`) : ""}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// The sections as bars from start to due, with the key dates above and
// today as a line. One Cobalt highlight: today.
export function KitGantt({ api, st, onSection }: { api: KitApi; st: KitState; onSection?: (k: string) => void }) {
  const { kit } = api;
  const today = todayIso();
  const v = kit.values.final ?? {};
  const events: { d: string; label: string; cls: string }[] = [];
  const s = (x: unknown) => (typeof x === "string" ? x : "");
  if (s(v.signoff)) events.push({ d: s(v.signoff), label: "Sign-off", cls: "rec" });
  if (s(v.dry1)) events.push({ d: s(v.dry1), label: "Dry run #1", cls: "rec" });
  if (s(v.dry2)) events.push({ d: s(v.dry2), label: "Dry run #2", cls: "rec" });
  if (kit.delivery === "prerecorded" && kit.recordDate) events.push({ d: kit.recordDate, label: "Recording", cls: "rec" });
  if (kit.goLive) events.push({ d: kit.goLive, label: "Go-live", cls: "" });
  const dates = [...st.infos.map((i) => i.start), ...st.infos.map((i) => i.due), ...events.map((e) => e.d)].filter(Boolean).sort();
  if (!dates.length) return <EmptyNote>Add a go-live date to see the schedule.</EmptyNote>;
  let lo = dates[0], hi = dates[dates.length - 1];
  if (today < lo && days(today, lo) < 60) lo = today;
  if (today > hi && days(hi, today) < 60) hi = today;
  lo = shiftIso(lo, -3);
  hi = shiftIso(hi, 3);
  const span = Math.max(1, days(lo, hi));
  const pos = (iso: string) => Math.max(0, Math.min(100, (days(lo, iso) / span) * 100));
  const ticks: string[] = [];
  const step = span > 150 ? 14 : 7;
  let d = lo;
  while (new Date(`${d}T00:00:00`).getDay() !== 1) d = shiftIso(d, 1);
  for (; d <= hi; d = shiftIso(d, step)) ticks.push(d);
  return (
    <div className="kit-gantt" role="img" aria-label="Section schedule">
      <div className="kit-g-axis">
        <span className="eyebrow">Section</span>
        <div className="kit-g-ticks">
          {ticks.map((t) => (
            <span key={t} className="kit-g-tick" style={{ left: `${pos(t)}%` }}>
              {new Date(`${t}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" }).toUpperCase()}
            </span>
          ))}
        </div>
      </div>
      <div className="kit-g-row">
        <div className="kit-g-label">
          <span className="kit-gn">◆</span>
          <span>Key dates</span>
        </div>
        <div className="kit-g-track">
          {events.map((e) => (
            <span key={e.label} className={`kit-g-dia ${e.cls}`} style={{ left: `${pos(e.d)}%` }} title={`${e.label} · ${formatShort(e.d)}`} tabIndex={0} aria-label={`${e.label} ${formatShort(e.d)}`} />
          ))}
        </div>
      </div>
      {st.infos.map((i) => (
        <div key={i.s.k} className="kit-g-row">
          <div className="kit-g-label">
            <span className="kit-gn">{pad(i.s.n)}</span>
            <button type="button" className="link-btn" onClick={() => onSection?.(i.s.k)}>
              {i.s.short}
            </button>
          </div>
          <div className="kit-g-track">
            {i.due && (
              <button
                type="button"
                className={`kit-g-bar st-${i.st} ${i.late ? "late" : ""}`}
                style={{ left: `${pos(i.start || i.due)}%`, width: `${Math.max(1.2, pos(i.due) - pos(i.start || i.due))}%` }}
                title={`${pad(i.s.n)} ${i.s.title}\n${formatShort(i.start || i.due)} → ${formatShort(i.due)}\n${STATUS[i.st]}${i.late ? " · overdue" : ""}`}
                aria-label={`${i.s.title}, ${STATUS[i.st]}, ${formatShort(i.start || i.due)} to ${formatShort(i.due)}`}
                onClick={() => onSection?.(i.s.k)}
              />
            )}
          </div>
        </div>
      ))}
      {today >= lo && today <= hi && <span className="kit-g-today" style={{ left: `calc(132px + (100% - 132px) * ${pos(today) / 100})` }} />}
      <div className="kit-legend">
        {(["todo", "doing", "review", "done", "blocked"] as const).map((k) => (
          <span key={k}>
            <i className={`kit-sdot st-${k}`} /> {STATUS[k]}
          </span>
        ))}
        <span>
          <i className="kit-ring" /> Overdue
        </span>
        <span>
          <i className="kit-dia rec" /> Recording / dry runs
        </span>
        <span>
          <i className="kit-dia" /> Go-live
        </span>
      </div>
    </div>
  );
}

function days(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86400000);
}

function TeamEditor({ api }: { api: KitApi }) {
  const { kit, designers, readOnly } = api;
  const lead = kit.lead ? designers.find((d) => d.id === kit.lead) : undefined;
  return (
    <div className="kit-team">
      <div className="kit-trow">
        <div className="kit-tl">
          Project lead
          <small>Accountable end to end</small>
        </div>
        <div className="kit-tpeople">
          {lead ? (
            <span className="kit-pchip">
              <Avatar designer={lead} size={20} /> {lead.name}
              {!readOnly && (
                <button type="button" aria-label="Clear lead" onClick={() => api.setLead(undefined)}>
                  <Icon name="close" size={12} />
                </button>
              )}
            </span>
          ) : (
            <span className="item-hint">No lead yet</span>
          )}
          {!readOnly && (
            <select value="" aria-label="Set lead" onChange={(e) => e.target.value && api.setLead(e.target.value)}>
              <option value="">{lead ? "Change" : "Set lead"}</option>
              {designers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      {Object.entries(ROLES).map(([k, r]) => {
        const ids = kit.team[k] ?? [];
        const people = ids.map((id) => designers.find((d) => d.id === id)).filter((d) => !!d);
        return (
          <div key={k} className="kit-trow">
            <div className="kit-tl">
              {r.label}
              <small>{r.hint}</small>
            </div>
            <div className="kit-tpeople">
              {people.map((d) => (
                <span key={d.id} className="kit-pchip">
                  <Avatar designer={d} size={20} /> {d.name}
                  {!readOnly && (
                    <button type="button" aria-label={`Remove ${d.name}`} onClick={() => api.setTeam(k, ids.filter((x) => x !== d.id))}>
                      <Icon name="close" size={12} />
                    </button>
                  )}
                </span>
              ))}
              {!people.length && <span className="item-hint">Nobody yet</span>}
              {!readOnly && (
                <select
                  value=""
                  aria-label={`Add to ${r.label}`}
                  onChange={(e) => {
                    const id = e.target.value;
                    if (id && !ids.includes(id)) api.setTeam(k, [...ids, id]);
                  }}
                >
                  <option value="">Add</option>
                  {designers
                    .filter((d) => !ids.includes(d.id))
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                </select>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function KitActivityList({ api, max }: { api: KitApi; max: number }) {
  const rows = api.kit.activity.slice(0, max);
  if (!rows.length) return <EmptyNote>No activity yet.</EmptyNote>;
  return (
    <ul className="kit-act">
      {rows.map((e) => {
        const by = e.by ? api.designers.find((d) => d.id === e.by) : undefined;
        const s = SEC_BY_KEY[e.section];
        return (
          <li key={e.id}>
            {by ? <Avatar designer={by} size={22} /> : <span className="kit-av-txt">WP</span>}
            <span className="kit-aw">
              <b>{by?.name ?? "Someone"}</b> {e.what}
              {e.detail ? ` ${e.detail}` : ""}
              {s && <span className="item-hint"> · {pad(s.n)} {s.short}</span>}
            </span>
            <span className="kit-at">{timeAgo(e.at)}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function KitActivityTab({ api }: { api: KitApi }) {
  return (
    <ItemGrid
      main={
        <SideCard title="Activity">
          <KitActivityList api={api} max={300} />
        </SideCard>
      }
    />
  );
}

export function KitFilesTab({ api }: { api: KitApi }) {
  return <ItemGrid main={<KitFilesCard section="" api={api} all />} />;
}

// The manage block for a webinar: archive, delete, next iteration.
export function KitManage({
  api,
  onDelete,
  onDuplicate,
}: {
  api: KitApi;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="item-manage">
      <button type="button" className="btn btn-secondary btn-sm" onClick={onDuplicate}>
        Start the next iteration
      </button>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => api.update((k) => ({ ...k, archived: !k.archived }), api.kit.archived ? "restored the webinar" : "archived the webinar")}
      >
        {api.kit.archived ? "Restore from archive" : "Archive webinar"}
      </button>
      {confirming ? (
        <>
          <span className="item-hint">Delete everything?</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirming(false)}>
            Keep
          </button>
          <button type="button" className="btn btn-danger btn-sm" onClick={onDelete}>
            Yes, delete
          </button>
        </>
      ) : (
        <button type="button" className="btn btn-danger-ghost btn-sm" onClick={() => setConfirming(true)}>
          Delete webinar
        </button>
      )}
    </div>
  );
}

export function KitHealthChip({ st, campaign }: { st: KitState; campaign: Campaign }) {
  if (campaign.webinar?.archived) return <span className="kit-chip line">Archived</span>;
  if (!st.health) return null;
  return (
    <StatusChip status={st.health.k === "bad" ? "blocked" : st.health.k === "warn" ? "scheduled" : "live"}>
      {st.health.label}
    </StatusChip>
  );
}
