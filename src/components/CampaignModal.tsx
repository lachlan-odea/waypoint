import { useEffect, useState } from "react";
import type {
  Campaign,
  CampaignMilestone,
  MilestoneType,
  Project,
  SocialCategory,
  SocialPost,
  Workspace,
} from "../types";
import { isSocialMilestone } from "../campaigns";
import { isHttpUrl } from "../socialPosts";
import { MilestonePostLink } from "./MilestonePostLink";
import { MilestonePostDeleteDialog } from "./MilestonePostDeleteDialog";
import { BRANDS, brandColor, brandForChannel } from "../constants";
import { formatShort, shiftIso, todayIso } from "../dates";
import {
  campaignPageFileName,
  downloadCampaignPage,
  newShareToken,
  publishCampaignPage,
} from "../campaignExport";
import { setCampaignSharePointUrl, setCampaignShareToken } from "../firestore";
import { SharePointGuideModal } from "./SharePointGuideModal";
import { ProjectPicker } from "./ProjectPicker";

type Props = {
  initial: Partial<Campaign>;
  mode: "create" | "edit";
  // The Social calendar's category list; campaigns use the same types.
  categories: SocialCategory[];
  // The milestone type picker's options (Settings → Types & tags).
  milestoneTypes: MilestoneType[];
  owners: string[];
  // Board projects that can be linked as contributing to the campaign.
  projects: Project[];
  workspaces: Workspace[];
  onCancel: () => void;
  // deletePostIds: Social calendar posts to delete along with the
  // milestones that created them, as chosen when each was removed.
  onSave: (campaign: Campaign, deletePostIds: string[]) => void;
  onDelete?: () => void;
  // Jump to a linked project's window. Closes this editor first.
  onOpenProject?: (projectId: string) => void;
  // For the link from each social milestone to the post it created.
  socialPosts?: SocialPost[];
  onOpenSocialPost?: (postId: string) => void;
};

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function CampaignModal({
  initial,
  mode,
  categories,
  milestoneTypes,
  owners,
  projects,
  workspaces,
  onCancel,
  onSave,
  onDelete,
  onOpenProject,
  socialPosts,
  onOpenSocialPost,
}: Props) {
  const [name, setName] = useState(initial.name ?? "");
  const [category, setCategory] = useState(initial.category ?? "");
  // Brand drives the colour. A campaign saved before brands existed opens
  // with the brand its old channel implied; a brand-new one starts on the
  // first brand in the list.
  const [brand, setBrand] = useState(
    initial.brand || (initial.channel ? brandForChannel(initial.channel) : BRANDS[0]),
  );
  const [owner, setOwner] = useState(initial.owner ?? "");
  const [evergreen, setEvergreen] = useState(!!initial.evergreen);
  const [startDate, setStartDate] = useState(initial.startDate ?? todayIso());
  const [endDate, setEndDate] = useState(
    initial.endDate ?? shiftIso(initial.startDate ?? todayIso(), 13),
  );
  const [description, setDescription] = useState(initial.description ?? "");
  const [projectIds, setProjectIds] = useState<string[]>(initial.projectIds ?? []);
  const [milestones, setMilestones] = useState<CampaignMilestone[]>(() =>
    (initial.milestones ?? []).map((m) => ({ ...m })),
  );
  // Held here rather than read from `initial`: a token minted while the
  // editor is open has to survive this editor's own save, which rewrites
  // the whole document.
  const [shareToken, setShareToken] = useState(initial.shareToken);
  // Same again for the link pasted back from SharePoint.
  const [sharePointUrl, setSharePointUrl] = useState(initial.sharePointUrl);
  const [guideOpen, setGuideOpen] = useState(false);
  // A milestone with a social post, waiting on "delete the post too?".
  const [removing, setRemoving] = useState<CampaignMilestone | null>(null);
  // Posts to delete when the campaign is saved. Held until then so that
  // cancelling the editor leaves both the milestone and its post alone.
  const [deletePostIds, setDeletePostIds] = useState<string[]>([]);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // The SharePoint guide and the delete prompt handle their own Escape.
      if (e.key === "Escape" && !guideOpen && !removing) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, guideOpen, removing]);

  const datesValid = !!startDate && !!endDate && endDate >= startDate;
  // An evergreen campaign's dates are hidden and unused, so they can't
  // hold up a save.
  const canSave = name.trim().length > 0 && (evergreen || datesValid);
  const color = brandColor(brand);

  // ── milestones ───────────────────────────────────────────────────────

  function patchMilestone(id: string, patch: Partial<CampaignMilestone>) {
    setMilestones((cur) => cur.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }

  function addMilestone() {
    // Default to the day after the last milestone, or the start date, so a
    // run of "EDM 1 / EDM 2 / EDM 3" needs a label each and little else.
    const last = milestones[milestones.length - 1];
    const date = last?.date ? shiftIso(last.date, 1) : startDate;
    setMilestones((cur) => [
      ...cur,
      { id: newId("ms"), date, label: "", done: false },
    ]);
  }

  // A milestone whose post still exists asks about the post first. One
  // whose post is already gone (or never existed) just goes.
  function removeMilestone(id: string) {
    const m = milestones.find((x) => x.id === id);
    const postId = m?.socialPostId;
    if (m && postId && socialPosts?.some((p) => p.id === postId)) {
      setRemoving(m);
      return;
    }
    dropMilestone(id);
  }

  function dropMilestone(id: string) {
    setMilestones((cur) => cur.filter((m) => m.id !== id));
  }

  function confirmRemoval(deletePost: boolean) {
    if (!removing) return;
    const postId = removing.socialPostId;
    if (deletePost && postId) setDeletePostIds((cur) => [...cur, postId]);
    dropMilestone(removing.id);
    setRemoving(null);
  }

  // ── SharePoint page ──────────────────────────────────────────────────

  // Downloads the saved campaign, not what's mid-edit here — the page
  // fetches the saved version anyway, so unsaved edits show on it once
  // they're saved. The first download mints the campaign's token; the
  // write isn't awaited so the download doesn't wait on the network (and an
  // offline write still lands once it syncs).
  function downloadSharePointPage() {
    if (!initial.id) return;
    let token = shareToken;
    if (!token) {
      token = newShareToken();
      setShareToken(token);
      setCampaignShareToken(initial.id, token).catch((err) => {
        console.warn("Couldn't save the campaign's share token", err);
        setError(
          "Couldn't register the SharePoint page with Waypoint, so it won't update. Try downloading it again.",
        );
        setShareToken(undefined);
      });
    }
    // Publish the public copy the page reads. Also brings a campaign shared
    // before the copy existed up to date.
    const shared = { ...(initial as Campaign), shareToken: token };
    publishCampaignPage(shared, socialPosts ?? []).catch((err) => {
      console.warn("Couldn't publish the campaign's SharePoint page", err);
      setError("Couldn't publish the SharePoint page, so it won't show live details. Try downloading it again.");
    });
    downloadCampaignPage(shared, token, socialPosts ?? []);
  }

  function saveSharePointUrl(url: string) {
    setGuideOpen(false);
    if (!initial.id || url === sharePointUrl) return;
    const previous = sharePointUrl;
    setSharePointUrl(url);
    setCampaignSharePointUrl(initial.id, url).catch((err) => {
      console.warn("Couldn't save the campaign's SharePoint link", err);
      setError("Couldn't save the SharePoint link. Open the guide again and re-paste it.");
      setSharePointUrl(previous);
    });
  }

  // ── save ─────────────────────────────────────────────────────────────

  function submit() {
    if (!canSave) return;
    const cleanMilestones = milestones
      .map((m) => ({
        ...m,
        label: m.label.trim(),
        url: m.url?.trim() || undefined,
        description: m.description?.trim() || undefined,
      }))
      .filter((m) => m.label && m.date)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (cleanMilestones.length !== milestones.length) {
      setError("Every milestone needs a date and a type — remove any blank rows.");
      return;
    }
    if (cleanMilestones.some((m) => m.url && !isHttpUrl(m.url))) {
      setError("Milestone links need to be full web addresses, starting with https://");
      return;
    }
    const campaign: Campaign = {
      id: initial.id ?? newId("camp"),
      name: name.trim(),
      // Legacy field, carried through untouched if it was ever set.
      channel: initial.channel,
      category: category || undefined,
      brand,
      owner: owner.trim(),
      description: description.trimEnd(),
      startDate,
      endDate,
      // Left off rather than stored as false, like the other optional fields.
      evergreen: evergreen || undefined,
      color,
      milestones: cleanMilestones,
      projectIds,
      shareToken,
      sharePointUrl,
      createdAt: initial.createdAt ?? new Date().toISOString(),
    };
    onSave(campaign, deletePostIds);
  }

  // Only a dated campaign has a range for a milestone to fall outside.
  const isOutside = (m: CampaignMilestone) =>
    !evergreen && !!m.date && (m.date < startDate || m.date > endDate);
  const outside = milestones.filter(isOutside).length;

  const linkedProjects = projectIds
    .map((id) => projects.find((p) => p.id === id))
    .filter((p): p is Project => !!p);

  return (
    <div className="modal-overlay">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2 className="modal-title-static">
              {mode === "create" ? "New campaign" : "Edit campaign"}
            </h2>
            {(evergreen || datesValid) && (
              <div className="modal-sub">
                <span className="camp-brand-dot" style={{ background: color }} />
                {brand} ·{" "}
                {evergreen
                  ? "Evergreen"
                  : `${formatShort(startDate)} – ${formatShort(endDate)}`}
              </div>
            )}
          </div>
          <div className="modal-head-actions">
            {mode === "edit" && initial.id && (
              <>
                {sharePointUrl && (
                  <a
                    className="share-btn"
                    href={sharePointUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open the campaign's page on SharePoint"
                  >
                    Open on SharePoint ↗
                  </a>
                )}
                <button
                  type="button"
                  className="share-btn"
                  onClick={() => setGuideOpen(true)}
                  title="Put a page for this campaign on SharePoint. It shows the campaign's timings and milestones, and updates itself every time it's opened. Unsaved edits appear on it once saved."
                >
                  {sharePointUrl ? "Update SharePoint page" : "Put on SharePoint"}
                </button>
              </>
            )}
            <button className="icon-btn" onClick={onCancel} aria-label="Close">
              ✕
            </button>
          </div>
        </header>

        <div className="modal-body">
          <label className="field">
            <span>Campaign name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Digital Documentation launch"
              autoFocus
            />
          </label>

          <label className="soc-check">
            <input
              type="checkbox"
              checked={evergreen}
              onChange={(e) => setEvergreen(e.target.checked)}
            />
            <span>
              Evergreen campaign
              <span className="soc-check-hint">
                Always on, with no start or end. Kept off the calendars and listed
                under every month's campaigns instead.
              </span>
            </span>
          </label>

          <div className="modal-grid">
            {!evergreen && (
              <>
                <label className="field">
                  <span>Start date</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      const next = e.target.value;
                      setStartDate(next);
                      if (next && endDate && endDate < next) setEndDate(next);
                    }}
                  />
                </label>
                <label className="field">
                  <span>End date</span>
                  <input
                    type="date"
                    value={endDate}
                    min={startDate || undefined}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                  {!datesValid && startDate && endDate && (
                    <span className="field-hint warn">End date is before the start.</span>
                  )}
                </label>
              </>
            )}
            <label className="field">
              <span>Brand</span>
              <div className="camp-brand-field">
                <span className="camp-brand-dot" style={{ background: color }} aria-hidden />
                <select value={brand} onChange={(e) => setBrand(e.target.value)}>
                  {BRANDS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                  {brand && !(BRANDS as readonly string[]).includes(brand) && (
                    <option value={brand}>{brand}</option>
                  )}
                </select>
              </div>
              <span className="field-hint">
                Sets the campaign's colour on the timeline and the post calendar.
              </span>
            </label>
            <label className="field">
              <span>Type</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">No type</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.label}>
                    {c.label}
                  </option>
                ))}
                {category && !categories.some((c) => c.label === category) && (
                  <option value={category}>{category} (no longer in the list)</option>
                )}
              </select>
              <span className="field-hint">
                The same types the Social calendar's posts use, so a campaign
                and its posts filter together.
              </span>
            </label>
            <label className="field" style={{ gridColumn: "1 / -1" }}>
              <span>Owner</span>
              <input
                list="camp-owner-options"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="Who's running it"
              />
              <datalist id="camp-owner-options">
                {owners.map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            </label>
          </div>

          <label className="field">
            <span>Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="What the campaign is, who it's for, where it lands"
            />
          </label>

          <div className="asset-field">
            <label className="field">
              <span>Contributing projects</span>
            </label>
            <ProjectPicker
              projects={projects}
              workspaces={workspaces}
              value={projectIds}
              onChange={setProjectIds}
              placeholder="Search projects to link — the EDM, the landing page, the social assets…"
            />
            <div className="soc-project-row">
              <span className="field-hint">
                Every board project doing work for this campaign. Each project's
                window lists the campaigns it belongs to.
              </span>
            </div>
            {onOpenProject && linkedProjects.length > 0 && (
              <div className="camp-linked-open">
                <span className="muted small">Open:</span>
                {linkedProjects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="btn-mini"
                    onClick={() => onOpenProject(p.id)}
                    title="Close this campaign and open the project"
                  >
                    {p.title} ↗
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="modal-section camp-milestones">
            <h3>Milestones</h3>
            <p className="muted small" style={{ margin: "0 0 8px" }}>
              Dated moments inside the campaign. Each shows as a diamond on the
              campaign bar; tick it once it has happened. A social post milestone
              also puts a draft post on the Social calendar on its day.
            </p>
            {milestones.length === 0 ? (
              <p className="muted small">No milestones yet.</p>
            ) : (
              <div className="camp-ms-list">
                {milestones.map((m) => (
                  <div
                    key={m.id}
                    className={`camp-ms-row ${isOutside(m) ? "outside" : ""}`}
                  >
                    <label className="camp-ms-done" title="Done">
                      <input
                        type="checkbox"
                        checked={m.done}
                        onChange={(e) => patchMilestone(m.id, { done: e.target.checked })}
                      />
                    </label>
                    <input
                      type="date"
                      value={m.date}
                      onChange={(e) => patchMilestone(m.id, { date: e.target.value })}
                    />
                    <select
                      value={m.label}
                      onChange={(e) => patchMilestone(m.id, { label: e.target.value })}
                      aria-label="Milestone type"
                    >
                      <option value="" disabled>
                        Choose a type…
                      </option>
                      {milestoneTypes.map((t) => (
                        <option key={t.id} value={t.label}>
                          {t.label}
                        </option>
                      ))}
                      {/* A milestone whose type predates the list, or was
                          since renamed or removed, keeps its own text. */}
                      {m.label &&
                        !milestoneTypes.some((t) => t.label === m.label) && (
                          <option value={m.label}>{m.label}</option>
                        )}
                    </select>
                    {m.socialPostId ? (
                      onOpenSocialPost && (
                        <MilestonePostLink
                          milestone={m}
                          socialPosts={socialPosts ?? []}
                          onOpen={onOpenSocialPost}
                        />
                      )
                    ) : isSocialMilestone(m, milestoneTypes) ? (
                      <span className="field-hint camp-ms-post-hint">
                        Creates a draft social post on save
                      </span>
                    ) : (
                      // Social milestones link to their post; the rest can
                      // carry a link to their asset for the SharePoint page.
                      <input
                        type="url"
                        className="camp-ms-url"
                        value={m.url ?? ""}
                        placeholder="Link (optional)"
                        aria-label={`Link for ${m.label || "this milestone"}`}
                        onChange={(e) => patchMilestone(m.id, { url: e.target.value })}
                      />
                    )}
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => removeMilestone(m.id)}
                    >
                      Remove
                    </button>
                    <input
                      className="camp-ms-desc"
                      value={m.description ?? ""}
                      maxLength={200}
                      placeholder="Short description (optional)"
                      aria-label={`Description for ${m.label || "this milestone"}`}
                      onChange={(e) => patchMilestone(m.id, { description: e.target.value })}
                    />
                  </div>
                ))}
              </div>
            )}
            {outside > 0 && (
              <p className="field-hint warn">
                {outside === 1
                  ? "One milestone falls outside the campaign dates."
                  : `${outside} milestones fall outside the campaign dates.`}{" "}
                That's allowed, but check it's intended.
              </p>
            )}
            <div className="section-actions" style={{ justifyContent: "flex-start" }}>
              <button type="button" className="btn-mini" onClick={addMilestone}>
                + Add milestone
              </button>
            </div>
          </div>

          {error && <p className="login-error">{error}</p>}
        </div>

        <footer className="modal-foot">
          {mode === "edit" && onDelete && (
            confirmingDelete ? (
              <>
                <span className="delete-confirm-prompt">Delete this campaign?</span>
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
          <button onClick={onCancel}>Cancel</button>
          <button className="primary" onClick={submit} disabled={!canSave}>
            {mode === "create" ? "Add campaign" : "Save changes"}
          </button>
        </footer>
      </div>
      {removing && (() => {
        const post = socialPosts?.find((p) => p.id === removing.socialPostId);
        return post ? (
          <MilestonePostDeleteDialog
            milestone={removing}
            post={post}
            onDeletePost={() => confirmRemoval(true)}
            onKeepPost={() => confirmRemoval(false)}
            onCancel={() => setRemoving(null)}
          />
        ) : null;
      })()}
      {guideOpen && (
        <SharePointGuideModal
          fileName={campaignPageFileName(initial.name ?? "")}
          initialUrl={sharePointUrl}
          onDownload={downloadSharePointPage}
          onSave={saveSharePointUrl}
          onCancel={() => setGuideOpen(false)}
        />
      )}
    </div>
  );
}
