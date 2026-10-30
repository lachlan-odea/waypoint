import { useEffect, useState } from "react";
import type { Campaign, Designer, WebinarKit } from "../../types";
import { BRANDS, brandColor } from "../../constants";
import { todayIso } from "../../dates";
import { formatShort } from "../../dates";
import {
  DELIVERY,
  PHASES,
  SECTIONS,
  TYPES,
  WEBINAR_CATEGORY,
  emptyKit,
  newKitId,
  schedule,
  withKit,
} from "../../webinarKit";
import { Icon } from "../Icon";

// Start a webinar: a campaign of type Webinar with the kit attached. The
// go-live date sets every section's due date, previewed below the form.

type Props = {
  designers: Designer[];
  currentDesignerId: string;
  // Series names already in use, for the suggestions.
  series: string[];
  // Pre-filled for the next episode or the next iteration.
  preset?: Partial<WebinarKit> & { name?: string; from?: Campaign };
  onCancel: () => void;
  onCreate: (campaign: Campaign) => void;
};

export function NewWebinarModal({ designers, currentDesignerId, series, preset, onCancel, onCreate }: Props) {
  const [name, setName] = useState(preset?.name ?? "");
  const [wt, setWt] = useState(preset?.wt ?? "");
  const [type, setType] = useState(preset?.type ?? "pdd");
  const [delivery, setDelivery] = useState<"live" | "prerecorded">(preset?.delivery ?? "live");
  const [goLive, setGoLive] = useState(preset?.goLive ?? "");
  const [recordDate, setRecordDate] = useState(preset?.recordDate ?? "");
  const [phase, setPhase] = useState(preset?.phase ?? "");
  const [seriesName, setSeriesName] = useState(preset?.series ?? "");
  const [ep, setEp] = useState(preset?.ep ? String(preset.ep) : "");
  const [lead, setLead] = useState(preset?.lead ?? currentDesignerId);
  const [brand, setBrand] = useState<string>(preset?.from?.brand ?? BRANDS[0]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const today = todayIso();
  const previewKit: WebinarKit = emptyKit({}, { type, delivery, goLive, recordDate: delivery === "prerecorded" ? recordDate : "" });
  const sch = goLive ? schedule(previewKit) : null;
  const late = sch ? SECTIONS.filter((s) => sch[s.k].due && sch[s.k].due < today) : [];

  function pickType(k: string) {
    setType(k);
    if (TYPES[k].prerec) setDelivery("prerecorded");
  }

  function create() {
    if (!name.trim()) {
      setError("Give the webinar a name.");
      return;
    }
    const from = preset?.from;
    const kit: WebinarKit = emptyKit(
      {},
      {
        stage: "planning",
        type,
        delivery,
        goLive,
        recordDate: delivery === "prerecorded" ? recordDate : "",
        phase,
        series: seriesName.trim(),
        ep: ep.trim() ? Number(ep) : undefined,
        wt: wt.trim(),
        duration: TYPES[type].dur,
        lead: lead || undefined,
        team: {
          ...(from?.webinar?.team ?? {}),
          pmm: lead ? Array.from(new Set([...(from?.webinar?.team.pmm ?? []), lead])) : (from?.webinar?.team.pmm ?? []),
        },
        format: from?.webinar?.format ?? "",
        sessions: from?.webinar?.sessions ?? "",
        values: from?.webinar
          ? {
              brief: pick(from.webinar.values.brief ?? {}, ["audience", "audienceNotes", "tReg", "tAtt", "tWatch", "tCta"]),
              core: pick(from.webinar.values.core ?? {}, ["problem", "why", "takeaways"]),
            }
          : {},
        items: from?.webinar
          ? from.webinar.items
              .filter((i) => i.kind === "speaker" || i.kind === "ros")
              .map((i, n) => {
                const d = { ...i.d };
                if (i.kind === "speaker") {
                  delete d.packCopy;
                  delete d.packAsset;
                  delete d.headshot;
                  d.status = "Proposed";
                }
                return { ...i, id: newKitId("i"), d, order: n + 1, by: currentDesignerId, at: new Date().toISOString() };
              })
          : [],
        activity: [
          {
            id: newKitId("a"),
            section: "",
            what: from ? "started this iteration from" : "created the webinar",
            detail: from ? from.name : "",
            by: currentDesignerId,
            at: new Date().toISOString(),
          },
        ],
      },
    );
    const owner = designers.find((d) => d.id === lead);
    const base: Campaign = {
      id: `camp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim(),
      category: WEBINAR_CATEGORY,
      brand,
      owner: owner?.name ?? "",
      ownerId: lead || undefined,
      description: wt.trim() ? `Working title: ${wt.trim()}` : "",
      startDate: goLive || today,
      endDate: goLive || today,
      color: brandColor(brand),
      milestones: [],
      projectIds: [],
      createdAt: new Date().toISOString(),
    };
    onCreate(withKit(base, kit));
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="nw-title">
        <header className="modal-head">
          <div>
            <h2 className="modal-title-static" id="nw-title">
              {preset?.from ? "Start the next iteration" : "Start a webinar"}
            </h2>
            <div className="modal-sub">A campaign of type Webinar, worked through the 2026 webinar kit</div>
          </div>
          <button className="icon-btn" onClick={onCancel} aria-label="Close" type="button">
            <Icon name="close" size={16} />
          </button>
        </header>
        <div className="modal-body">
          {preset?.from && (
            <p className="muted small" style={{ margin: 0 }}>
              Copies the brief, core message, speakers and run of show from {preset.from.name}. Dates, approvals, promotion and results start fresh.
            </p>
          )}
          <div className="kit-fields">
            <div className="kit-field half">
              <label htmlFor="nw-name">Project name</label>
              <input id="nw-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ocean Risk Intelligence" autoComplete="off" autoFocus />
              <span className="kit-hint">Short internal name for the pipeline.</span>
            </div>
            <div className="kit-field half">
              <label htmlFor="nw-wt">Working title</label>
              <input id="nw-wt" value={wt} onChange={(e) => setWt(e.target.value)} placeholder="Working title (optional)" autoComplete="off" />
            </div>
            <div className="kit-field half">
              <label htmlFor="nw-series">Series (optional)</label>
              <input id="nw-series" list="nw-series-list" value={seriesName} onChange={(e) => setSeriesName(e.target.value)} placeholder="Leave blank for a standalone webinar" autoComplete="off" />
              <datalist id="nw-series-list">
                {series.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
            <div className="kit-field half">
              <label htmlFor="nw-ep">Episode</label>
              <input id="nw-ep" type="number" min={1} step={1} inputMode="numeric" value={ep} onChange={(e) => setEp(e.target.value)} />
            </div>
            <div className="kit-field">
              <span className="kit-flabel">Webinar series type</span>
              <div className="kit-typecards" role="group" aria-label="Webinar series type">
                {Object.entries(TYPES).map(([k, t]) => (
                  <button key={k} type="button" className="kit-typecard" aria-pressed={type === k} onClick={() => pickType(k)}>
                    <b>{t.label}</b>
                    <span>
                      {t.dur} · {t.prod}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="kit-field half">
              <span className="kit-flabel">Live or pre-recorded</span>
              <div className="kit-seg" role="radiogroup" aria-label="Delivery">
                {Object.entries(DELIVERY).map(([k, l]) => (
                  <button key={k} type="button" role="radio" aria-checked={delivery === k} onClick={() => setDelivery(k as "live" | "prerecorded")}>
                    {l}
                  </button>
                ))}
              </div>
              {TYPES[type].prerec && <span className="kit-hint">Market and product updates are always pre-recorded.</span>}
            </div>
            <div className="kit-field half">
              <label htmlFor="nw-phase">Strategy phase</label>
              <select id="nw-phase" value={phase} onChange={(e) => setPhase(e.target.value)}>
                <option value="">No phase</option>
                {Object.entries(PHASES).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="kit-field half">
              <label htmlFor="nw-live">Go-live date</label>
              <input id="nw-live" type="date" value={goLive} onChange={(e) => setGoLive(e.target.value)} />
            </div>
            {delivery === "prerecorded" && (
              <div className="kit-field half">
                <label htmlFor="nw-rec">Recording date</label>
                <input id="nw-rec" type="date" value={recordDate} onChange={(e) => setRecordDate(e.target.value)} />
              </div>
            )}
            <div className="kit-field half">
              <label htmlFor="nw-lead">Project lead</label>
              <select id="nw-lead" value={lead} onChange={(e) => setLead(e.target.value)}>
                <option value="">Choose lead</option>
                {designers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="kit-field half">
              <label htmlFor="nw-brand">Brand</label>
              <select id="nw-brand" value={brand} onChange={(e) => setBrand(e.target.value)}>
                {BRANDS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="kit-field">
            <span className="kit-flabel">Kit schedule</span>
            {!sch ? (
              <span className="kit-hint">Choose a go-live date to preview the kit schedule.</span>
            ) : (
              <div className="item-stack">
                {late.length > 0 && (
                  <div className="kit-warnbox">
                    {late.length} {late.length === 1 ? "section is" : "sections are"} already past due with this date. A {TYPES[type].label} usually needs {TYPES[type].prod} of production. You can still create it and change dates in each section.
                  </div>
                )}
                <div className="kit-preview">
                  {SECTIONS.map((s) => (
                    <div key={s.k} className="kit-preview-row">
                      <span className="kit-pn">{String(s.n).padStart(2, "0")}</span>
                      <span>{s.title}</span>
                      <span className={`kit-pd ${sch[s.k].due && sch[s.k].due < today ? "late" : ""}`}>{sch[s.k].due ? formatShort(sch[s.k].due) : "—"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          {error && <p className="login-error">{error}</p>}
        </div>
        <footer className="modal-foot">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={create}>
            {preset?.from ? "Create iteration" : "Create webinar"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function pick<T extends Record<string, unknown>>(obj: T, keys: string[]): T {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (obj[k] != null) out[k] = obj[k];
  return out as T;
}
