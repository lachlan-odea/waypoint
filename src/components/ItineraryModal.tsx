import { useEffect, useState } from "react";
import type {
  EventItinerary,
  ItineraryAddition,
  ItineraryDay,
  ItineraryItem,
  ItineraryItemType,
  ItineraryRow,
  ItineraryTravel,
  MarketingEvent,
} from "../types";
import { formatLong, formatShort, timeAgo } from "../dates";
import {
  CITY_COLORS,
  ITINERARY_ITEM_TYPES,
  MANUAL_CHECKS,
  TRAVEL_STATEMENT,
  draftItinerary,
  eachDay,
  emptyItem,
  emptyRow,
  formatTimeRange,
  itemTypeLabel,
  itineraryChecks,
  itinerarySummary,
  newItineraryId,
  sortItems,
} from "../itinerary";
import {
  downloadItineraryPage,
  itineraryPageFileName,
  publishItineraryPage,
} from "../itineraryExport";
import { newShareToken } from "../campaignExport";
import {
  deleteItineraryAddition,
  deleteItineraryTravel,
  setEventItinerary,
  setEventItineraryShareToken,
  setEventItinerarySharePointUrl,
  subscribeItineraryAdditions,
  subscribeItineraryTravel,
} from "../firestore";
import { SharePointGuideModal } from "./SharePointGuideModal";
import { Icon } from "./Icon";

// Where itinerary pages are uploaded. The same Marketing library as the
// campaign pages until the events team has a folder of its own.
const SHAREPOINT_ITINERARIES_FOLDER =
  "https://wisetechglobal.sharepoint.com/:f:/r/SiteCollectionDocuments/Shared%20Documents/Marketing/Campaigns?d=wbb6a1759bb3a4fcfad7c554679e80e8c&csf=1&web=1&e=7v3dSL";

type Props = {
  // The event as saved. Its itinerary, token and link seed the editor.
  event: MarketingEvent;
  onClose: () => void;
  // After every successful write, so an event editor open underneath keeps
  // the same itinerary, token and link when it saves the whole event.
  onSaved: (
    patch: Pick<MarketingEvent, "itinerary" | "itineraryShareToken" | "itinerarySharePointUrl">,
  ) => void;
};

type RowSection = "attendees" | "venue" | "contacts" | "standShifts" | "shipping";

const ROW_SECTIONS: {
  key: RowSection;
  title: string;
  hint: string;
  labels: [string, string, string];
  optional: boolean;
}[] = [
  {
    key: "attendees",
    title: "Who’s attending",
    hint: "Everyone from our side. Names on an item's Attending line are checked against this list.",
    labels: ["Name", "Role", "Note"],
    optional: false,
  },
  {
    key: "venue",
    title: "Venue and stand",
    hint: "The hall, the stand number and size, opening hours, where to collect badges.",
    labels: ["What", "Where / when", "Note"],
    optional: false,
  },
  {
    key: "contacts",
    title: "Key contacts",
    hint: "The organiser's exhibitor desk, the stand builder, the AV contact.",
    labels: ["Name", "Who they are", "Note"],
    optional: true,
  },
  {
    key: "standShifts",
    title: "Stand shifts",
    hint: "Who's on the stand when, if it isn't everyone all day.",
    labels: ["When", "Who", "Note"],
    optional: true,
  },
  {
    key: "shipping",
    title: "Shipping and collateral",
    hint: "What's been sent ahead, the courier, where it's delivered to.",
    labels: ["What", "Where / when", "Note"],
    optional: true,
  },
];

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// The itinerary as saved: items in time order, days in date order.
function tidy(it: EventItinerary): EventItinerary {
  return {
    ...it,
    headerLine: it.headerLine.trim(),
    attendeesNote: it.attendeesNote.trim(),
    cities: it.cities.map((c) => ({ ...c, name: c.name.trim() })),
    days: it.days
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({ ...d, items: sortItems(d.items) })),
    updatedAt: new Date().toISOString(),
  };
}

