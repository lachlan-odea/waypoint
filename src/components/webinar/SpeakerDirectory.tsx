import { useMemo, useState } from "react";
import type { Campaign, Speaker } from "../../types";
import { kitName, kitOf } from "../../webinarKit";
import { timeAgo } from "../../dates";
import { Icon } from "../Icon";
import { EmptyNote } from "../pages/ItemPage";

// The speaker directory: people who present on webinars, saved once and
// added to any webinar's speaker list from there. Name, title and
// organisation, bio, headshot link, LinkedIn and email, plus which
// webinars they've spoken on.

type Props = {
  speakers: Speaker[];
  campaigns: Campaign[];
  onSave: (speaker: Speaker) => void;
  onDelete: (id: string) => void;
};

export function newSpeakerId(): string {
  return `spk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  return words.slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

const isHttp = (s: string) => /^https?:\/\//i.test(s.trim());

export function SpeakerDirectory({ speakers, campaigns, onSave, onDelete }: Props) {
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Speaker | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  // Which webinars each speaker is on: by the directory link on the row,
  // or by an exact name match for rows typed in before the directory.
  const usage = useMemo(() => {
    const map = new Map<string, Campaign[]>();
    for (const c of campaigns) {
      const kit = kitOf(c);
      if (!kit) continue;
      for (const it of kit.items) {
        if (it.kind !== "speaker") continue;
        const sp = speakers.find((s) => s.id === it.d.speakerId || (!it.d.speakerId && s.name.trim().toLowerCase() === String(it.d.name ?? "").trim().toLowerCase()));
        if (!sp) continue;
        const list = map.get(sp.id) ?? [];
        if (!list.some((x) => x.id === c.id)) list.push(c);
        map.set(sp.id, list);
      }
    }
    return map;
  }, [campaigns, speakers]);

  const list = speakers
    .filter((s) => {
      const t = q.trim().toLowerCase();
      return !t || [s.name, s.title, s.bio, s.notes ?? ""].some((x) => x.toLowerCase().includes(t));
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  function startNew() {
    setEditing({ id: newSpeakerId(), name: "", title: "", bio: "", headshot: "", linkedin: "", email: "", notes: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  }

  return (
    <div className="sp">
      <div className="wb-filters">
        <div className="wb-search">
          <Icon name="search" size={16} />
          <input type="search" value={q} placeholder="Search speakers" aria-label="Search speakers" onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="item-hint">
          {speakers.length} {speakers.length === 1 ? "speaker" : "speakers"} saved
        </span>
        <button type="button" className="btn btn-primary btn-sm" style={{ marginLeft: "auto" }} onClick={startNew}>
          <Icon name="add-plus" size={14} /> New speaker
        </button>
      </div>

      {editing && (
        <SpeakerForm
          speaker={editing}
          isNew={!speakers.some((s) => s.id === editing.id)}
          onCancel={() => setEditing(null)}
          onSave={(s) => {
            onSave({ ...s, updatedAt: new Date().toISOString() });
            setEditing(null);
          }}
        />
      )}

      {speakers.length === 0 && !editing ? (
        <div className="item-missing">
          <h2>No speakers saved yet</h2>
          <p className="muted">
            Save a speaker once — name, title, bio and a link to their headshot — and add them to any webinar's speaker list from the directory. You can also save a speaker straight from a webinar's speaker row.
          </p>
          <button type="button" className="btn btn-primary" onClick={startNew}>
            <Icon name="add-plus" size={16} /> Add the first speaker
          </button>
        </div>
      ) : list.length === 0 ? (
        <EmptyNote>No speakers match “{q}”.</EmptyNote>
      ) : (
        <div className="sp-grid">
          {list.map((s) => {
            const used = usage.get(s.id) ?? [];
            return (
              <article key={s.id} className="item-card sp-card">
                <div className="sp-card-top">
                  <Headshot speaker={s} size={56} />
                  <div className="sp-card-main">
                    <h4>{s.name || "Unnamed speaker"}</h4>
                    {s.title && <p className="sp-title">{s.title}</p>}
                    <div className="sp-links">
                      {isHttp(s.headshot) && (
                        <a href={s.headshot} target="_blank" rel="noopener noreferrer">
                          <Icon name="user-profile" size={12} /> Headshot
                        </a>
                      )}
                      {s.linkedin && isHttp(s.linkedin) && (
                        <a href={s.linkedin} target="_blank" rel="noopener noreferrer">
                          <Icon name="external-link" size={12} /> LinkedIn
                        </a>
                      )}
                      {s.email && (
                        <a href={`mailto:${s.email}`}>
                          <Icon name="email" size={12} /> {s.email}
                        </a>
                      )}
                    </div>
                  </div>
                </div>
                {s.bio ? <p className="sp-bio">{s.bio}</p> : <p className="sp-bio item-hint">No bio yet.</p>}
                {s.notes && <p className="item-hint">{s.notes}</p>}
                <div className="sp-card-foot">
                  <span className="item-hint">
                    {used.length ? `On ${used.length} ${used.length === 1 ? "webinar" : "webinars"}: ${used.map((c) => kitName(c)).join(", ")}` : "Not on a webinar yet"}
                    {" · "}updated {timeAgo(s.updatedAt)}
                  </span>
                  <span className="kit-row">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(s)}>
                      Edit
                    </button>
                    {confirming === s.id ? (
                      <>
                        <span className="item-hint">Remove from the directory? Webinars keep their copy.</span>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(null)}>
                          Keep
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => {
                            onDelete(s.id);
                            setConfirming(null);
                          }}
                        >
                          Remove
                        </button>
                      </>
                    ) : (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(s.id)}>
                        Remove
                      </button>
                    )}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

// The headshot from its link when the link is an image, else initials.
export function Headshot({ speaker, size = 40 }: { speaker: Pick<Speaker, "name" | "headshot">; size?: number }) {
  const [failed, setFailed] = useState(false);
  const url = speaker.headshot.trim();
  if (url && isHttp(url) && !failed) {
    return <img className="sp-headshot" src={url} alt="" width={size} height={size} style={{ width: size, height: size }} onError={() => setFailed(true)} />;
  }
  return (
    <span className="sp-headshot sp-headshot-initials" style={{ width: size, height: size, fontSize: size / 2.6 }} aria-hidden="true">
      {initialsOf(speaker.name)}
    </span>
  );
}

function SpeakerForm({ speaker, isNew, onCancel, onSave }: { speaker: Speaker; isNew: boolean; onCancel: () => void; onSave: (s: Speaker) => void }) {
  const [s, setS] = useState<Speaker>(speaker);
  const set = (k: keyof Speaker, v: string) => setS((cur) => ({ ...cur, [k]: v }));
  const canSave = s.name.trim().length > 0;
  return (
    <form
      className="item-card sp-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) onSave({ ...s, name: s.name.trim(), title: s.title.trim(), headshot: s.headshot.trim(), linkedin: s.linkedin?.trim(), email: s.email?.trim() });
      }}
    >
      <div className="item-card-head">
        <h3>{isNew ? "New speaker" : `Edit ${speaker.name}`}</h3>
        <Headshot speaker={s} size={40} />
      </div>
      <div className="item-card-body">
        <div className="kit-fields">
          <div className="kit-field half">
            <label htmlFor="sp-name">Name</label>
            <input id="sp-name" value={s.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Priya Nair" autoComplete="off" autoFocus />
          </div>
          <div className="kit-field half">
            <label htmlFor="sp-title">Title and organisation</label>
            <input id="sp-title" value={s.title} onChange={(e) => set("title", e.target.value)} placeholder="Head of Ocean, CargoWise" autoComplete="off" />
          </div>
          <div className="kit-field">
            <label htmlFor="sp-headshot">Headshot link</label>
            <div className="kit-inrow">
              <input id="sp-headshot" type="url" value={s.headshot} onChange={(e) => set("headshot", e.target.value)} placeholder="https://… (SharePoint, IntelligenceBank or a direct image link)" autoComplete="off" />
              {isHttp(s.headshot) && (
                <a className="btn btn-ghost btn-sm" href={s.headshot} target="_blank" rel="noopener noreferrer" title="Open link">
                  <Icon name="external-link" size={14} />
                </a>
              )}
            </div>
            <span className="kit-hint">A direct image link shows as the picture; any other link is kept as a link.</span>
          </div>
          <div className="kit-field">
            <label htmlFor="sp-bio">Bio</label>
            <textarea id="sp-bio" rows={4} value={s.bio} onChange={(e) => set("bio", e.target.value)} placeholder="Two or three sentences, as it would appear on a landing page" />
          </div>
          <div className="kit-field half">
            <label htmlFor="sp-linkedin">LinkedIn</label>
            <input id="sp-linkedin" type="url" value={s.linkedin ?? ""} onChange={(e) => set("linkedin", e.target.value)} placeholder="https://www.linkedin.com/in/…" autoComplete="off" />
          </div>
          <div className="kit-field half">
            <label htmlFor="sp-email">Email</label>
            <input id="sp-email" type="email" value={s.email ?? ""} onChange={(e) => set("email", e.target.value)} placeholder="name@company.com" autoComplete="off" />
          </div>
          <div className="kit-field">
            <label htmlFor="sp-notes">Notes</label>
            <textarea id="sp-notes" rows={2} value={s.notes ?? ""} onChange={(e) => set("notes", e.target.value)} placeholder="Topics they cover, availability, who introduced them" />
          </div>
        </div>
        <div className="kit-row end">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={!canSave}>
            {isNew ? "Save speaker" : "Save changes"}
          </button>
        </div>
      </div>
    </form>
  );
}
