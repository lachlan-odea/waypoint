import { useEffect, useState } from "react";
import type {
  Campaign,
  Designer,
  EventChecklist,
  EventStatus,
  MarketingEvent,
  Project,
  Workspace,
} from "../types";
import { formatShort, todayIso } from "../dates";
import {
  CURRENCIES,
  EVENT_CHECKLIST,
  EVENT_DIVISIONS,
  EVENT_REGIONS,
  EVENT_STATUSES,
  emptyChecklist,
  eventStatusMeta,
  fiscalYear,
  formatUsd,
  toUsd,
} from "../events";
import { ProjectPicker } from "./ProjectPicker";
import { ItineraryModal } from "./ItineraryModal";
import { Icon } from "./Icon";

type Props = {
  initial: Partial<MarketingEvent>;
  mode: "create" | "edit";
  // Every event, for the lead, region and division suggestions.
  events: MarketingEvent[];
  // Waypoint campaigns an event can be filed under.
  campaigns: Campaign[];
  // The team, for the lead suggestions.
  designers: Designer[];
  // Board projects doing work for the event.
  projects: Project[];
  workspaces: Workspace[];
  onCancel: () => void;
  onSave: (event: MarketingEvent) => void;
  onDelete?: () => void;
  // Jump to a linked project's window, or the linked campaign. Closes this
  // editor first.
  onOpenProject?: (projectId: string) => void;
  onOpenCampaign?: (campaignId: string) => void;
  // Render as the Details tab of the event's page: no overlay, no close
  // button, no Escape, no Cancel. Save and Delete work as before.
  inline?: boolean;
};

