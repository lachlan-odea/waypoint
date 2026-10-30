import { useEffect, useId, useState, type ReactNode } from "react";
import type { KitItem, KitValue } from "../../types";
import {
  EMAIL_SEQ,
  FORMATS,
  KINDS,
  LINKS,
  RUNSHEET_ROWS,
  ROLES,
  fieldValue,
  fmtDur,
  fmtNum,
  fmtPct,
  lines,
  num,
  parseDur,
  ratio,
  type FieldSpec,
  type ItemFieldSpec,
} from "../../webinarKit";
import { formatShort, shiftIso } from "../../dates";
import { Icon } from "../Icon";
import { Avatar } from "../Avatar";
import type { KitApi } from "./kitApi";
import { Headshot } from "./SpeakerDirectory";

// One field of a kit section, from its FieldSpec. Text is held locally
// while typing and written on blur (or Enter); selects, dates, ticks and
// multi-picks write straight away.

type Props = {
  f: FieldSpec;
  sec: string;
  api: KitApi;
};

const str = (v: KitValue | undefined): string =>
  typeof v === "string" ? v : v == null || typeof v === "boolean" ? "" : Array.isArray(v) ? v.join("\n") : String(v);

function optPairs(opts: FieldSpec["opts"]): [string, string][] {
  if (!opts) return [];
  return opts.map((o) => (Array.isArray(o) ? o : [o, o]));
}

// A text-like input that commits on blur.
function Draft({
  value,
  onCommit,
  render,
}: {
  value: string;
  onCommit: (v: string) => void;
  render: (draft: string, set: (v: string) => void, commit: () => void) => ReactNode;
}) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);
  return (
    <>
      {render(
        draft,
        (v) => {
          setEditing(true);
          setDraft(v);
        },
        () => {
          setEditing(false);
          if (draft !== value) onCommit(draft);
        },
      )}
    </>
  );
}

