import { useEffect, useState } from "react";
import type { LiveEventIntake, LiveEventPresetContact } from "../types";
import { TEAM_EVENT_PRESETS } from "../liveEventRequests";
import {
  LIVE_EVENT_FORM_FILE_NAME,
  checkIntake,
  downloadLiveEventForm,
  intakeEmails,
  newIntakeToken,
} from "../liveEventRequestExport";
import { timeAgo } from "../dates";
import { Icon } from "./Icon";

type Props = {
  intake: LiveEventIntake;
  onSaveIntake: (patch: LiveEventIntake) => Promise<void>;
  onDeleteRequest: (id: string) => Promise<void>;
  onClose: () => void;
};

// The command that puts firestore.rules live. The deploy workflow only
// publishes the site, so a new collection's rules go up by hand.
const RULES_DEPLOY = "firebase deploy --only firestore:rules";

// Anything on SharePoint over https.
function isSharePointUrl(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return u.protocol === "https:" && /(^|\.)sharepoint\.com$/i.test(u.hostname);
  } catch {
    return false;
  }
}

function isHttpsUrl(value: string): boolean {
  if (!value.trim()) return true;
  try {
    return new URL(value.trim()).protocol === "https:";
  } catch {
    return false;
  }
}

type LinkField = {
  key: "runsheetBlankUrl" | "runsheetExampleUrl" | "guideObsUrl" | "guidePhoneUrl";
  label: string;
  hint: string;
};

const LINK_FIELDS: LinkField[] = [
  { key: "runsheetBlankUrl", label: "Blank runsheet", hint: "The .xlsx template people build their runsheet from." },
  { key: "runsheetExampleUrl", label: "Example runsheet", hint: "The pre-filled example." },
  { key: "guideObsUrl", label: "OBS and webcam guide", hint: "The recording setup PDF for OBS Studio and a webcam." },
  { key: "guidePhoneUrl", label: "Phone guide", hint: "The recording setup PDF for filming on a phone." },
];

