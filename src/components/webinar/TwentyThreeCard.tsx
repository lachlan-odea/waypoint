import { useEffect, useId, useMemo, useState } from "react";
import { has, lines, setKitValue } from "../../webinarKit";
import { formatShort } from "../../dates";
import { localTimeZone, supportedTimeZones, timeZoneOffsetLabel } from "../../timezones";
import {
  durationMinutes,
  parseSession,
  twentyThreeAddSpeakers,
  twentyThreeCreateWebinar,
  twentyThreeErrorMessage,
  twentyThreeLinkWebinar,
  twentyThreePullResults,
  type TwentyThreeCreateResult,
} from "../../twentyThree";
import { Icon } from "../Icon";
import type { KitApi } from "./kitApi";

// "Generate landing page", on the kit's Landing page section: creates the
// webinar in TwentyThree from what the section holds (title, summary,
// bullets, speakers, hero image). The function writes the webinar's id and
// address back onto the kit, so this card reads its state from there.
// "Link existing" does the same for a webinar that was set up in
// TwentyThree by hand: it's looked up from its link or id, and nothing is
// sent across.

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

export function TwentyThreeCard({ api }: { api: KitApi }) {
  const { kit, ctx, readOnly } = api;
  const v = ctx.V("landing");
  const liveId = str(v.ttLiveId);
  const url = str(v.ttUrl);
  // Linked to a webinar that was already in TwentyThree, not created from here.
  const linked = v.ttLinked === true;
  const [open, setOpen] = useState(false);
  const [linking, setLinking] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const title = (kit.ft || kit.wt || api.campaign.name || "").trim();
  const speakers = ctx.items("speaker").filter((s) => s.d.status !== "Declined" && has(s.d.name));
  // TwentyThree won’t list a speaker without an email address: the row’s
  // own, or the directory’s.
  const noEmail = speakers
    .filter((s) => !has(s.d.email) && !has(api.speakers.find((d) => d.id === s.d.speakerId)?.email))
    .map((s) => str(s.d.name));
  const missing = [
    !has(kit.ft) && "the final webinar title",
    !has(v.summary) && "a summary",
    lines(v.learn).length === 0 && "‘What you’ll learn’ bullets",
    speakers.length === 0 && "speakers",
    noEmail.length > 0 && `an email address for ${noEmail.join(", ")}`,
  ].filter((x): x is string => !!x);

  async function addSpeakers() {
    if (sending) return;
    setSending(true);
    setError(null);
    setNote(null);
    try {
      const r = await twentyThreeAddSpeakers(api.campaign.id);
      setWarnings(r.warnings);
      const n = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
      const did = [
        r.speakersAdded ? n(r.speakersAdded, "speaker") : "",
        r.headshotsAdded ? n(r.headshotsAdded, "headshot") : "",
      ].filter(Boolean);
      setNote(did.length ? `${did.join(" and ")} added in TwentyThree.` : r.warnings.length ? null : "Every speaker is already in TwentyThree.");
    } catch (err) {
      setError(twentyThreeErrorMessage(err));
    } finally {
      setSending(false);
    }
  }

  function unlink() {
    if (!window.confirm("Unlink this webinar from TwentyThree? The webinar stays in TwentyThree; Waypoint just forgets it, so a new one can be created or another linked.")) {
      return;
    }
    setWarnings([]);
    setNote(null);
    setError(null);
    api.update(
      (k) =>
        (["ttLiveId", "ttUrl", "ttAt", "ttLinked"] as const).reduce((acc, key) => setKitValue(acc, "landing", key, undefined), k),
      "unlinked the webinar from TwentyThree",
      "",
      "landing",
    );
  }

  return (
    <div className="item-card kit-tt">
      <div className="kit-tt-main">
        <h3>
          {!liveId ? "Generate the landing page" : linked ? "Linked to a webinar in TwentyThree" : "Landing page created in TwentyThree"}
        </h3>
        {liveId && linked ? (
          <p>
            {str(v.ttAt) ? `Linked ${formatShort(str(v.ttAt).slice(0, 10))}. ` : ""}
            The page was set up in TwentyThree, so nothing here is sent across except speakers, with Add speakers. Results
            can be pulled in the Results section.
          </p>
        ) : liveId ? (
          <p>
            {str(v.ttAt) ? `Created ${formatShort(str(v.ttAt).slice(0, 10))}. ` : ""}
            It’s private until Digital reviews and publishes it in TwentyThree. Later changes here aren’t sent across.
          </p>
        ) : (
          <p>
            Creates this webinar in TwentyThree with the title, summary, ‘What you’ll learn’ bullets, speakers and hero
            image from this section. It’s created private, for Digital to review and publish. Already set up in
            TwentyThree? Link it instead.
          </p>
        )}
        {!liveId && missing.length > 0 && <p className="kit-hint warn">Still to fill in: {missing.join(", ")}.</p>}
        {liveId && noEmail.length > 0 && (
          <p className="kit-hint warn">No email address yet for {noEmail.join(", ")}, so TwentyThree won’t list them.</p>
        )}
        {note && <p role="status">{note}</p>}
        {error && (
          <p className="kit-hint warn" role="alert">
            {error}
          </p>
        )}
        {warnings.length > 0 && (
          <ul className="kit-tt-warn">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
      </div>
      <div className="kit-tt-actions">
        {liveId ? (
          <>
            {url && (
              <a className="btn btn-secondary btn-sm" href={url} target="_blank" rel="noopener noreferrer">
                Open in TwentyThree <Icon name="external-link" size={14} />
              </a>
            )}
            {!readOnly && speakers.length > 0 && (
              <button type="button" className="btn btn-secondary btn-sm" disabled={sending} onClick={addSpeakers} title="Send speakers and headshots that aren’t in TwentyThree yet">
                <Icon name="group-user-people" size={14} /> {sending ? "Adding…" : "Add speakers"}
              </button>
            )}
            {!readOnly && (
              <button type="button" className="link-btn" onClick={unlink}>
                Unlink
              </button>
            )}
          </>
        ) : (
          <>
            <button type="button" className="btn btn-secondary" disabled={readOnly} onClick={() => setLinking(true)}>
              <Icon name="link" size={16} /> Link existing
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={readOnly || !title}
              title={!title ? "Add a webinar title first" : undefined}
              onClick={() => setOpen(true)}
            >
              <Icon name="rocket" size={16} /> Generate landing page
            </button>
          </>
        )}
      </div>
      {linking && (
        <LinkDialog
          api={api}
          onClose={() => setLinking(false)}
          onLinked={(name) => {
            setWarnings([]);
            setError(null);
            setNote(name ? `Linked to “${name}” in TwentyThree.` : "Linked to the webinar in TwentyThree.");
            setLinking(false);
          }}
        />
      )}
      {open && (
        <CreateDialog
          api={api}
          title={title}
          speakerCount={speakers.length}
          missing={missing}
          onClose={() => setOpen(false)}
          onCreated={(r) => {
            setWarnings(r.warnings);
            setNote(null);
            setError(null);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function CreateDialog({
  api,
  title,
  speakerCount,
  missing,
  onClose,
  onCreated,
}: {
  api: KitApi;
  title: string;
  speakerCount: number;
  missing: string[];
  onClose: () => void;
  onCreated: (r: TwentyThreeCreateResult) => void;
}) {
  const { kit } = api;
  const id = useId();
  const zones = useMemo(() => supportedTimeZones(), []);
  const [date, setDate] = useState(kit.goLive || "");
  // The kit’s "Date and time" line, read for the start time and zone.
  const fromKit = useMemo(() => parseSession(kit.sessions), [kit.sessions]);
  const [time, setTime] = useState(fromKit.time);
  const [zone, setZone] = useState(() => (fromKit.zone && zones.includes(fromKit.zone) ? fromKit.zone : localTimeZone()));
  const [minutes, setMinutes] = useState(() => String(durationMinutes(kit.duration) ?? 30));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  const mins = Number(minutes);
  const ready = !!date && !!time && !!zone && isFinite(mins) && mins >= 5 && mins <= 600;

  async function create() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      onCreated(
        await twentyThreeCreateWebinar({
          campaignId: api.campaign.id,
          startTime: `${date}T${time}`,
          timezone: zone,
          durationMinutes: Math.round(mins),
        }),
      );
    } catch (err) {
      setError(twentyThreeErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay confirm-overlay">
      <div className="modal confirm-modal kit-tt-modal" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
        <header className="modal-head">
          <h2 className="modal-title-static" id={`${id}-title`}>
            Create the webinar in TwentyThree
          </h2>
        </header>
        <div className="modal-body">
          <p className="kit-tt-what">
            <strong>{title}</strong>
            <span className="muted small">
              {speakerCount} speaker{speakerCount === 1 ? "" : "s"} · created private, speakers aren’t emailed
              {api.ctx.V("landing")["emailSeq|od"] === true ? " · on-demand on" : " · on-demand off"}
            </span>
          </p>
          {kit.sessions.trim() && (
            <p className="muted small kit-tt-sessions">
              {fromKit.time ? "Read from the kit" : "From the kit"}: {kit.sessions.trim()}
            </p>
          )}
          <div className="kit-tt-grid">
            <label className="field">
              <span>Date</span>
              <input type="date" value={date} disabled={busy} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="field">
              <span>Start time</span>
              <input type="time" value={time} disabled={busy} autoFocus={!fromKit.time} onChange={(e) => setTime(e.target.value)} />
            </label>
            <label className="field kit-tt-wide">
              <span>Time zone</span>
              <select value={zone} disabled={busy} onChange={(e) => setZone(e.target.value)}>
                {zones.map((z) => (
                  <option key={z} value={z}>
                    {z.replace(/_/g, " ")} ({timeZoneOffsetLabel(z)})
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Duration (minutes)</span>
              <input type="number" min={5} max={600} value={minutes} disabled={busy} onChange={(e) => setMinutes(e.target.value)} />
            </label>
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            One session is created. For a second region, clone it in TwentyThree.
          </p>
          {missing.length > 0 && <p className="kit-hint warn">Not filled in yet, so it won’t be sent: {missing.join(", ")}.</p>}
          {error && (
            <p className="kit-hint warn" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="modal-foot">
          <button onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="primary" onClick={create} disabled={!ready || busy}>
            {busy ? "Creating…" : "Create webinar"}
          </button>
        </footer>
      </div>
    </div>
  );
}

// "Link existing": point the kit at a webinar that's already in
// TwentyThree, from its link or id.
function LinkDialog({ api, onClose, onLinked }: { api: KitApi; onClose: () => void; onLinked: (name: string) => void }) {
  const id = useId();
  // The kit's own Landing page link is usually the one wanted.
  const [link, setLink] = useState(() => str(api.ctx.V("landing").landingLink));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  const ready = !!link.trim();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      onLinked((await twentyThreeLinkWebinar(api.campaign.id, link.trim())).name);
    } catch (err) {
      setError(twentyThreeErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay confirm-overlay">
      <form className="modal confirm-modal kit-tt-modal" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} onSubmit={submit}>
        <header className="modal-head">
          <h2 className="modal-title-static" id={`${id}-title`}>
            Link a webinar that’s already in TwentyThree
          </h2>
        </header>
        <div className="modal-body">
          <label className="field">
            <span>Webinar link or ID</span>
            <input
              type="text"
              inputMode="url"
              value={link}
              disabled={busy}
              autoFocus
              placeholder="Paste the webinar’s link from TwentyThree"
              aria-describedby={`${id}-hint`}
              onChange={(e) => setLink(e.target.value)}
            />
          </label>
          <p className="muted small" id={`${id}-hint`}>
            Its registration page link, its address when it’s open in TwentyThree, or just its ID. Nothing is changed in
            TwentyThree: this only lets Waypoint add speakers to it and pull its results.
          </p>
          {error && (
            <p className="kit-hint warn" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="modal-foot">
          <button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={!ready || busy}>
            {busy ? "Linking…" : "Link webinar"}
          </button>
        </footer>
      </form>
    </div>
  );
}

// "Pull results", on the kit’s Results section: fills the Performance
// numbers from TwentyThree for a webinar that was created or linked there.
export function TwentyThreeResultsCard({ api }: { api: KitApi }) {
  const { ctx, readOnly } = api;
  const liveId = str(ctx.V("landing").ttLiveId);
  const pulledAt = str(ctx.V("results").ttPulledAt);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function pull() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNote(null);
    setMissing([]);
    try {
      const r = await twentyThreePullResults(api.campaign.id);
      setNote(r.filled.length ? `Filled in: ${r.filled.join(", ")}.` : "TwentyThree has no numbers for this webinar yet.");
      setMissing(r.filled.length ? r.missing : []);
    } catch (err) {
      setError(twentyThreeErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="item-card kit-tt">
      <div className="kit-tt-main">
        <h3>Results from TwentyThree</h3>
        {liveId ? (
          <p>
            Fills in the Performance numbers below from TwentyThree, replacing what’s there.
            {pulledAt ? ` Last pulled ${formatShort(pulledAt.slice(0, 10))}.` : ""}
          </p>
        ) : (
          <p>Available once the webinar is created or linked in TwentyThree, in the Landing page section.</p>
        )}
        {note && <p role="status">{note}</p>}
        {missing.length > 0 && <p>Not available from TwentyThree, so fill in by hand: {missing.join(", ")}.</p>}
        {error && (
          <p className="kit-hint warn" role="alert">
            {error}
          </p>
        )}
      </div>
      {liveId && !readOnly && (
        <div className="kit-tt-actions">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={pull}>
            <Icon name="download" size={16} /> {busy ? "Pulling…" : "Pull results"}
          </button>
        </div>
      )}
    </div>
  );
}