function Shell({
  f,
  id,
  children,
  aside,
}: {
  f: Pick<FieldSpec, "label" | "hint" | "links" | "half" | "third" | "role">;
  id?: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  const cls = ["kit-field", f.half ? "half" : "", f.third ? "third" : ""].filter(Boolean).join(" ");
  return (
    <div className={cls}>
      {f.label && (
        <div className="kit-field-top">
          {id ? <label htmlFor={id}>{f.label}</label> : <span className="kit-flabel">{f.label}</span>}
          {f.role && <span className="kit-role">{ROLES[f.role]?.short ?? f.role}</span>}
          {aside}
        </div>
      )}
      {children}
      {f.hint && <span className="kit-hint">{f.hint}</span>}
      <HintLinks links={f.links} />
    </div>
  );
}

function HintLinks({ links }: { links?: boolean | string[] }) {
  if (!Array.isArray(links) || !links.length) return null;
  return (
    <span className="kit-hint kit-links">
      {links.map((k) => {
        const l = LINKS[k];
        return l ? (
          <a key={k} href={l[1]} target="_blank" rel="noopener noreferrer">
            {l[0]} <Icon name="external-link" size={11} />
          </a>
        ) : null;
      })}
    </span>
  );
}

function OpenLink({ href }: { href: string }) {
  const ok = /^https?:\/\//i.test(href.trim());
  if (!ok) return null;
  return (
    <a className="btn btn-ghost btn-sm" href={href.trim()} target="_blank" rel="noopener noreferrer" title="Open link">
      <Icon name="external-link" size={14} />
    </a>
  );
}

export function KitField({ f, sec, api }: Props) {
  const id = useId();
  const { ctx, readOnly } = api;
  const key = f.k ?? "";
  const value = fieldValue(ctx, f, sec);
  const commit = (v: KitValue | undefined) => {
    if (f.p) api.setRoot(key, v, f.label);
    else api.setValue(sec, key, v, f.label);
  };
  const part = (suffix: string) => ctx.V(sec)[`${key}|${suffix}`];
  const setPart = (suffix: string, v: KitValue | undefined, label?: string) =>
    api.setValue(sec, `${key}|${suffix}`, v, label ?? `${f.label} · ${suffix}`);

  switch (f.t) {
    case "heading":
      return (
        <div className="kit-fhead">
          <h3>{f.label}</h3>
          {f.hint && <p>{f.hint}</p>}
          <HintLinks links={f.links} />
        </div>
      );
    case "metrics":
      return <Metrics api={api} />;
    case "emailmetrics":
      return <EmailMetrics api={api} />;
    case "group":
      return <Group f={f} sec={sec} api={api} />;
    case "text":
    case "url":
    case "series":
      return (
        <Shell f={f} id={id}>
          <Draft
            value={str(value)}
            onCommit={(v) => commit(v)}
            render={(d, set, done) => (
              <div className="kit-inrow">
                <input
                  id={id}
                  type={f.t === "url" ? "url" : "text"}
                  value={d}
                  placeholder={f.ph}
                  list={f.t === "series" ? `${id}-list` : undefined}
                  disabled={readOnly}
                  autoComplete="off"
                  onChange={(e) => set(e.target.value)}
                  onBlur={done}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                />
                {f.t === "url" && <OpenLink href={d} />}
                {f.t === "series" && (
                  <datalist id={`${id}-list`}>
                    {seriesOptions(api).map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                )}
              </div>
            )}
          />
        </Shell>
      );
    case "asset":
      return (
        <Shell f={f} id={id}>
          <Draft
            value={str(value)}
            onCommit={(v) => commit(v)}
            render={(d, set, done) => (
              <div className="kit-inrow">
                <input
                  id={id}
                  type="url"
                  value={d}
                  placeholder="Paste a link to the image or video"
                  disabled={readOnly}
                  autoComplete="off"
                  onChange={(e) => set(e.target.value)}
                  onBlur={done}
                />
                <OpenLink href={d} />
              </div>
            )}
          />
        </Shell>
      );
    case "num":
      return (
        <Shell f={f} id={id}>
          <Draft
            value={str(value)}
            onCommit={(v) => commit(num(v) ?? undefined)}
            render={(d, set, done) => (
              <input
                id={id}
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={d}
                placeholder={f.ph}
                disabled={readOnly}
                onChange={(e) => set(e.target.value)}
                onBlur={done}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
              />
            )}
          />
        </Shell>
      );
    case "date":
      return (
        <Shell f={f} id={id}>
          <input
            id={id}
            type="date"
            value={str(value)}
            disabled={readOnly}
            onChange={(e) => commit(e.target.value)}
          />
        </Shell>
      );
    case "area":
    case "list": {
      const count = f.t === "list" ? lines(str(value)).length : null;
      return (
        <Shell
          f={f}
          id={id}
          aside={
            count !== null ? (
              <span className={`kit-counter ${f.min && count >= f.min && count <= (f.max ?? 99) ? "ok" : ""}`}>
                {count} {count === 1 ? "item" : "items"}
                {f.min ? ` · aim for ${f.min}–${f.max}` : ""}
              </span>
            ) : undefined
          }
        >
          <Draft
            value={str(value)}
            onCommit={(v) => commit(v)}
            render={(d, set, done) => (
              <textarea
                id={id}
                rows={f.rows ?? (f.t === "list" ? 4 : 3)}
                value={d}
                placeholder={f.ph ?? (f.t === "list" ? "One per line" : undefined)}
                disabled={readOnly}
                onChange={(e) => set(e.target.value)}
                onBlur={done}
              />
            )}
          />
        </Shell>
      );
    }
    case "select":
      return (
        <Shell f={f} id={id}>
          <select id={id} value={str(value)} disabled={readOnly} onChange={(e) => commit(e.target.value)}>
            <option value="">{f.ph ?? "Select…"}</option>
            {optPairs(f.opts).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Shell>
      );
    case "multi": {
      const vals = Array.isArray(value) ? value : [];
      return (
        <Shell f={f}>
          <div className="kit-multi" role="group" aria-label={f.label}>
            {optPairs(f.opts).map(([v, l]) => {
              const on = vals.includes(v);
              return (
                <button
                  key={v}
                  type="button"
                  className="kit-opt"
                  aria-pressed={on}
                  disabled={readOnly}
                  onClick={() => commit(on ? vals.filter((x) => x !== v) : [...vals, v])}
                >
                  {l}
                </button>
              );
            })}
          </div>
        </Shell>
      );
    }
    case "check": {
      const live = api.kit.goLive;
      return (
        <div className={["kit-field", f.half ? "half" : "", f.third ? "third" : ""].filter(Boolean).join(" ")}>
          <label className="kit-check">
            <input type="checkbox" checked={!!value} disabled={readOnly} onChange={(e) => commit(e.target.checked)} />
            <span>
              {f.label}
              {f.role && <span className="kit-role">{ROLES[f.role]?.short}</span>}
            </span>
          </label>
          {f.after !== undefined && (
            <span className="kit-hint">
              Within {f.after} days of the event{live ? ` · by ${formatShort(shiftIso(live, f.after))}` : ""}
            </span>
          )}
        </div>
      );
    }
    case "copyasset":
      return (
        <Shell f={f} id={id}>
          <div className="kit-stack">
            <Draft
              value={str(part("copy"))}
              onCommit={(v) => setPart("copy", v, f.label)}
              render={(d, set, done) => (
                <textarea
                  id={id}
                  rows={3}
                  value={d}
                  placeholder="Newsletter copy, including the CTA button text"
                  disabled={readOnly}
                  onChange={(e) => set(e.target.value)}
                  onBlur={done}
                />
              )}
            />
            <Draft
              value={str(part("asset"))}
              onCommit={(v) => setPart("asset", v, `${f.label} image`)}
              render={(d, set, done) => (
                <div className="kit-inrow">
                  <input
                    type="url"
                    value={d}
                    placeholder="Link to the image"
                    disabled={readOnly}
                    autoComplete="off"
                    onChange={(e) => set(e.target.value)}
                    onBlur={done}
                  />
                  <OpenLink href={d} />
                </div>
              )}
            />
          </div>
        </Shell>
      );
    case "approval": {
      const by = str(part("by"));
      const approver = api.designers.find((d) => d.id === by);
      return (
        <Shell f={f}>
          <div className="kit-stack">
            <label className="kit-check">
              <input
                type="checkbox"
                checked={!!part("ok")}
                disabled={readOnly}
                onChange={(e) => setPart("ok", e.target.checked, "Approval")}
              />
              <span>Core message approved</span>
            </label>
            <div className="kit-row">
              <span className="kit-hint">Approved by</span>
              <select value={by} disabled={readOnly} onChange={(e) => setPart("by", e.target.value, "Approver")}>
                <option value="">Choose approver</option>
                {api.designers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              {approver && <Avatar designer={approver} size={20} />}
              <span className="kit-hint">on</span>
              <input
                type="date"
                value={str(part("date"))}
                disabled={readOnly}
                onChange={(e) => setPart("date", e.target.value, "Approval date")}
                style={{ maxWidth: 180 }}
              />
            </div>
          </div>
        </Shell>
      );
    }
    case "checklist":
      return (
        <Shell f={f}>
          <div className="kit-stack">
            {(f.items ?? []).map((label, i) => (
              <div key={label} className="kit-stack tight">
                <label className="kit-check">
                  <input
                    type="checkbox"
                    checked={!!part(`c${i}|done`)}
                    disabled={readOnly}
                    onChange={(e) => setPart(`c${i}|done`, e.target.checked, label)}
                  />
                  <span>{label}</span>
                </label>
                {f.links && (
                  <Draft
                    value={str(part(`c${i}|url`))}
                    onCommit={(v) => setPart(`c${i}|url`, v, `${label} link`)}
                    render={(d, set, done) => (
                      <div className="kit-inrow indent">
                        <input
                          type="url"
                          value={d}
                          placeholder="Link (optional)"
                          disabled={readOnly}
                          autoComplete="off"
                          onChange={(e) => set(e.target.value)}
                          onBlur={done}
                        />
                        <OpenLink href={d} />
                      </div>
                    )}
                  />
                )}
              </div>
            ))}
            {f.extra && <Group f={{ k: `${key}X`, t: "group", kind: "xitem", list: key }} sec={sec} api={api} bare />}
          </div>
        </Shell>
      );
    case "emailseq": {
      const od = !!part("od");
      return (
        <Shell f={f}>
          <div className="kit-stack">
            <label className="kit-check">
              <input type="checkbox" checked={od} disabled={readOnly} onChange={(e) => setPart("od", e.target.checked, "On-demand setting")} />
              <span>
                On-demand recording enabled
                <span className="kit-hint block">Write each email’s copy here, then tick it once it’s ready for Digital.</span>
              </span>
            </label>
            <div className="kit-stack">
              {EMAIL_SEQ.map((t) => {
                const sends = t.od === undefined || t.od === od;
                const subj = str(part(`copy|${t.k}|subject`));
                const body = str(part(`copy|${t.k}|body`));
                return (
                  <div key={t.k} className="kit-seqrow">
                    <div className="kit-row between">
                      <label className="kit-check">
                        <input
                          type="checkbox"
                          checked={!!part(t.k)}
                          disabled={readOnly}
                          onChange={(e) => setPart(t.k, e.target.checked, t.label)}
                        />
                        <span>
                          {t.label}
                          <span className="kit-hint block">{t.when}</span>
                        </span>
                      </label>
                      <span className={`kit-chip ${sends ? "info" : "line"}`}>
                        {sends ? "Sends" : t.od ? "Only with on-demand" : "Off when on-demand is on"}
                      </span>
                    </div>
                    <details className="kit-copybox" open={!!(subj || body) || undefined}>
                      <summary>{subj || body ? "Subject and copy" : "Write the subject and copy"}</summary>
                      <div className="kit-stack" style={{ marginTop: 8 }}>
                        <Draft
                          value={subj}
                          onCommit={(v) => setPart(`copy|${t.k}|subject`, v, `${t.label} subject`)}
                          render={(d, set, done) => (
                            <input
                              type="text"
                              value={d}
                              placeholder="Subject line"
                              aria-label={`${t.label} subject line`}
                              disabled={readOnly}
                              onChange={(e) => set(e.target.value)}
                              onBlur={done}
                            />
                          )}
                        />
                        <Draft
                          value={body}
                          onCommit={(v) => setPart(`copy|${t.k}|body`, v, `${t.label} copy`)}
                          render={(d, set, done) => (
                            <textarea
                              rows={4}
                              value={d}
                              placeholder="Email copy, including the CTA"
                              aria-label={`${t.label} copy`}
                              disabled={readOnly}
                              onChange={(e) => set(e.target.value)}
                              onBlur={done}
                            />
                          )}
                        />
                      </div>
                    </details>
                  </div>
                );
              })}
            </div>
          </div>
        </Shell>
      );
    }
    default:
      return <div className="kit-field">{f.label}</div>;
  }
}

function seriesOptions(api: KitApi): string[] {
  // Series names already in use come through the pipeline; the field also
  // accepts anything typed.
  return api.kit.series ? [api.kit.series] : [];
}

// ── Calculated blocks ───────────────────────────────────────────────────

function Metric({ value, label, sub }: { value: string; label: string; sub?: string | null }) {
  return (
    <div className="kit-metric">
      <span className="kit-mv">{value}</span>
      <span className="kit-ml">{label}</span>
      {sub && <span className="kit-ml">{sub}</span>}
    </div>
  );
}

function Metrics({ api }: { api: KitApi }) {
  const v = api.ctx.V("results"), t = api.ctx.V("brief");
  const regs = num(v.regs), views = num(v.pageViews), atts = num(v.atts);
  const conv = ratio(regs, views), att = ratio(atts, regs);
  const live = parseDur(v.liveEng);
  const tReg = num(t.tReg), tAtt = num(t.tAtt), tWatch = num(t.tWatch);
  return (
    <div className="kit-field">
      <span className="kit-flabel">Calculated</span>
      <div className="kit-metrics" aria-live="polite">
        <Metric value={fmtPct(conv)} label="Page view to registration" />
        <Metric
          value={fmtPct(att)}
          label="Attendance rate"
          sub={tAtt ? `Target ${tAtt}%${att != null ? (att * 100 >= tAtt ? " · met" : " · below") : ""}` : "No target set in the brief"}
        />
        <Metric
          value={fmtNum(regs)}
          label="Registrants"
          sub={tReg ? `Target ${fmtNum(tReg)}${regs != null ? ` · ${regs >= tReg ? "+" : ""}${Math.round((regs / tReg - 1) * 100)}%` : ""}` : "No target set in the brief"}
        />
        <Metric
          value={fmtDur(live)}
          label="Live watch time"
          sub={tWatch ? `Target ${tWatch} min${live != null ? (live >= tWatch * 60 ? " · met" : " · below") : ""}` : null}
        />
      </div>
    </div>
  );
}

function EmailMetrics({ api }: { api: KitApi }) {
  const v = api.ctx.V("results");
  const sent = num(v.emSent), open = num(v.emOpen), click = num(v.emClick);
  return (
    <div className="kit-field">
      <span className="kit-flabel">Calculated</span>
      <div className="kit-metrics">
        <Metric value={fmtPct(ratio(open, sent))} label="Open rate" />
        <Metric value={fmtPct(ratio(click, sent))} label="Click rate" />
        <Metric value={fmtPct(ratio(click, open))} label="Click-to-open" />
      </div>
    </div>
  );
}

// ── Repeatable rows ─────────────────────────────────────────────────────

function Group({ f, sec, api, bare }: { f: FieldSpec; sec: string; api: KitApi; bare?: boolean }) {
  const K = KINDS[f.kind ?? ""];
  if (!K) return null;
  const list = api.ctx.items(f.kind!, f.list);
  const { readOnly } = api;
  const [confirming, setConfirming] = useState<string | null>(null);
  const body = (
    <div className="kit-group">
      {!list.length && K.empty && <div className="kit-gempty">{K.empty}</div>}
      {list.map((it, idx) => (
        <GroupItem
          key={it.id}
          f={f}
          K={K}
          it={it}
          idx={idx}
          count={list.length}
          api={api}
          sec={sec}
          confirming={confirming === it.id}
          onConfirm={(on) => setConfirming(on ? it.id : null)}
        />
      ))}
      <div className="kit-row">
        {!readOnly && !(K.max && list.length >= K.max) && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => api.addItem(f.kind!, f.list, undefined, sec)}>
            <Icon name="add-plus" size={14} /> {K.add}
          </button>
        )}
        {!readOnly && f.kind === "speaker" && api.speakers.length > 0 && (
          <select
            className="kit-directory-pick"
            value=""
            aria-label="Add a speaker from the directory"
            onChange={(e) => {
              const sp = api.speakers.find((s) => s.id === e.target.value);
              if (!sp) return;
              api.addItem("speaker", f.list, { name: sp.name, title: sp.title, bio: sp.bio, headshot: sp.headshot, speakerId: sp.id }, sec);
            }}
          >
            <option value="">Add from the speaker directory…</option>
            {api.speakers
              .filter((s) => !list.some((it) => it.d.speakerId === s.id))
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.title ? ` · ${s.title}` : ""}
                </option>
              ))}
          </select>
        )}
        {!readOnly && f.template === "runsheet" && !list.length && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => api.addMany("runsheet", RUNSHEET_ROWS.map((s) => ({ slide: s })), sec)}>
            Start from the kit’s 8 storyboard rows
          </button>
        )}
        {!readOnly && f.template === "social" && !list.length && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => api.addMany("social", [{ status: "Draft" }, { status: "Draft" }, { status: "Draft" }], sec)}>
            Add the kit’s three post slots
          </button>
        )}
        {K.max && <span className="kit-total">{list.length} of {K.max}</span>}
        {f.kind === "ros" && (
          <span className="kit-total">
            Total {list.reduce((s, it) => s + (num(it.d.mins) ?? 0), 0)} min
            {FORMATS[api.kit.format] ? ` · format guide ${FORMATS[api.kit.format].dur}` : ""}
          </span>
        )}
      </div>
    </div>
  );
  if (bare) return body;
  return <Shell f={f}>{body}</Shell>;
}