// Sets up the Live event request form: the mailboxes and resource links it
// shows, a download of the form itself (as .aspx, for SharePoint), where
// it lives once uploaded, and a way to retire every copy already out there
// by issuing a new token. The settings are baked into the file at download,
// so a change here means downloading and re-uploading the form.
export function LiveEventFormModal({ intake, onSaveIntake, onDeleteRequest, onClose }: Props) {
  const defaults = intakeEmails(intake);
  const [teamEmail, setTeamEmail] = useState(intake.teamEmail ?? "");
  const [facilitiesEmail, setFacilitiesEmail] = useState(intake.facilitiesEmail ?? "");
  const [links, setLinks] = useState<Record<LinkField["key"], string>>({
    runsheetBlankUrl: intake.runsheetBlankUrl ?? "",
    runsheetExampleUrl: intake.runsheetExampleUrl ?? "",
    guideObsUrl: intake.guideObsUrl ?? "",
    guidePhoneUrl: intake.guidePhoneUrl ?? "",
  });
  const [url, setUrl] = useState(intake.sharePointUrl ?? "");
  const [contacts, setContacts] = useState<Record<string, LiveEventPresetContact>>(() =>
    Object.fromEntries(
      TEAM_EVENT_PRESETS.map((p) => [
        p.eventName,
        { name: intake.presetContacts?.[p.eventName]?.name ?? "", email: intake.presetContacts?.[p.eventName]?.email ?? "" },
      ]),
    ),
  );
  const contactsPatch = (): Record<string, LiveEventPresetContact> =>
    Object.fromEntries(
      Object.entries(contacts).map(([k, c]) => [k, { name: c.name.trim(), email: c.email.trim() }]),
    );
  const contactsDirty = TEAM_EVENT_PRESETS.some(
    (p) =>
      contacts[p.eventName].name.trim() !== (intake.presetContacts?.[p.eventName]?.name ?? "").trim() ||
      contacts[p.eventName].email.trim() !== (intake.presetContacts?.[p.eventName]?.email ?? "").trim(),
  );
  const contactsValid = Object.values(contacts).every(
    (c) => !c.email.trim() || /^\S+@\S+\.\S+$/.test(c.email.trim()),
  );
  const [busy, setBusy] = useState<"settings" | "download" | "link" | "rotate" | "check" | null>(null);
  const [check, setCheck] = useState<{ ok: boolean; text: string } | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [downloaded, setDownloaded] = useState(false);
  const [armRotate, setArmRotate] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!armRotate) return;
    const t = setTimeout(() => setArmRotate(false), 5000);
    return () => clearTimeout(t);
  }, [armRotate]);

  const settingsPatch = (): LiveEventIntake => ({
    teamEmail: teamEmail.trim(),
    facilitiesEmail: facilitiesEmail.trim(),
    runsheetBlankUrl: links.runsheetBlankUrl.trim(),
    runsheetExampleUrl: links.runsheetExampleUrl.trim(),
    guideObsUrl: links.guideObsUrl.trim(),
    guidePhoneUrl: links.guidePhoneUrl.trim(),
    presetContacts: contactsPatch(),
  });

  const settingsDirty =
    teamEmail.trim() !== (intake.teamEmail ?? "").trim() ||
    facilitiesEmail.trim() !== (intake.facilitiesEmail ?? "").trim() ||
    LINK_FIELDS.some((f) => links[f.key].trim() !== (intake[f.key] ?? "").trim()) ||
    contactsDirty;
  const linksValid = LINK_FIELDS.every((f) => isHttpsUrl(links[f.key]));
  const emailsValid =
    (!teamEmail.trim() || /^\S+@\S+\.\S+$/.test(teamEmail.trim())) &&
    (!facilitiesEmail.trim() || /^\S+@\S+\.\S+$/.test(facilitiesEmail.trim()));

  async function run<T>(what: typeof busy, fn: () => Promise<T>, done: string): Promise<T | undefined> {
    setBusy(what);
    setError("");
    setMessage("");
    try {
      const out = await fn();
      setMessage(done);
      return out;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return undefined;
    } finally {
      setBusy(null);
    }
  }

  function saveSettings() {
    return run("settings", () => onSaveIntake(settingsPatch()), "Settings saved. Download the form again to bake them in.");
  }

  // The first download issues the token; later ones reuse it, so a
  // re-download after a settings change doesn't retire the live copy.
  async function download() {
    await run(
      "download",
      async () => {
        const patch = settingsPatch();
        const token = intake.token ?? newIntakeToken();
        if (!intake.token || settingsDirty) await onSaveIntake({ ...patch, token });
        downloadLiveEventForm({ ...intake, ...patch, token }, token);
        setDownloaded(true);
      },
      `Saved ${LIVE_EVENT_FORM_FILE_NAME} to your Downloads folder.`,
    );
  }

  async function rotate() {
    if (!armRotate) {
      setArmRotate(true);
      return;
    }
    setArmRotate(false);
    await run(
      "rotate",
      async () => {
        const token = newIntakeToken();
        const patch = settingsPatch();
        await onSaveIntake({ ...patch, token });
        downloadLiveEventForm({ ...intake, ...patch, token }, token);
        setDownloaded(true);
      },
      "Every copy of the old form now stops working. Upload the new download to SharePoint in its place.",
    );
  }

  function saveLink() {
    return run("link", () => onSaveIntake({ sharePointUrl: url.trim() }), "Link saved.");
  }

  // Sends a test request the way the form does and removes it again, so
  // the answer is about the rules and the key, not about any one copy.
  async function runCheck() {
    if (!intake.token) return;
    const token = intake.token;
    setBusy("check");
    setCheck(null);
    setError("");
    setMessage("");
    try {
      const result = await checkIntake(token);
      if (result.ok) {
        await onDeleteRequest(result.id);
        setCheck({ ok: true, text: "Requests are getting through. A copy of the form with the current key will work." });
      } else if (result.status === 403) {
        setCheck({
          ok: false,
          text:
            `Firestore refused the request (${result.message}). The key it used is the current one, ` +
            `so the rules for live event requests aren't live yet: deploy them with \u201c${RULES_DEPLOY}\u201d ` +
            "from the repo and check again. Until then every copy of the form, old or new, says it can't send.",
        });
      } else {
        setCheck({ ok: false, text: `Couldn't reach Firestore: ${result.message}` });
      }
    } catch (err) {
      setCheck({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }

  const urlValid = isSharePointUrl(url);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal ler-form-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ler-form-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <div>
            <h2 className="modal-title-static" id="ler-form-title">
              The Live event request form
            </h2>
            <div className="modal-sub">
              A page for SharePoint that anyone can fill in. Every request it sends lands on this
              board for the team to approve or decline.
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="modal-body">
          <ol className="sp-steps">
            <li className="sp-step">
              <span className="sp-step-num" aria-hidden>
                1
              </span>
              <div className="sp-step-body">
                <h3>What the form says</h3>
                <p className="muted small">
                  The mailboxes it names and the files behind its download buttons. Put the
                  runsheets and recording guides on SharePoint and paste their links here; a
                  button with no link is left off the form.
                </p>
                <div className="ler-form-grid">
                  <label className="field">
                    <span>Live Events Team mailbox</span>
                    <input
                      value={teamEmail}
                      onChange={(e) => setTeamEmail(e.target.value)}
                      placeholder={defaults.teamEmail}
                      inputMode="email"
                    />
                  </label>
                  <label className="field">
                    <span>Facilities mailbox</span>
                    <input
                      value={facilitiesEmail}
                      onChange={(e) => setFacilitiesEmail(e.target.value)}
                      placeholder={defaults.facilitiesEmail}
                      inputMode="email"
                    />
                  </label>
                  {LINK_FIELDS.map((f) => (
                    <label className="field" key={f.key}>
                      <span>{f.label}</span>
                      <input
                        value={links[f.key]}
                        onChange={(e) => setLinks((cur) => ({ ...cur, [f.key]: e.target.value }))}
                        placeholder="https://wisetechglobal.sharepoint.com/…"
                        inputMode="url"
                      />
                      <span className={`field-hint ${isHttpsUrl(links[f.key]) ? "" : "warn"}`}>
                        {isHttpsUrl(links[f.key]) ? f.hint : "That isn't an https link."}
                      </span>
                    </label>
                  ))}
                </div>
                <h4 className="ler-sub-h">Contacts for the regular events</h4>
                <p className="muted small">
                  Who <strong>Add event</strong> lists as the contact when the team picks one of
                  these. Kept here rather than in the app's source. Nothing to re-download: this
                  isn't part of the form.
                </p>
                <div className="ler-form-grid">
                  {TEAM_EVENT_PRESETS.map((p) => (
                    <div className="ler-contact-row" key={p.eventName}>
                      <span className="ler-contact-ev">{p.eventName}</span>
                      <input
                        aria-label={`${p.eventName} contact name`}
                        value={contacts[p.eventName].name}
                        onChange={(e) =>
                          setContacts((cur) => ({ ...cur, [p.eventName]: { ...cur[p.eventName], name: e.target.value } }))
                        }
                        placeholder="Contact name"
                      />
                      <input
                        aria-label={`${p.eventName} contact email`}
                        value={contacts[p.eventName].email}
                        onChange={(e) =>
                          setContacts((cur) => ({ ...cur, [p.eventName]: { ...cur[p.eventName], email: e.target.value } }))
                        }
                        placeholder="Their email"
                        inputMode="email"
                      />
                    </div>
                  ))}
                </div>
                {!contactsValid && <p className="field-hint warn">One of the contact emails doesn't look right.</p>}
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={busy !== null || !settingsDirty || !linksValid || !emailsValid || !contactsValid}
                  onClick={saveSettings}
                >
                  {busy === "settings" ? "Saving…" : "Save settings"}
                </button>
              </div>
            </li>

            <li className={`sp-step ${downloaded ? "done" : ""}`}>
              <span className="sp-step-num" aria-hidden>
                {downloaded ? <Icon name="checkmark" size={14} /> : 2}
              </span>
              <div className="sp-step-body">
                <h3>Download the form</h3>
                <p className="muted small">
                  Saves <code>{LIVE_EVENT_FORM_FILE_NAME}</code> to your Downloads folder with the
                  settings above baked in.
                  {intake.token
                    ? " The form already has its key, so this download replaces the live copy without retiring it."
                    : " The first download gives the form its key, which is what lets its requests in."}
                </p>
                <button
                  type="button"
                  className={downloaded ? "btn btn-secondary btn-sm" : "btn btn-primary"}
                  disabled={busy !== null || !linksValid || !emailsValid}
                  onClick={download}
                >
                  <Icon name="download" size={14} />{" "}
                  {busy === "download" ? "Preparing…" : downloaded ? "Download again" : "Download form"}
                </button>
              </div>
            </li>

            <li className="sp-step">
              <span className="sp-step-num" aria-hidden>
                3
              </span>
              <div className="sp-step-body">
                <h3>Upload it to SharePoint</h3>
                <p className="muted small">
                  Drag the file into the document library people will find it in (or use Upload
                  › Files), then click the <strong>⋯</strong> next to the file, go to{" "}
                  <strong>More</strong> and click <strong>Check in</strong>: until it's checked in,
                  only you can open it. Replacing an existing copy keeps its link.
                </p>
              </div>
            </li>

            <li className={`sp-step ${urlValid && url.trim() === (intake.sharePointUrl ?? "").trim() ? "done" : ""}`}>
              <span className="sp-step-num" aria-hidden>
                {urlValid && url.trim() === (intake.sharePointUrl ?? "").trim() ? (
                  <Icon name="checkmark" size={14} />
                ) : (
                  4
                )}
              </span>
              <div className="sp-step-body">
                <h3>Keep the form's link here</h3>
                <p className="muted small">
                  Click the <strong>⋯</strong> next to the file, then <strong>Copy link</strong>, so
                  the team can always find the live copy.
                </p>
                <label className="field">
                  <input
                    aria-label="SharePoint link to the form"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && urlValid) saveLink();
                    }}
                    placeholder="https://wisetechglobal.sharepoint.com/…"
                    inputMode="url"
                  />
                  {url.trim() && !urlValid && (
                    <span className="field-hint warn">
                      That isn't a SharePoint link. Copy it from the file's ⋯ menu.
                    </span>
                  )}
                </label>
                <div className="ler-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={busy !== null || !urlValid || url.trim() === (intake.sharePointUrl ?? "").trim()}
                    onClick={saveLink}
                  >
                    {busy === "link" ? "Saving…" : "Save link"}
                  </button>
                  {intake.sharePointUrl && (
                    <a
                      className="btn btn-ghost btn-sm"
                      href={intake.sharePointUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open the form <Icon name="external-link" size={12} />
                    </a>
                  )}
                </div>
              </div>
            </li>
          </ol>

          {intake.token && (
            <section className="ler-retire">
              <h3>Check requests get through</h3>
              <p className="muted small">
                Sends a test request exactly as the form does, signed out and with the current
                key, then removes it. If it's refused, the form's copies will all say they can't
                send, whatever key they carry.
              </p>
              <button type="button" className="btn btn-secondary btn-sm" disabled={busy !== null} onClick={runCheck}>
                {busy === "check" ? "Checking…" : "Send a test request"}
              </button>
              {check && <p className={`field-hint ${check.ok ? "ler-msg" : "warn"}`}>{check.text}</p>}
            </section>
          )}

          {intake.token && (
            <section className="ler-retire">
              <h3>Retire the old copies</h3>
              <p className="muted small">
                If a copy of the form has got somewhere it shouldn't, or you just want a clean
                start, issue a new key. Every copy already out there stops working the moment
                you do, and a fresh download with the new key starts straight away.
                {intake.updatedAt ? ` Last changed ${timeAgo(intake.updatedAt)}.` : ""}
              </p>
              <button
                type="button"
                className={`btn btn-sm ${armRotate ? "btn-danger" : "btn-ghost"}`}
                disabled={busy !== null}
                onClick={rotate}
              >
                {busy === "rotate"
                  ? "Issuing…"
                  : armRotate
                    ? "Click again to retire every existing copy"
                    : "Issue a new key and download"}
              </button>
            </section>
          )}

          {message && <p className="field-hint ler-msg">{message}</p>}
          {error && <p className="field-hint warn">{error}</p>}
        </div>

        <footer className="modal-foot">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
