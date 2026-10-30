import { useState } from "react";
import type { KitSectionStatus } from "../../types";
import { pad, whoLine } from "./kitUi";
import {
  ROLES,
  SECTIONS,
  SEC_BY_KEY,
  STATUS,
  STATUS_ORDER,
  kitState,
  schedule,
  sectionPeople,
  type SectionSpec,
} from "../../webinarKit";
import { formatShort, timeAgo, todayIso } from "../../dates";
import { Avatar } from "../Avatar";
import { Icon } from "../Icon";
import { EmptyNote, ItemGrid, KeyValues, ReadyCount, ReadyWhen, SideCard, StatusChip } from "../pages/ItemPage";
import { KitField } from "./KitField";
import type { KitApi } from "./kitApi";

// One kit section as the campaign page's body: the fields in the main
// column; status, schedule, owner and the "ready when" list up the side;
// files and notes for the section below them.

export function KitSection({ sectionKey, api }: { sectionKey: string; api: KitApi }) {
  const s = SEC_BY_KEY[sectionKey];
  if (!s) return null;
  const fields = s.fields.filter((f) => !f.show || f.show(api.kit));
  return (
    <ItemGrid
      main={
        <div className="kit-sec">
          <div className="kit-sec-head">
            <div className="eyebrow">
              Section {pad(s.n)} of {pad(SECTIONS.length)}
            </div>
            <h2>{s.title}</h2>
            <p className="kit-who">{whoLine(s)}</p>
            {s.intro && <p className="kit-intro">{s.intro}</p>}
          </div>
          <div className="item-card kit-formcard">
            <div className="kit-fields">
              {fields.map((f, i) => (
                <KitField key={f.k ?? `${f.t}-${i}`} f={f} sec={s.k} api={api} />
              ))}
            </div>
          </div>
        </div>
      }
      sideTop={<SectionSide s={s} api={api} />}
      sideBottom={
        <>
          <KitFilesCard section={s.k} api={api} hint={s.filesHint} />
          <KitNotesCard section={s.k} api={api} />
        </>
      }
    />
  );
}