function GroupItem({
  f,
  K,
  it,
  idx,
  count,
  api,
  sec,
  confirming,
  onConfirm,
}: {
  f: FieldSpec;
  K: (typeof KINDS)[string];
  it: KitItem;
  idx: number;
  count: number;
  api: KitApi;
  sec: string;
  confirming: boolean;
  onConfirm: (on: boolean) => void;
}) {
  const cols = f.cols ?? Object.keys(K.fields);
  const by = it.by ? api.designers.find((d) => d.id === it.by) : undefined;
  return (
    <div className="kit-gitem">
      <div className="kit-gitem-head">
        <div className="kit-gitem-title">
          {it.kind === "speaker" && <Headshot speaker={{ name: String(it.d.name ?? ""), headshot: String(it.d.headshot ?? "") }} size={28} />}
          <span>{K.title(it.d, idx)}</span>
          {it.kind === "speaker" && it.d.speakerId && api.speakers.some((s) => s.id === it.d.speakerId) && (
            <span className="kit-chip brand" title="Linked to the speaker directory">
              Directory
            </span>
          )}
          {by && (
            <span className="kit-stamp">
              {by.name} · {formatShort(it.at.slice(0, 10))}
            </span>
          )}
        </div>
        {!api.readOnly && (
          <div className="kit-gitem-tools">
            {it.kind === "speaker" && String(it.d.name ?? "").trim() && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                title={it.d.speakerId && api.speakers.some((s) => s.id === it.d.speakerId) ? "Update the directory with this row's name, title, bio and headshot" : "Save this speaker to the directory for other webinars"}
                onClick={() => api.saveSpeakerFromItem(it)}
              >
                <Icon name="user-profile" size={14} /> {it.d.speakerId && api.speakers.some((s) => s.id === it.d.speakerId) ? "Update directory" : "Save to directory"}
              </button>
            )}
            {count > 1 && (
              <>
                <button type="button" className="btn btn-ghost btn-sm" aria-label="Move up" disabled={idx === 0} onClick={() => api.moveItem(it.id, -1)}>
                  <Icon name="chevron-down" size={14} className="flip" />
                </button>
                <button type="button" className="btn btn-ghost btn-sm" aria-label="Move down" disabled={idx === count - 1} onClick={() => api.moveItem(it.id, 1)}>
                  <Icon name="chevron-down" size={14} />
                </button>
              </>
            )}
            {confirming ? (
              <>
                <span className="kit-hint">Remove?</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => onConfirm(false)}>
                  Keep
                </button>
                <button type="button" className="btn btn-danger btn-sm" onClick={() => api.removeItem(it.id, sec)}>
                  Remove
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onConfirm(true)}>
                Remove
              </button>
            )}
          </div>
        )}
      </div>
      <div className="kit-gfields">
        {cols.map((col) => {
          const spec = K.fields[col];
          return spec ? <ItemInput key={col} it={it} col={col} spec={spec} api={api} /> : null;
        })}
      </div>
    </div>
  );
}