function newId(): string {
  return `ev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// Numbers are held as text while editing so a half-typed value doesn't
// snap to 0; they're parsed on save.
function numberOrUndefined(s: string): number | undefined {
  const t = s.trim();
  if (!t) return undefined;
  const n = Number(t.replace(/,/g, ""));
  return isNaN(n) ? undefined : n;
}

function textOrUndefined(s: string): string | undefined {
  const t = s.trim();
  return t ? t : undefined;
}

// Suggestions for a free-text field: every value already in use, sorted.
function valuesInUse(events: MarketingEvent[], pick: (e: MarketingEvent) => string | undefined): string[] {
  const seen = new Set<string>();
  events.forEach((e) => {
    const v = pick(e)?.trim();
    if (v) seen.add(v);
  });
  return Array.from(seen).sort((a, b) => a.localeCompare(b));
}

export function EventModal({
  initial,
  mode,
  events,
  campaigns,
  designers,
  projects,
  workspaces,
  onCancel,
  onSave,
  onDelete,
  onOpenProject,
  onOpenCampaign,
  inline = false,
}: Props) {
  const today = todayIso();
  const [name, setName] = useState(initial.name ?? "");
  const [status, setStatus] = useState<EventStatus>(initial.status ?? "prospect");
  const [division, setDivision] = useState(initial.division ?? EVENT_DIVISIONS[0]);
  const [region, setRegion] = useState(initial.region ?? "");
  const [location, setLocation] = useState(initial.location ?? "");
  // Dates: set, or to be confirmed. A TBC event may still know its month.
  const [tbc, setTbc] = useState(!initial.startDate && (mode === "edit" || !!initial.tbcMonth));
  const [tbcMonth, setTbcMonth] = useState(initial.tbcMonth ?? "");
  const [year, setYear] = useState(String(initial.year ?? today.slice(0, 4)));
  const [startDate, setStartDate] = useState(initial.startDate ?? "");
  const [endDate, setEndDate] = useState(initial.endDate ?? initial.startDate ?? "");
  const [datesAsPublished, setDatesAsPublished] = useState(initial.datesAsPublished ?? "");
  const [audience, setAudience] = useState(initial.audience ?? "");
  const [sponsor, setSponsor] = useState(!!initial.sponsor);
  const [sponsorNote, setSponsorNote] = useState(initial.sponsorNote ?? "");
  const [booth, setBooth] = useState(!!initial.booth);
  const [boothNote, setBoothNote] = useState(initial.boothNote ?? "");
  const [attendAndSell, setAttendAndSell] = useState(!!initial.attendAndSell);
  const [speaking, setSpeaking] = useState(initial.speakingOpportunity ?? "");
  const [marketingLead, setMarketingLead] = useState(initial.marketingLead ?? "");
  const [salesLead, setSalesLead] = useState(initial.salesLead ?? "");
  const [salesAttendeeCount, setSalesAttendeeCount] = useState(
    initial.salesAttendeeCount === undefined ? "" : String(initial.salesAttendeeCount),
  );
  const [salesAttendees, setSalesAttendees] = useState(initial.salesAttendees ?? "");
  const [academyAttendee, setAcademyAttendee] = useState(initial.academyAttendee ?? "");
  const [partnerAttendees, setPartnerAttendees] = useState(initial.partnerAttendees ?? "");
  const [campaignCode, setCampaignCode] = useState(initial.campaignCode ?? "");
  const [campaignId, setCampaignId] = useState(initial.campaignId ?? "");
  const [projectIds, setProjectIds] = useState<string[]>(initial.projectIds ?? []);
  const [presentation, setPresentation] = useState(initial.presentation ?? "");
  const [feedbackDoc, setFeedbackDoc] = useState(initial.feedbackDoc ?? "");
  const [investment, setInvestment] = useState(
    initial.investment === undefined ? "" : String(initial.investment),
  );
  const [currency, setCurrency] = useState(initial.currency ?? "USD");
  const [costDetails, setCostDetails] = useState(initial.costDetails ?? "");
  const [comms, setComms] = useState(initial.comms === undefined ? "" : String(initial.comms));
  const [opps, setOpps] = useState(initial.opps === undefined ? "" : String(initial.opps));
  const [oppsBreakdown, setOppsBreakdown] = useState(initial.oppsBreakdown ?? "");
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [checklist, setChecklist] = useState<EventChecklist>({
    ...emptyChecklist(),
    ...(initial.checklist ?? {}),
  });
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The itinerary, its page token and its SharePoint link are edited in
  // their own window and written on their own; held here so this editor's
  // save, which rewrites the whole event, carries the latest of each.
  const [itinerary, setItinerary] = useState(initial.itinerary);
  const [itineraryShareToken, setItineraryShareToken] = useState(initial.itineraryShareToken);
  const [itinerarySharePointUrl, setItinerarySharePointUrl] = useState(
    initial.itinerarySharePointUrl,
  );
  const [itineraryOpen, setItineraryOpen] = useState(false);

  useEffect(() => {
    if (inline) return;
    function onKey(e: KeyboardEvent) {
      // The itinerary window handles its own Escape.
      if (e.key === "Escape" && !itineraryOpen) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, itineraryOpen, inline]);

  const datesValid = tbc
    ? !!tbcMonth || /^\d{4}$/.test(year.trim())
    : !!startDate && !!endDate && endDate >= startDate;
  const canSave = name.trim().length > 0 && datesValid;

  const investmentNumber = numberOrUndefined(investment);
  const usd = investmentNumber === undefined ? undefined : toUsd(investmentNumber, currency);
  const rate = CURRENCIES.find((c) => c.code === currency)?.usd;

  const marketingLeads = valuesInUse(
    [...events, ...designers.map((d) => ({ marketingLead: d.name }) as MarketingEvent)],
    (e) => e.marketingLead,
  );
  const salesLeads = valuesInUse(events, (e) => e.salesLead);
  const regions = valuesInUse(
    [...events, ...EVENT_REGIONS.map((r) => ({ region: r }) as MarketingEvent)],
    (e) => e.region,
  );
  const divisions = valuesInUse(
    [...events, ...EVENT_DIVISIONS.map((d) => ({ division: d }) as MarketingEvent)],
    (e) => e.division,
  );

  const linkedProjects = projectIds
    .map((id) => projects.find((p) => p.id === id))
    .filter((p): p is Project => !!p);
  const linkedCampaign = campaigns.find((c) => c.id === campaignId);

  const done = EVENT_CHECKLIST.filter((item) => checklist[item.key]).length;

  function toggleChecklist(key: keyof EventChecklist) {
    setChecklist((cur) => ({ ...cur, [key]: !cur[key] }));
  }

  function submit() {
    if (!canSave) return;
    const resolvedYear = tbc
      ? tbcMonth
        ? Number(tbcMonth.slice(0, 4))
        : Number(year.trim())
      : Number(startDate.slice(0, 4));
    const event: MarketingEvent = {
      id: initial.id ?? newId(),
      name: name.trim(),
      status,
      year: resolvedYear,
      startDate: tbc ? "" : startDate,
      endDate: tbc ? "" : endDate,
      tbcMonth: tbc ? textOrUndefined(tbcMonth) : undefined,
      datesAsPublished: textOrUndefined(datesAsPublished),
      division: division.trim() || EVENT_DIVISIONS[0],
      region: textOrUndefined(region),
      location: textOrUndefined(location),
      audience: textOrUndefined(audience),
      sponsor,
      sponsorNote: textOrUndefined(sponsorNote),
      booth,
      boothNote: textOrUndefined(boothNote),
      attendAndSell,
      speakingOpportunity: textOrUndefined(speaking),
      marketingLead: textOrUndefined(marketingLead),
      salesLead: textOrUndefined(salesLead),
      salesAttendeeCount: numberOrUndefined(salesAttendeeCount),
      salesAttendees: textOrUndefined(salesAttendees),
      academyAttendee: textOrUndefined(academyAttendee),
      partnerAttendees: textOrUndefined(partnerAttendees),
      campaignCode: textOrUndefined(campaignCode),
      campaignId: textOrUndefined(campaignId),
      projectIds,
      presentation: textOrUndefined(presentation),
      feedbackDoc: textOrUndefined(feedbackDoc),
      investment: investmentNumber,
      currency: investmentNumber === undefined ? undefined : currency,
      investmentUsd: usd,
      costDetails: textOrUndefined(costDetails),
      comms: numberOrUndefined(comms),
      opps: numberOrUndefined(opps),
      oppsBreakdown: textOrUndefined(oppsBreakdown),
      notes: textOrUndefined(notes),
      checklist,
      itinerary,
      itineraryShareToken,
      itinerarySharePointUrl,
      createdAt: initial.createdAt ?? new Date().toISOString(),
      source: initial.source ?? "manual",
    };
    onSave(event);
  }

  const statusMeta = eventStatusMeta(status);
  const subtitle = tbc
    ? tbcMonth
      ? `${new Date(`${tbcMonth}-01T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" })} · dates TBC`
      : `${year} · dates TBC`
    : datesValid
      ? `${formatShort(startDate)} – ${formatShort(endDate)} ${startDate.slice(0, 4)} · ${fiscalYear(startDate)}`
      : "";

  const editor = (
      <div className={inline ? "modal item-editor" : "modal"} onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2 className="modal-title-static">
              {inline ? "Event details" : mode === "create" ? "New event" : "Edit event"}
            </h2>
            {subtitle && (
              <div className="modal-sub">
                <span className="camp-brand-dot" style={{ background: statusMeta.color }} />
                {statusMeta.label} · {subtitle}
                {location.trim() ? ` · ${location.trim()}` : ""}
              </div>
            )}
          </div>
          <div className="modal-head-actions">
            {mode === "edit" && initial.id && (
              <>
                {itinerarySharePointUrl && (
                  <a
                    className="share-btn"
                    href={itinerarySharePointUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open the itinerary's page on SharePoint"
                  >
                    Itinerary on SharePoint <Icon name="external-link" size={12} />
                  </a>
                )}
                <button
                  type="button"
                  className="share-btn"
                  onClick={() => setItineraryOpen(true)}
                  title="The attendee itinerary: stand shifts, sessions, meetings and meals, day by day. Drafted from the event, then put on SharePoint as a page that keeps itself up to date."
                >
                  {itinerary ? "Edit itinerary" : "Generate itinerary"}
                </button>
              </>
            )}
            {!inline && (
              <button className="icon-btn" onClick={onCancel} aria-label="Close">
                <Icon name="close" size={16} />
              </button>
            )}
          </div>
        </header>

        <div className="modal-body">
          <label className="field">
            <span>Event name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Multimodal 2027"
              autoFocus
            />
          </label>

          <div className="modal-grid">
            <label className="field">
              <span>Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as EventStatus)}>
                {EVENT_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <span className="field-hint">
                A confirmed event shows as Live while it's on and Done once it's
                over, without changing this.
              </span>
            </label>
            <label className="field">
              <span>Division</span>
              <input
                value={division}
                onChange={(e) => setDivision(e.target.value)}
                list="ev-divisions"
                placeholder="CargoWise or Landside"
              />
              <datalist id="ev-divisions">
                {divisions.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </label>
            <label className="field">
              <span>Region</span>
              <input
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                list="ev-regions"
                placeholder="Americas, EMEA, APAC…"
              />
              <datalist id="ev-regions">
                {regions.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </label>
            <label className="field">
              <span>Location</span>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="City, country"
              />
            </label>
          </div>

          <div className="modal-section ev-section">
            <h3>Dates</h3>
            <label className="soc-check">
              <input type="checkbox" checked={tbc} onChange={(e) => setTbc(e.target.checked)} />
              <span>
                Dates to be confirmed
                <span className="soc-check-hint">
                  Pencil in the month if it's known. The event is listed under it
                  until the dates are set.
                </span>
              </span>
            </label>
            <div className="modal-grid">
              {tbc ? (
                <>
                  <label className="field">
                    <span>Month (if known)</span>
                    <input
                      type="month"
                      value={tbcMonth}
                      onChange={(e) => setTbcMonth(e.target.value)}
                    />
                  </label>
                  {!tbcMonth && (
                    <label className="field">
                      <span>Year</span>
                      <input
                        type="number"
                        min={2020}
                        max={2100}
                        value={year}
                        onChange={(e) => setYear(e.target.value)}
                      />
                      {!datesValid && (
                        <span className="field-hint warn">Give the event a year at least.</span>
                      )}
                    </label>
                  )}
                </>
              ) : (
                <>
                  <label className="field">
                    <span>First day</span>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => {
                        const next = e.target.value;
                        setStartDate(next);
                        if (next && (!endDate || endDate < next)) setEndDate(next);
                      }}
                    />
                    {!startDate && (
                      <span className="field-hint warn">
                        Every dated event needs a first day — or tick TBC above.
                      </span>
                    )}
                  </label>
                  <label className="field">
                    <span>Last day</span>
                    <input
                      type="date"
                      value={endDate}
                      min={startDate || undefined}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                    {startDate && endDate && endDate < startDate && (
                      <span className="field-hint warn">The last day is before the first.</span>
                    )}
                  </label>
                </>
              )}
              <label className="field">
                <span>Dates as published</span>
                <input
                  value={datesAsPublished}
                  onChange={(e) => setDatesAsPublished(e.target.value)}
                  placeholder="The organiser's wording, e.g. 28th - 30th January"
                />
              </label>
            </div>
          </div>

          <div className="modal-section ev-section">
            <h3>Presence</h3>
            <div className="modal-grid">
              <div className="ev-flag-field">
                <label className="soc-check">
                  <input type="checkbox" checked={sponsor} onChange={(e) => setSponsor(e.target.checked)} />
                  <span>Sponsor</span>
                </label>
                <input
                  value={sponsorNote}
                  onChange={(e) => setSponsorNote(e.target.value)}
                  placeholder="Level, e.g. Bronze sponsor"
                  aria-label="Sponsorship note"
                />
              </div>
              <div className="ev-flag-field">
                <label className="soc-check">
                  <input type="checkbox" checked={booth} onChange={(e) => setBooth(e.target.checked)} />
                  <span>Booth / stand</span>
                </label>
                <input
                  value={boothNote}
                  onChange={(e) => setBoothNote(e.target.value)}
                  placeholder="Stand number and size, or whose booth we're on"
                  aria-label="Booth note"
                />
              </div>
              <label className="soc-check" style={{ gridColumn: "1 / -1" }}>
                <input
                  type="checkbox"
                  checked={attendAndSell}
                  onChange={(e) => setAttendAndSell(e.target.checked)}
                />
                <span>
                  Attend & sell
                  <span className="soc-check-hint">
                    Going as visitors to meet prospects, rather than exhibiting.
                  </span>
                </span>
              </label>
            </div>
            <label className="field">
              <span>Speaking opportunity</span>
              <textarea
                value={speaking}
                onChange={(e) => setSpeaking(e.target.value)}
                rows={2}
                placeholder="Who's speaking, the session, when"
              />
            </label>
            <label className="field">
              <span>Audience</span>
              <textarea
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                rows={2}
                placeholder="How many come and who they are — forwarders, customs brokers, carriers…"
              />
            </label>
          </div>

          <div className="modal-section ev-section">
            <h3>People</h3>
            <div className="modal-grid">
              <label className="field">
                <span>Marketing lead</span>
                <input
                  value={marketingLead}
                  onChange={(e) => setMarketingLead(e.target.value)}
                  list="ev-marketing-leads"
                  placeholder="Who's running it for marketing"
                />
                <datalist id="ev-marketing-leads">
                  {marketingLeads.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </label>
              <label className="field">
                <span>Sales lead</span>
                <input
                  value={salesLead}
                  onChange={(e) => setSalesLead(e.target.value)}
                  list="ev-sales-leads"
                  placeholder="Who's running it for sales"
                />
                <datalist id="ev-sales-leads">
                  {salesLeads.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </label>
              <label className="field">
                <span>Sales attendees</span>
                <input
                  type="number"
                  min={0}
                  value={salesAttendeeCount}
                  onChange={(e) => setSalesAttendeeCount(e.target.value)}
                  placeholder="How many"
                />
              </label>
              <label className="field">
                <span>WiseTech Academy attendee</span>
                <input
                  value={academyAttendee}
                  onChange={(e) => setAcademyAttendee(e.target.value)}
                  placeholder="Name, if Academy is going"
                />
              </label>
            </div>
            <label className="field">
              <span>Who's going</span>
              <textarea
                value={salesAttendees}
                onChange={(e) => setSalesAttendees(e.target.value)}
                rows={2}
                placeholder="Names and roles"
              />
            </label>
            <label className="field">
              <span>CargoWise partner attendees</span>
              <input
                value={partnerAttendees}
                onChange={(e) => setPartnerAttendees(e.target.value)}
                placeholder="Partners joining us on the stand"
              />
            </label>
          </div>

          <div className="modal-section ev-section">
            <h3>Budget</h3>
            <div className="modal-grid">
              <label className="field">
                <span>Investment</span>
                <div className="ev-money">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={investment}
                    onChange={(e) => setInvestment(e.target.value)}
                    placeholder="0.00"
                  />
                  <select value={currency} onChange={(e) => setCurrency(e.target.value)} aria-label="Currency">
                    {CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code}
                      </option>
                    ))}
                    {!CURRENCIES.some((c) => c.code === currency) && (
                      <option value={currency}>{currency}</option>
                    )}
                  </select>
                </div>
                <span className="field-hint">
                  {usd === undefined
                    ? "Booth, tickets, sponsorship, collateral — whatever the event costs."
                    : currency === "USD"
                      ? `${formatUsd(usd)} USD`
                      : `≈ ${formatUsd(usd)} USD at a fixed ${rate ?? 1} rate — for comparing events, not invoicing.`}
                </span>
              </label>
              <label className="field">
                <span>Cost details</span>
                <textarea
                  value={costDetails}
                  onChange={(e) => setCostDetails(e.target.value)}
                  rows={2}
                  placeholder="What the figure covers"
                />
              </label>
            </div>
          </div>

          <div className="modal-section ev-section">
            <h3>Results</h3>
            <div className="modal-grid">
              <label className="field">
                <span>Comms</span>
                <input
                  type="number"
                  min={0}
                  value={comms}
                  onChange={(e) => setComms(e.target.value)}
                  placeholder="Conversations logged"
                />
              </label>
              <label className="field">
                <span>Opps</span>
                <input
                  type="number"
                  min={0}
                  value={opps}
                  onChange={(e) => setOpps(e.target.value)}
                  placeholder="Opportunities opened"
                />
              </label>
              <label className="field" style={{ gridColumn: "1 / -1" }}>
                <span>Opps by tier</span>
                <input
                  value={oppsBreakdown}
                  onChange={(e) => setOppsBreakdown(e.target.value)}
                  placeholder="e.g. 2 Gold · 2 Silver · 1 Bronze"
                />
              </label>
              <label className="field">
                <span>Presentation</span>
                <input
                  value={presentation}
                  onChange={(e) => setPresentation(e.target.value)}
                  placeholder="File name or link"
                />
              </label>
              <label className="field">
                <span>Event feedback</span>
                <input
                  value={feedbackDoc}
                  onChange={(e) => setFeedbackDoc(e.target.value)}
                  placeholder="Feedback form or reflections doc"
                />
              </label>
            </div>
          </div>

          <div className="modal-section ev-section">
            <div className="ev-checklist-head">
              <h3>Checklist</h3>
              <span className="muted small">
                {done} of {EVENT_CHECKLIST.length} done
              </span>
            </div>
            <div className="ev-check-bar" aria-hidden>
              <div
                className="ev-check-fill"
                style={{ width: `${(done / EVENT_CHECKLIST.length) * 100}%` }}
              />
            </div>
            <div className="ev-checklist">
              {EVENT_CHECKLIST.map((item) => (
                <label key={item.key} className="soc-check">
                  <input
                    type="checkbox"
                    checked={checklist[item.key]}
                    onChange={() => toggleChecklist(item.key)}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
            <p className="field-hint" style={{ margin: 0 }}>
              Once the event is over, a missing feedback form, report or logged
              results put it on the needs-follow-up list.
            </p>
          </div>

          <div className="modal-section ev-section">
            <h3>Links</h3>
            <div className="modal-grid">
              <label className="field">
                <span>Campaign code</span>
                <input
                  value={campaignCode}
                  onChange={(e) => setCampaignCode(e.target.value)}
                  placeholder="CMP0001…"
                />
                <span className="field-hint">The CRM code leads from the event are logged against.</span>
              </label>
              <label className="field">
                <span>Waypoint campaign</span>
                <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
                  <option value="">Not part of a campaign</option>
                  {campaigns
                    .slice()
                    .sort((a, b) => b.startDate.localeCompare(a.startDate))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.startDate ? ` (${c.startDate.slice(0, 4)})` : ""}
                      </option>
                    ))}
                  {campaignId && !campaigns.some((c) => c.id === campaignId) && (
                    <option value={campaignId}>Deleted campaign</option>
                  )}
                </select>
                {linkedCampaign && onOpenCampaign && (
                  <span className="field-hint">
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => onOpenCampaign(linkedCampaign.id)}
                    >
                      Open {linkedCampaign.name} <Icon name="external-link" size={12} />
                    </button>
                  </span>
                )}
              </label>
            </div>
            <div className="asset-field">
              <label className="field">
                <span>Projects for this event</span>
              </label>
              <ProjectPicker
                projects={projects}
                workspaces={workspaces}
                value={projectIds}
                onChange={setProjectIds}
                placeholder="Search projects to link — the booth graphics, the presentation, the social posts…"
              />
              {onOpenProject && linkedProjects.length > 0 && (
                <div className="camp-linked-open">
                  <span className="muted small">Open:</span>
                  {linkedProjects.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="btn-mini"
                      onClick={() => onOpenProject(p.id)}
                      title="Close this event and open the project"
                    >
                      {p.title} <Icon name="external-link" size={12} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <label className="field">
            <span>Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Anything else the team should know"
            />
          </label>

          {error && <p className="login-error">{error}</p>}
        </div>

        <footer className="modal-foot">
          {mode === "edit" && onDelete && (
            confirmingDelete ? (
              <>
                <span className="delete-confirm-prompt">Delete this event?</span>
                <button className="danger" onClick={onDelete}>
                  Yes, delete
                </button>
                <button onClick={() => setConfirmingDelete(false)}>Keep</button>
              </>
            ) : (
              <button
                className="danger"
                style={{ marginRight: "auto" }}
                onClick={() => setConfirmingDelete(true)}
              >
                Delete
              </button>
            )
          )}
          {!inline && <button onClick={onCancel}>Cancel</button>}
          {mode === "create" && (
            <span className="muted small" style={{ marginRight: "auto" }}>
              Save the event, then open it to generate its itinerary.
            </span>
          )}
          <button
            className="primary"
            onClick={() => {
              if (!canSave) {
                setError(
                  !name.trim()
                    ? "Give the event a name."
                    : "Check the dates — set both days, or tick TBC.",
                );
                return;
              }
              setError(null);
              submit();
            }}
          >
            {mode === "create" ? "Add event" : "Save changes"}
          </button>
        </footer>
      </div>
  );
  return (
    <div className={inline ? "item-editor-wrap" : "modal-overlay"}>
      {editor}
      {itineraryOpen && initial.id && (
        <ItineraryModal
          event={{
            ...(initial as MarketingEvent),
            itinerary,
            itineraryShareToken,
            itinerarySharePointUrl,
          }}
          onClose={() => setItineraryOpen(false)}
          onSaved={(patch) => {
            setItinerary(patch.itinerary);
            setItineraryShareToken(patch.itineraryShareToken);
            setItinerarySharePointUrl(patch.itinerarySharePointUrl);
          }}
        />
      )}
    </div>
  );
}