export function ItineraryModal({ event, onClose, onSaved }: Props) {
  const [it, setIt] = useState<EventItinerary>(() => event.itinerary ?? draftItinerary(event));
  const fresh = !event.itinerary;
  // Held here, like the campaign editor holds its token: a token minted
  // while this is open has to survive the event editor's own save.
  const [token, setToken] = useState(event.itineraryShareToken);
  const [url, setUrl] = useState(event.itinerarySharePointUrl);
  const [dirty, setDirty] = useState(fresh);
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [newDay, setNewDay] = useState("");
  // What readers of the SharePoint page have added to the days, live
  // while this is open. Nothing until the page exists (no token).
  const [rawAdditions, setAdditions] = useState<ItineraryAddition[]>([]);
  useEffect(() => {
    if (!token) return;
    return subscribeItineraryAdditions(token, setAdditions, (err) =>
      console.warn("Couldn't load the itinerary page's additions", err),
    );
  }, [token]);
  // Without a page there's nowhere additions could have come from.
  const additions = token ? rawAdditions : [];
  // Attendees' travel and accommodation, entered on the page.
  const [rawTravel, setTravel] = useState<ItineraryTravel[]>([]);
  useEffect(() => {
    if (!token) return;
    return subscribeItineraryTravel(token, setTravel, (err) =>
      console.warn("Couldn't load the itinerary page's travel entries", err),
    );
  }, [token]);
  const travel = token ? rawTravel : [];

  function removeTravel(t: ItineraryTravel) {
    if (!token) return;
    setTravel((cur) => cur.filter((x) => x.id !== t.id));
    deleteItineraryTravel(token, t.id).catch((err) => {
      console.warn("Couldn't remove the travel entry", err);
      setError("Couldn't remove that travel entry from the page. Try again.");
    });
  }
  // Optional sections start folded until they have rows.
  const [open, setOpen] = useState<Set<RowSection>>(
    () =>
      new Set(
        ROW_SECTIONS.filter(
          (s) => !s.optional || (event.itinerary?.[s.key].length ?? 0) > 0,
        ).map((s) => s.key),
      ),
  );

  function requestClose() {
    if (dirty) setConfirmingClose(true);
    else onClose();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !guideOpen) requestClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guideOpen, dirty]);

  function update(fn: (cur: EventItinerary) => EventItinerary) {
    setIt((cur) => fn(cur));
    setDirty(true);
    setSavedNote(null);
  }

  // ── rows ─────────────────────────────────────────────────────────────

  function patchRow(section: RowSection, id: string, patch: Partial<ItineraryRow>) {
    update((cur) => ({
      ...cur,
      [section]: cur[section].map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  }
  function addRow(section: RowSection) {
    update((cur) => ({ ...cur, [section]: [...cur[section], emptyRow()] }));
    setOpen((cur) => new Set(cur).add(section));
  }
  function removeRow(section: RowSection, id: string) {
    update((cur) => ({ ...cur, [section]: cur[section].filter((r) => r.id !== id) }));
  }

  // ── cities ───────────────────────────────────────────────────────────

  function addCity() {
    update((cur) => ({
      ...cur,
      cities: [
        ...cur.cities,
        {
          id: newItineraryId("city"),
          name: "",
          color: CITY_COLORS[cur.cities.length % CITY_COLORS.length],
        },
      ],
    }));
  }
  function patchCity(id: string, patch: { name?: string; color?: string }) {
    update((cur) => {
      const before = cur.cities.find((c) => c.id === id);
      const cities = cur.cities.map((c) => (c.id === id ? { ...c, ...patch } : c));
      // Renaming a city carries its days along.
      const days =
        before && patch.name !== undefined
          ? cur.days.map((d) => (d.city === before.name ? { ...d, city: patch.name as string } : d))
          : cur.days;
      return { ...cur, cities, days };
    });
  }
  function removeCity(id: string) {
    update((cur) => ({ ...cur, cities: cur.cities.filter((c) => c.id !== id) }));
  }

  // ── days and items ───────────────────────────────────────────────────

  const eventDays = eachDay(event.startDate, event.endDate);
  const missingDays = eventDays.filter((d) => !it.days.some((x) => x.date === d));

  function addDays(dates: string[]) {
    update((cur) => ({
      ...cur,
      days: [
        ...cur.days,
        ...dates
          .filter((d) => d && !cur.days.some((x) => x.date === d))
          .map(
            (date): ItineraryDay => ({
              date,
              city: cur.cities[0]?.name ?? "",
              title: "",
              note: "",
              items: [],
            }),
          ),
      ].sort((a, b) => a.date.localeCompare(b.date)),
    }));
  }
  function patchDay(date: string, patch: Partial<ItineraryDay>) {
    update((cur) => ({
      ...cur,
      days: cur.days.map((d) => (d.date === date ? { ...d, ...patch } : d)),
    }));
  }
  function removeDay(date: string) {
    update((cur) => ({ ...cur, days: cur.days.filter((d) => d.date !== date) }));
  }
  function addItem(date: string, type: ItineraryItemType = "meeting") {
    update((cur) => ({
      ...cur,
      days: cur.days.map((d) => {
        if (d.date !== date) return d;
        // Start where the last item left off, so a run of items needs little
        // more than a title each.
        const last = sortItems(d.items)[d.items.length - 1];
        return { ...d, items: [...d.items, { ...emptyItem(type), start: last?.end ?? "" }] };
      }),
    }));
  }
  function patchItem(date: string, id: string, patch: Partial<ItineraryItem>) {
    update((cur) => ({
      ...cur,
      days: cur.days.map((d) =>
        d.date === date
          ? { ...d, items: d.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }
          : d,
      ),
    }));
  }
  function removeItem(date: string, id: string) {
    update((cur) => ({
      ...cur,
      days: cur.days.map((d) =>
        d.date === date ? { ...d, items: d.items.filter((i) => i.id !== id) } : d,
      ),
    }));
  }

  // Fold a reader's addition into its day as an ordinary item (adding the
  // day if it isn't in the plan), then take the addition off the page. The
  // item lands unsaved like any other edit; the page shows it again once
  // the itinerary is saved.
  function acceptAddition(a: ItineraryAddition) {
    update((cur) => {
      const item: ItineraryItem = {
        ...emptyItem(a.type),
        start: a.start,
        end: a.end,
        title: a.title,
        details: a.details,
        attending: a.attending,
      };
      const hasDay = cur.days.some((d) => d.date === a.date);
      const days = hasDay
        ? cur.days.map((d) => (d.date === a.date ? { ...d, items: [...d.items, item] } : d))
        : [
            ...cur.days,
            { date: a.date, city: cur.cities[0]?.name ?? "", title: "", note: "", items: [item] },
          ].sort((x, y) => x.date.localeCompare(y.date));
      return { ...cur, days };
    });
    dismissAddition(a);
  }

  function dismissAddition(a: ItineraryAddition) {
    if (!token) return;
    // Drop it locally straight away; the subscription confirms.
    setAdditions((cur) => cur.filter((x) => x.id !== a.id));
    deleteItineraryAddition(token, a.id).catch((err) => {
      console.warn("Couldn't remove the addition", err);
      setError("Couldn't remove that addition from the page. It may come back; try again.");
    });
  }

  function additionsHtml(list: ItineraryAddition[]) {
    return (
      <div className="it-additions">
        <div className="it-additions-head">
          Added from the SharePoint page
          <span className="muted small">
            {" "}
            · fold each into the day, or dismiss it
          </span>
        </div>
        {list.map((a) => (
          <div key={a.id} className="it-addition">
            <span className="it-addition-time">{formatTimeRange(a.start, a.end)}</span>
            <div className="it-addition-body">
              <span className="it-addition-title">
                {a.title}
                <span className="muted small"> · {itemTypeLabel(a.type)}</span>
              </span>
              {a.details && <span className="small">{a.details}</span>}
              {a.attending && (
                <span className="muted small">Attending: {a.attending}</span>
              )}
              <span className="muted small">
                {a.name ? `Added by ${a.name}` : "Added anonymously"}
                {a.createdAt ? ` · ${timeAgo(a.createdAt)}` : ""}
              </span>
            </div>
            <div className="it-addition-actions">
              <button type="button" className="btn-mini primary" onClick={() => acceptAddition(a)}>
                Add to day
              </button>
              <button type="button" className="link-btn" onClick={() => dismissAddition(a)}>
                Dismiss
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  const strayAdditions = additions.filter((a) => !it.days.some((d) => d.date === a.date));

  function toggleManual(id: string) {
    update((cur) => ({
      ...cur,
      manualChecks: cur.manualChecks.includes(id)
        ? cur.manualChecks.filter((x) => x !== id)
        : [...cur.manualChecks, id],
    }));
  }

  // ── save and share ───────────────────────────────────────────────────

  // Writes the itinerary on its own (not the whole event, which may be
  // mid-edit underneath) and refreshes the SharePoint page if there is one.
  async function save(): Promise<EventItinerary | null> {
    const clean = tidy(it);
    setSaving(true);
    setError(null);
    try {
      await setEventItinerary(event.id, clean);
      setIt(clean);
      setDirty(false);
      setSavedNote(`Saved ${new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`);
      onSaved({ itinerary: clean, itineraryShareToken: token, itinerarySharePointUrl: url });
      if (token) {
        publishItineraryPage({ ...event, itinerary: clean, itineraryShareToken: token }).catch(
          (err) => console.warn("Couldn't update the itinerary's SharePoint page", err),
        );
      }
      return clean;
    } catch (err) {
      console.error("Couldn't save the itinerary", err);
      setError(`Couldn't save the itinerary: ${describeError(err)}`);
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function openGuide() {
    if (dirty) {
      const saved = await save();
      if (!saved) return;
    }
    setGuideOpen(true);
  }

  // The first download mints the token; the write isn't awaited so the
  // download doesn't wait on the network.
  function downloadPage() {
    let t = token;
    if (!t) {
      t = newShareToken();
      setToken(t);
      setEventItineraryShareToken(event.id, t).catch((err) => {
        console.warn("Couldn't save the itinerary's share token", err);
        setError("Couldn't register the SharePoint page with Waypoint, so it won't update. Try downloading it again.");
        setToken(undefined);
      });
    }
    const shared = { ...event, itinerary: it, itineraryShareToken: t };
    publishItineraryPage(shared).catch((err) => {
      console.warn("Couldn't publish the itinerary's SharePoint page", err);
      setError("Couldn't publish the SharePoint page, so it won't show live details. Try downloading it again.");
    });
    downloadItineraryPage(event, it, t);
    onSaved({ itinerary: it, itineraryShareToken: t, itinerarySharePointUrl: url });
  }

  function saveSharePointUrl(next: string) {
    setGuideOpen(false);
    if (next === url) return;
    const previous = url;
    setUrl(next);
    onSaved({ itinerary: it, itineraryShareToken: token, itinerarySharePointUrl: next });
    setEventItinerarySharePointUrl(event.id, next).catch((err) => {
      console.warn("Couldn't save the itinerary's SharePoint link", err);
      setError("Couldn't save the SharePoint link. Open the guide again and re-paste it.");
      setUrl(previous);
    });
  }

  const checks = itineraryChecks(it, event);
  const failing = checks.filter((c) => !c.ok).length;
  const manualDone = MANUAL_CHECKS.filter((c) => it.manualChecks.includes(c.id)).length;

  return (
    <div className="modal-overlay">
      <div className="modal it-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2 className="modal-title-static">Itinerary · {event.name}</h2>
            <div className="modal-sub">
              {eventDays.length
                ? `${formatShort(event.startDate)} – ${formatShort(event.endDate)} ${event.endDate.slice(0, 4)}`
                : "Dates TBC"}
              {" · "}
              {itinerarySummary(it)}
              {fresh ? " · drafted from the event, nothing saved yet" : ""}
            </div>
          </div>
          <div className="modal-head-actions">
            {url && (
              <a
                className="share-btn"
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                title="Open the itinerary's page on SharePoint"
              >
                Open on SharePoint <Icon name="external-link" size={12} />
              </a>
            )}
            <button
              type="button"
              className="share-btn"
              onClick={openGuide}
              disabled={saving}
              title="Put a page for this itinerary on SharePoint. It updates itself every time it's opened, so attendees always see the latest plan."
            >
              {url ? "Update SharePoint page" : "Put on SharePoint"}
            </button>
            <button className="icon-btn" onClick={requestClose} aria-label="Close">
              <Icon name="close" size={16} />
            </button>
          </div>
        </header>

        <div className="modal-body it-body">
          <p className="it-travel">
            <strong>Travel and accommodation stay off the day timelines.</strong>{" "}
            {TRAVEL_STATEMENT} The checks below flag anything on a day that looks
            like a flight, hotel or transfer.
          </p>

          <div className="modal-grid">
            <label className="field" style={{ gridColumn: "1 / -1" }}>
              <span>Header line</span>
              <input
                value={it.headerLine}
                onChange={(e) => update((cur) => ({ ...cur, headerLine: e.target.value }))}
                placeholder="Under the event name: the venue, the city, the theme"
              />
            </label>
          </div>

          <div className="modal-section ev-section">
            <div className="it-section-head">
              <h3>Cities</h3>
              <button type="button" className="btn-mini" onClick={addCity}>
                + Add city
              </button>
            </div>
            {it.cities.length === 0 ? (
              <p className="muted small" style={{ margin: 0 }}>
                No city yet. Each day is filed under a city, and the city's colour
                marks its days on the page.
              </p>
            ) : (
              <div className="it-cities">
                {it.cities.map((c) => (
                  <div key={c.id} className="it-city">
                    <input
                      type="color"
                      value={/^#[0-9a-fA-F]{6}$/.test(c.color) ? c.color : "#371ee1"}
                      onChange={(e) => patchCity(c.id, { color: e.target.value })}
                      aria-label="City colour"
                      title="Colour for this city's days"
                    />
                    <input
                      value={c.name}
                      onChange={(e) => patchCity(c.id, { name: e.target.value })}
                      placeholder="City"
                      aria-label="City name"
                    />
                    <button type="button" className="link-btn" onClick={() => removeCity(c.id)}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {ROW_SECTIONS.map((s) => {
            const rows = it[s.key];
            const shown = open.has(s.key) || rows.length > 0;
            return (
              <div key={s.key} className="modal-section ev-section">
                <div className="it-section-head">
                  <h3>
                    {s.title}
                    {s.optional && <span className="muted small"> · optional</span>}
                  </h3>
                  {shown ? (
                    <button type="button" className="btn-mini" onClick={() => addRow(s.key)}>
                      + Add line
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn-mini"
                      onClick={() => setOpen((cur) => new Set(cur).add(s.key))}
                    >
                      Add section
                    </button>
                  )}
                </div>
                {shown && (
                  <>
                    <p className="muted small" style={{ margin: 0 }}>
                      {s.hint}
                    </p>
                    {rows.length > 0 && (
                      <div className="it-rows">
                        <div className="it-row it-row-head" aria-hidden>
                          <span>{s.labels[0]}</span>
                          <span>{s.labels[1]}</span>
                          <span>{s.labels[2]}</span>
                          <span />
                        </div>
                        {rows.map((r) => (
                          <div key={r.id} className="it-row">
                            <input
                              value={r.label}
                              onChange={(e) => patchRow(s.key, r.id, { label: e.target.value })}
                              aria-label={s.labels[0]}
                            />
                            <input
                              value={r.value}
                              onChange={(e) => patchRow(s.key, r.id, { value: e.target.value })}
                              aria-label={s.labels[1]}
                            />
                            <input
                              value={r.note}
                              onChange={(e) => patchRow(s.key, r.id, { note: e.target.value })}
                              aria-label={s.labels[2]}
                            />
                            <button
                              type="button"
                              className="link-btn"
                              onClick={() => removeRow(s.key, r.id)}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {s.key === "attendees" && (
                      <label className="field">
                        <span>Note under the list</span>
                        <input
                          value={it.attendeesNote}
                          onChange={(e) => update((cur) => ({ ...cur, attendeesNote: e.target.value }))}
                          placeholder="e.g. Dress code on show days: WiseTech polo and name badge."
                        />
                      </label>
                    )}
                  </>
                )}
              </div>
            );
          })}

          <div className="modal-section ev-section">
            <div className="it-section-head">
              <h3>Days</h3>
              <div className="it-day-add">
                {missingDays.length > 0 && (
                  <button type="button" className="btn-mini" onClick={() => addDays(missingDays)}>
                    + Add the event's {missingDays.length === eventDays.length ? "" : "missing "}
                    {missingDays.length === 1 ? "day" : `${missingDays.length} days`}
                  </button>
                )}
                <input
                  type="date"
                  value={newDay}
                  onChange={(e) => setNewDay(e.target.value)}
                  aria-label="Another day to add"
                />
                <button
                  type="button"
                  className="btn-mini"
                  disabled={!newDay || it.days.some((d) => d.date === newDay)}
                  onClick={() => {
                    addDays([newDay]);
                    setNewDay("");
                  }}
                >
                  + Add day
                </button>
              </div>
            </div>
            <p className="muted small" style={{ margin: 0 }}>
              A timeline for each day: stand shifts, sessions and speaking slots,
              meetings, meals and networking. Nothing about getting there or
              where anyone's staying.
              {token
                ? " Anyone reading the SharePoint page can add to a day; their additions show up here under it."
                : " Once the page is on SharePoint, anyone reading it can add to a day, and those additions show up here."}
            </p>
            {strayAdditions.length > 0 && (
              <div className="it-day it-day-stray">
                <div className="it-day-head">
                  <strong>Added to days not in the plan</strong>
                </div>
                {additionsHtml(strayAdditions)}
              </div>
            )}
            {it.days.length === 0 && (
              <p className="muted small" style={{ margin: 0 }}>
                No days yet.
                {eventDays.length === 0 ? " Set the event's dates first, or add days by date." : ""}
              </p>
            )}
            {it.days.map((d) => (
              <div key={d.date} className="it-day">
                <div className="it-day-head">
                  <strong>{formatLong(d.date)}</strong>
                  <input
                    value={d.title}
                    onChange={(e) => patchDay(d.date, { title: e.target.value })}
                    placeholder="Stand build, show day 1…"
                    aria-label="Day title"
                  />
                  <select
                    value={d.city}
                    onChange={(e) => patchDay(d.date, { city: e.target.value })}
                    aria-label="City"
                  >
                    <option value="">No city</option>
                    {it.cities.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name || "Unnamed city"}
                      </option>
                    ))}
                    {d.city && !it.cities.some((c) => c.name === d.city) && (
                      <option value={d.city}>{d.city} (not in the city list)</option>
                    )}
                  </select>
                  <button type="button" className="link-btn" onClick={() => removeDay(d.date)}>
                    Remove day
                  </button>
                </div>
                {d.items.length > 0 && (
                  <div className="it-items">
                    <div className="it-item it-item-head" aria-hidden>
                      <span>From</span>
                      <span>To</span>
                      <span>Type</span>
                      <span>Item</span>
                      <span />
                    </div>
                    {d.items.map((i) => (
                      <div key={i.id} className="it-item">
                        <input
                          type="time"
                          value={i.start}
                          onChange={(e) => patchItem(d.date, i.id, { start: e.target.value })}
                          aria-label="Start time"
                        />
                        <input
                          type="time"
                          value={i.end}
                          onChange={(e) => patchItem(d.date, i.id, { end: e.target.value })}
                          aria-label="End time"
                        />
                        <select
                          value={i.type}
                          onChange={(e) =>
                            patchItem(d.date, i.id, { type: e.target.value as ItineraryItemType })
                          }
                          aria-label="Type"
                          title={ITINERARY_ITEM_TYPES.find((t) => t.value === i.type)?.usedFor}
                        >
                          {ITINERARY_ITEM_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                        <input
                          value={i.title}
                          onChange={(e) => patchItem(d.date, i.id, { title: e.target.value })}
                          placeholder="What's happening"
                          aria-label="Item"
                        />
                        <button
                          type="button"
                          className="link-btn"
                          onClick={() => removeItem(d.date, i.id)}
                        >
                          Remove
                        </button>
                        <input
                          className="it-item-details"
                          value={i.details}
                          onChange={(e) => patchItem(d.date, i.id, { details: e.target.value })}
                          placeholder="Details: where, what to bring, who's hosting"
                          aria-label="Details"
                        />
                        <input
                          className="it-item-who"
                          value={i.attending}
                          onChange={(e) => patchItem(d.date, i.id, { attending: e.target.value })}
                          placeholder="Attending (our people, comma-separated)"
                          aria-label="Attending"
                        />
                        <input
                          className="it-item-who"
                          value={i.also}
                          onChange={(e) => patchItem(d.date, i.id, { also: e.target.value })}
                          placeholder="Also / guests (customers, partners, the stand builder)"
                          aria-label="Also attending"
                        />
                      </div>
                    ))}
                  </div>
                )}
                {additions.some((a) => a.date === d.date) &&
                  additionsHtml(additions.filter((a) => a.date === d.date))}
                <div className="it-day-foot">
                  <div className="it-item-adds">
                    {ITINERARY_ITEM_TYPES.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        className="btn-mini"
                        onClick={() => addItem(d.date, t.value)}
                        title={t.usedFor}
                      >
                        + {t.label}
                      </button>
                    ))}
                  </div>
                  <input
                    className="it-day-note"
                    value={d.note}
                    onChange={(e) => patchDay(d.date, { note: e.target.value })}
                    placeholder="Day note, e.g. Busiest day — keep two people on the stand."
                    aria-label="Day note"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="modal-section ev-section">
            <div className="it-section-head">
              <h3>
                Travel and accommodation
                <span className="muted small"> · entered by attendees on the page</span>
              </h3>
            </div>
            {!token ? (
              <p className="muted small" style={{ margin: 0 }}>
                Once the page is on SharePoint, each attendee adds their own flights,
                hotel and contact number there, and they're listed here.
              </p>
            ) : travel.length === 0 ? (
              <p className="muted small" style={{ margin: 0 }}>
                Nobody has entered their travel on the page yet.
              </p>
            ) : (
              <div className="it-travel-list">
                {travel.map((t) => (
                  <div key={t.id} className="it-travel-row">
                    <strong>{t.name}</strong>
                    <span>{t.arrive || <span className="muted">Arrival not given</span>}</span>
                    <span>{t.depart || <span className="muted">Departure not given</span>}</span>
                    <span>{t.hotel || <span className="muted">No hotel given</span>}</span>
                    <span className="muted small">
                      {t.mobile}
                      {t.notes ? `${t.mobile ? " · " : ""}${t.notes}` : ""}
                    </span>
                    <button type="button" className="link-btn" onClick={() => removeTravel(t)}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="modal-section ev-section it-checks">
            <div className="it-section-head">
              <h3>Check &amp; send</h3>
              <span className={`muted small ${failing ? "it-checks-failing" : ""}`}>
                {failing === 0
                  ? "All automatic checks pass"
                  : `${failing} automatic check${failing === 1 ? "" : "s"} to fix`}
                {" · "}
                {manualDone} of {MANUAL_CHECKS.length} manual checks ticked
              </span>
            </div>
            <ul className="it-check-list">
              {checks.map((c) => (
                <li key={c.id} className={c.ok ? "ok" : "fail"}>
                  <span className="it-check-mark" aria-hidden>
                    {c.ok ? <Icon name="checkmark" size={14} /> : <Icon name="close" size={14} />}
                  </span>
                  <span>
                    {c.label}
                    {!c.ok && c.detail && <span className="it-check-detail"> — {c.detail}</span>}
                  </span>
                </li>
              ))}
            </ul>
            <div className="ev-checklist">
              {MANUAL_CHECKS.map((c) => (
                <label key={c.id} className="soc-check">
                  <input
                    type="checkbox"
                    checked={it.manualChecks.includes(c.id)}
                    onChange={() => toggleManual(c.id)}
                  />
                  <span>{c.label}</span>
                </label>
              ))}
            </div>
          </div>

          {error && <p className="login-error">{error}</p>}
        </div>

        <footer className="modal-foot">
          {confirmingClose ? (
            <>
              <span className="delete-confirm-prompt">Close without saving your changes?</span>
              <button className="danger" onClick={onClose}>
                Discard changes
              </button>
              <button onClick={() => setConfirmingClose(false)}>Keep editing</button>
            </>
          ) : (
            <>
              <span className="muted small" style={{ marginRight: "auto" }}>
                {saving ? "Saving…" : dirty ? "Unsaved changes" : (savedNote ?? "")}
              </span>
              <button onClick={requestClose}>{dirty ? "Cancel" : "Close"}</button>
              <button className="primary" onClick={save} disabled={saving || !dirty}>
                Save itinerary
              </button>
            </>
          )}
        </footer>
      </div>
      {guideOpen && (
        <SharePointGuideModal
          subject="itinerary"
          folderUrl={SHAREPOINT_ITINERARIES_FOLDER}
          folderLabel="Marketing › Campaigns"
          fileName={itineraryPageFileName(event.name)}
          initialUrl={url}
          onDownload={downloadPage}
          onSave={saveSharePointUrl}
          onCancel={() => setGuideOpen(false)}
        />
      )}
    </div>
  );
}