function ItemInput({ it, col, spec, api }: { it: KitItem; col: string; spec: ItemFieldSpec; api: KitApi }) {
  const id = useId();
  const value = it.d[col];
  const { readOnly } = api;
  const cls = ["kit-field", spec.half ? "half" : "", spec.third ? "third" : ""].filter(Boolean).join(" ");
  if (spec.t === "check") {
    return (
      <div className={cls}>
        <label className="kit-check">
          <input type="checkbox" checked={!!value} disabled={readOnly} onChange={(e) => api.setItem(it.id, col, e.target.checked)} />
          <span>{spec.label}</span>
        </label>
      </div>
    );
  }
  if (spec.t === "select") {
    return (
      <div className={cls}>
        <label htmlFor={id}>{spec.label}</label>
        <select id={id} value={str(value)} disabled={readOnly} onChange={(e) => api.setItem(it.id, col, e.target.value)}>
          <option value="">Select…</option>
          {(spec.opts ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
    );
  }
  if (spec.t === "date") {
    return (
      <div className={cls}>
        <label htmlFor={id}>{spec.label}</label>
        <input id={id} type="date" value={str(value)} disabled={readOnly} onChange={(e) => api.setItem(it.id, col, e.target.value)} />
      </div>
    );
  }
  if (spec.t === "area") {
    return (
      <div className={cls}>
        <label htmlFor={id}>{spec.label}</label>
        <Draft
          value={str(value)}
          onCommit={(v) => api.setItem(it.id, col, v)}
          render={(d, set, done) => (
            <textarea id={id} rows={spec.rows ?? 3} value={d} placeholder={spec.ph} disabled={readOnly} onChange={(e) => set(e.target.value)} onBlur={done} />
          )}
        />
      </div>
    );
  }
  const isLink = spec.t === "url" || spec.t === "asset" || spec.t === "image";
  return (
    <div className={cls}>
      <label htmlFor={id}>{spec.label}</label>
      <Draft
        value={str(value)}
        onCommit={(v) => api.setItem(it.id, col, spec.t === "num" ? (num(v) ?? undefined) : v)}
        render={(d, set, done) => (
          <div className="kit-inrow">
            <input
              id={id}
              type={spec.t === "num" ? "number" : isLink ? "url" : "text"}
              inputMode={spec.t === "num" ? "decimal" : undefined}
              min={spec.t === "num" ? 0 : undefined}
              step={spec.t === "num" ? "any" : undefined}
              value={d}
              placeholder={spec.ph ?? (isLink ? "https://…" : undefined)}
              disabled={readOnly}
              autoComplete="off"
              onChange={(e) => set(e.target.value)}
              onBlur={done}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
            />
            {isLink && <OpenLink href={d} />}
          </div>
        )}
      />
    </div>
  );
}