function SectionSide({ s, api }: { s: SectionSpec; api: KitApi }) {
  const { kit, readOnly } = api;
  const today = todayIso();
  const st = kit.sec[s.k]?.status ?? "todo";
  const sch = schedule(kit)[s.k];
  const info = kitState(kit, today).infos.find((i) => i.s.k === s.k)!;
  const people = sectionPeople(kit, s).map((id) => api.designers.find((d) => d.id === id)).filter((d) => !!d);
  const reqs = s.reqs(api.ctx);
  const ok = reqs.filter((r) => r[1]).length;
  const [editingDue, setEditingDue] = useState(false);

  return (
    <>
      <SideCard title="Status & schedule">
        <KeyValues
          rows={[
            {
              label: "Status",
              value: (
                <select
                  value={st}
                  disabled={readOnly}
                  aria-label="Section status"
                  onChange={(e) => api.setSection(s.k, { status: e.target.value as KitSectionStatus }, "set the status to", STATUS[e.target.value as KitSectionStatus])}
                >
                  {STATUS_ORDER.map((v) => (
                    <option key={v} value={v}>
                      {STATUS[v]}
                    </option>
                  ))}
                </select>
              ),
            },
            {
              label: "Due",
              value: (
                <span className="item-stack">
                  {!sch.due ? (
                    <span className="item-hint">Set a go-live date to schedule this section.</span>
                  ) : (
                    <>
                      <span className="kit-row">
                        <b className="mono">{formatShort(sch.due)}</b>
                        {sch.custom ? <span className="kit-chip brand">Custom</span> : <span className="item-hint">Kit schedule</span>}
                      </span>
                      {info.late && <StatusChip status="blocked">Overdue by {-info.days!} day{info.days === -1 ? "" : "s"}</StatusChip>}
                      {!info.late && info.open && info.days !== null && info.days <= 7 && (
                        <StatusChip status="scheduled">{info.days === 0 ? "Due today" : `Due in ${info.days} day${info.days === 1 ? "" : "s"}`}</StatusChip>
                      )}
                      {sch.start && sch.start < sch.due && <span className="item-hint">Starts {formatShort(sch.start)}</span>}
                    </>
                  )}
                  {!readOnly && (sch.due || sch.custom) && (
                    <span className="kit-row">
                      <button type="button" className="link-btn" onClick={() => setEditingDue((v) => !v)}>
                        Change date
                      </button>
                      {sch.custom && (
                        <button
                          type="button"
                          className="link-btn"
                          onClick={() => {
                            api.setSection(s.k, { due: undefined }, "reset the due date");
                            setEditingDue(false);
                          }}
                        >
                          Use kit date{sch.kitDue ? ` (${formatShort(sch.kitDue)})` : ""}
                        </button>
                      )}
                    </span>
                  )}
                  {editingDue && (
                    <input
                      type="date"
                      aria-label="Custom due date"
                      value={sch.custom ? (kit.sec[s.k]?.due ?? "") : sch.due}
                      onChange={(e) => {
                        if (!e.target.value) return;
                        api.setSection(s.k, { due: e.target.value }, "changed the due date to", formatShort(e.target.value));
                        setEditingDue(false);
                      }}
                    />
                  )}
                </span>
              ),
            },
            {
              label: "Owner",
              value: (
                <span className="item-stack">
                  <span className="item-hint">{ROLES[s.owner].label}</span>
                  {people.map((d) => (
                    <span key={d.id} className="item-person">
                      <Avatar designer={d} size={20} /> {d.name}
                    </span>
                  ))}
                  {!readOnly && (
                    <select
                      value={kit.sec[s.k]?.who ?? ""}
                      aria-label="Assign someone"
                      onChange={(e) =>
                        api.setSection(s.k, { who: e.target.value || undefined }, e.target.value ? "assigned an owner" : "cleared the owner")
                      }
                    >
                      <option value="">{people.length ? "Assign someone else" : "Assign"}</option>
                      {api.designers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  )}
                </span>
              ),
            },
            ...(s.with.length
              ? [
                  {
                    label: "With",
                    value: (
                      <span className="kit-row wrap">
                        {s.with.map((r) => (
                          <span key={r} className="kit-chip line">
                            {ROLES[r].label}
                          </span>
                        ))}
                      </span>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </SideCard>
      <SideCard title="Ready when" aside={<ReadyCount reqs={reqs} />}>
        <ReadyWhen
          reqs={reqs}
          action={
            !readOnly && ok === reqs.length && st !== "done" && st !== "na" ? (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => api.setSection(s.k, { status: "done" }, "set the status to", STATUS.done)}>
                <Icon name="checkmark" size={14} /> Mark section done
              </button>
            ) : null
          }
        />
      </SideCard>
    </>
  );
}

// ── Files & links / notes, per section or for the whole webinar ─────────

export function KitFilesCard({ section, api, hint, all }: { section: string; api: KitApi; hint?: string; all?: boolean }) {
  const files = api.kit.files.filter((f) => all || f.section === section).slice().sort((a, b) => b.at.localeCompare(a.at));
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [target, setTarget] = useState(section);
  const [error, setError] = useState<string | null>(null);
  function submit() {
    const href = url.trim();
    if (!/^https?:\/\//i.test(href)) {
      setError("Enter a full web address, starting with https://");
      return;
    }
    api.addFile(target, label.trim() || href.replace(/^https?:\/\//, "").slice(0, 60), href);
    setLabel("");
    setUrl("");
    setError(null);
    setAdding(false);
  }
  return (
    <SideCard title={all ? "All files & links" : "Files & links"}>
      {hint && <p className="item-hint">{hint}</p>}
      {files.length === 0 ? (
        <EmptyNote>Nothing here yet.</EmptyNote>
      ) : (
        <ul className="kit-flist">
          {files.map((f) => {
            let host = "link";
            try {
              host = new URL(f.url).hostname.replace(/^www\./, "");
            } catch {
              // keep "link"
            }
            const by = f.by ? api.designers.find((d) => d.id === f.by) : undefined;
            return (
              <li key={f.id}>
                <Icon name="browser" size={16} />
                <span className="kit-fmain">
                  <a href={f.url} target="_blank" rel="noopener noreferrer">
                    {f.name}
                  </a>
                  <span className="item-hint">
                    {host}
                    {all && f.section ? ` · ${pad(SEC_BY_KEY[f.section]?.n ?? 0)} ${SEC_BY_KEY[f.section]?.short ?? ""}` : all ? " · General" : ""}
                    {by ? ` · ${by.name}` : ""} · {timeAgo(f.at)}
                  </span>
                </span>
                {!api.readOnly && (
                  <button type="button" className="btn btn-ghost btn-sm" aria-label={`Remove ${f.name}`} onClick={() => api.removeFile(f.id)}>
                    <Icon name="close" size={14} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!api.readOnly && (
        <div className="item-stack">
          {adding ? (
            <form
              className="kit-stack"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              {all && (
                <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Add to">
                  <option value="">General</option>
                  {SECTIONS.map((x) => (
                    <option key={x.k} value={x.k}>
                      {pad(x.n)} · {x.title}
                    </option>
                  ))}
                </select>
              )}
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label, e.g. Final slides (SharePoint)" autoComplete="off" />
              <input value={url} onChange={(e) => setUrl(e.target.value)} type="url" placeholder="https://…" autoComplete="off" />
              {error && <span className="kit-hint warn">{error}</span>}
              <div className="kit-row">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdding(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-sm">
                  Add link
                </button>
              </div>
            </form>
          ) : (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAdding(true)}>
              <Icon name="link" size={14} /> Add link
            </button>
          )}
          <span className="item-hint">Add files as SharePoint, Frame.io or Riverside links.</span>
        </div>
      )}
    </SideCard>
  );
}

export function KitNotesCard({ section, api }: { section: string; api: KitApi }) {
  const notes = api.kit.notes.filter((n) => n.section === section).slice().sort((a, b) => a.at.localeCompare(b.at));
  const [text, setText] = useState("");
  function send() {
    const t = text.trim();
    if (!t) return;
    api.addNote(section, t);
    setText("");
  }
  return (
    <SideCard title="Notes & decisions">
      {notes.length === 0 ? (
        <EmptyNote>No notes yet. Record decisions, questions and hand-offs here.</EmptyNote>
      ) : (
        <ul className="kit-notes">
          {notes.map((n) => {
            const by = n.by ? api.designers.find((d) => d.id === n.by) : undefined;
            return (
              <li key={n.id}>
                <div className="kit-nh">
                  {by ? (
                    <span className="item-person">
                      <Avatar designer={by} size={20} /> {by.name}
                    </span>
                  ) : (
                    <span>Someone</span>
                  )}
                  <span className="item-hint">· {timeAgo(n.at)}</span>
                  {!api.readOnly && (api.me === n.by || !n.by) && (
                    <button type="button" className="link-btn" onClick={() => api.removeNote(n.id)}>
                      Delete
                    </button>
                  )}
                </div>
                <div className="kit-nt">{n.text}</div>
              </li>
            );
          })}
        </ul>
      )}
      {!api.readOnly && (
        <div className="kit-stack">
          <textarea
            rows={2}
            value={text}
            placeholder="Add a note or decision"
            aria-label="New note"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                send();
              }
            }}
          />
          <div className="kit-row end">
            <span className="item-hint">Ctrl or ⌘ + Enter</span>
            <button type="button" className="btn btn-primary btn-sm" onClick={send} disabled={!text.trim()}>
              Add note
            </button>
          </div>
        </div>
      )}
    </SideCard>
  );
}
