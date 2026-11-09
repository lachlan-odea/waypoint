import { useEffect, useState } from "react";
import type {
  BigRock,
  Campaign,
  CampaignMilestone,
  Designer,
  MilestoneType,
  Project,
  SocialCategory,
  SocialPost,
  Workspace,
} from "../types";
import { cleanMilestones } from "../campaigns";
import { CampaignMilestonesEditor } from "./CampaignMilestonesEditor";
import { BRANDS, brandColor, brandForChannel } from "../constants";
import { formatShort, shiftIso, todayIso } from "../dates";
import { ActivityPortalLink } from "./ActivityPortalLink";
import { ProjectPicker } from "./ProjectPicker";
import { AssigneePicker } from "./AssigneePicker";
import { BigRockPicker } from "./BigRockPicker";
import { Icon } from "./Icon";

type Props = {
  initial: Partial<Campaign>;
  mode: "create" | "edit";
  // The Social calendar's category list; campaigns use the same types.
  categories: SocialCategory[];
  // The milestone type picker's options (Settings → Types & tags).
  milestoneTypes: MilestoneType[];
  // The team, for the owner picker. The owner works like a project's
  // assignees: the campaign and its milestones show on their My Desk.
  designers: Designer[];
  // Board projects that can be linked as contributing to the campaign.
  projects: Project[];
  workspaces: Workspace[];
  // The Big Rocks on offer for the campaign to serve.
  bigRocks: BigRock[];
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
  // Render as the Details tab of the campaign's page: no overlay, no close
  // button, no Escape, no Cancel. Save and Delete work as before.
  inline?: boolean;
};

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function CampaignModal({
  initial,
  mode,
  categories,
  milestoneTypes,
  designers,
  projects,
  workspaces,
  bigRocks,
  onCancel,
  onSave,
  onDelete,
  onOpenProject,
  socialPosts,
  onOpenSocialPost,
  inline = false,
}: Props) {
  const [name, setName] = useState(initial.name ?? "");
  const [category, setCategory] = useState(initial.category ?? "");
  // Brand drives the colour. A campaign saved before brands existed opens
  // with the brand its old channel implied; a brand-new one starts on the
  // first brand in the list.
  const [brand, setBrand] = useState(
    initial.brand || (initial.channel ? brandForChannel(initial.channel) : BRANDS[0]),
  );
  // The owner is picked from the team. A campaign saved before that, with
  // a typed-in name, opens with whoever on the team has that name; failing
  // that, the old name is kept until someone is picked.
  const legacyOwner = initial.ownerId ? "" : (initial.owner ?? "").trim();
  const [ownerId, setOwnerId] = useState(
    initial.ownerId ??
      (legacyOwner ? designers.find((d) => d.name.trim() === legacyOwner)?.id : undefined) ??
      "",
  );
  const [evergreen, setEvergreen] = useState(!!initial.evergreen);
  const [startDate, setStartDate] = useState(initial.startDate || todayIso());
  // An evergreen campaign is stored without an end, so one being switched
  // back to dated gets a fortnight to start from.
  const [endDate, setEndDate] = useState(
    initial.endDate || shiftIso(initial.startDate || todayIso(), 13),
  );
  const [description, setDescription] = useState(initial.description ?? "");
  const [projectIds, setProjectIds] = useState<string[]>(initial.projectIds ?? []);
  const [bigRockIds, setBigRockIds] = useState<string[]>(initial.bigRockIds ?? []);
  const [milestones, setMilestones] = useState<CampaignMilestone[]>(() =>
    (initial.milestones ?? []).map((m) => ({ ...m })),
  );
  // Posts to delete when the campaign is saved. Held until then so that
  // cancelling the editor leaves both the milestone and its post alone.
  const [deletePostIds, setDeletePostIds] = useState<string[]>([]);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // The milestone editor's "delete the post too?" prompt is open.
  const [prompting, setPrompting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (inline) return;
    function onKey(e: KeyboardEvent) {
      // The milestone editor's "delete the post too?" prompt handles its
      // own Escape.
      if (e.key === "Escape" && !prompting) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, prompting, inline]);

  // Every campaign needs a start; only a dated one needs an end after it.
  const datesValid =
    !!startDate && (evergreen || (!!endDate && endDate >= startDate));
  const canSave = name.trim().length > 0 && datesValid;
  const color = brandColor(brand);

  // The owner's display name, for the SharePoint page, the CSV and older
  // readers of the campaign.
  function ownerNameFor(id: string): string {
    const d = designers.find((x) => x.id === id);
    if (d) return d.name;
    // Nobody picked: keep a name typed in before owners came from the team.
    if (!id) return legacyOwner;
    // Someone picked who has since left the team: keep their saved name.
    return id === initial.ownerId ? (initial.owner ?? "") : "";
  }

  // ── save ─────────────────────────────────────────────────────────────

  function submit() {
    if (!canSave) return;
    const cleaned = cleanMilestones(milestones);
    if (!cleaned.ok) {
      setError(cleaned.error);
      return;
    }
    const campaign: Campaign = {
      id: initial.id ?? newId("camp"),
      name: name.trim(),
      // Legacy field, carried through untouched if it was ever set.
      channel: initial.channel,
      category: category || undefined,
      brand,
      owner: ownerNameFor(ownerId),
      ownerId: ownerId || undefined,
      description: description.trimEnd(),
      startDate,
      // An evergreen campaign runs on from its start, so it has no end.
      endDate: evergreen ? "" : endDate,
      // Left off rather than stored as false, like the other optional fields.
      evergreen: evergreen || undefined,
      color,
      milestones: cleaned.milestones,
      projectIds,
      bigRockIds: bigRockIds.length ? bigRockIds : undefined,
      // Kept from before the activity portal, so a campaign page already
      // on SharePoint carries on refreshing.
      shareToken: initial.shareToken,
      sharePointUrl: initial.sharePointUrl,
      createdAt: initial.createdAt ?? new Date().toISOString(),
    };
    onSave(campaign, deletePostIds);
  }

  const linkedProjects = projectIds
    .map((id) => projects.find((p) => p.id === id))
    .filter((p): p is Project => !!p);

  const editor = (
      <div className={inline ? "modal item-editor" : "modal"} onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2 className="modal-title-static">
              {inline ? "Campaign details" : mode === "create" ? "New campaign" : "Edit campaign"}
            </h2>
            {datesValid && (
              <div className="modal-sub">
                <span className="camp-brand-dot" style={{ background: color }} />
                {brand} ·{" "}
                {evergreen
                  ? `Evergreen · from ${formatShort(startDate)}`
                  : `${formatShort(startDate)} – ${formatShort(endDate)}`}
              </div>
            )}
          </div>
          <div className="modal-head-actions">
            {mode === "edit" && <ActivityPortalLink kind="campaign" id={initial.id} className="share-btn" />}
            {!inline && (
              <button className="icon-btn" onClick={onCancel} aria-label="Close">
                <Icon name="close" size={16} />
              </button>
            )}
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
                Always on from its start date, with no end. Drawn on the calendars
                from that day on and listed under every month after it.
              </span>
            </span>
          </label>

          <div className="modal-grid">
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
              {evergreen ? (
                <span className="field-hint">
                  The day it goes always-on. It's drawn on the calendars from here.
                </span>
              ) : (
                !startDate && <span className="field-hint warn">Every campaign needs a start.</span>
              )}
            </label>
            {!evergreen && (
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
                {!endDate && (
                  <span className="field-hint">
                    No end in sight? Tick Evergreen above instead.
                  </span>
                )}
              </label>
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
            <div className="asset-field" style={{ gridColumn: "1 / -1" }}>
              <label className="field">
                <span>Owner</span>
              </label>
              <AssigneePicker
                designers={designers}
                assigneeIds={ownerId ? [ownerId] : []}
                // One owner at a time: picking someone else replaces them.
                onChange={(ids) => setOwnerId(ids[ids.length - 1] ?? "")}
                placeholder="Who's running it"
              />
              <span className="field-hint">
                Works like a project's assignees: the campaign and its milestones
                show on the owner's My Desk.
                {legacyOwner && !ownerId
                  ? ` Saved as “${legacyOwner}”, who isn't on the team list — pick someone to take it over.`
                  : ""}
              </span>
            </div>
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
                    {p.title} <Icon name="external-link" size={12} />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="asset-field">
            <label className="field">
              <span>Big Rocks</span>
            </label>
            <BigRockPicker rocks={bigRocks} value={bigRockIds} onChange={setBigRockIds} />
            <span className="field-hint">
              Which of the team's Big Rocks this campaign serves. Its contributing
              projects, its milestones' posts and its events count towards them on
              the Big Rocks page.
            </span>
          </div>

          <div className="modal-section camp-milestones">
            <h3>Milestones</h3>
            <p className="muted small" style={{ margin: "0 0 8px" }}>
              Dated moments inside the campaign. Each shows as a diamond on the
              campaign bar; tick it once it has happened. A social post milestone
              also puts a draft post on the Social calendar on its day.
            </p>
            <CampaignMilestonesEditor
              milestones={milestones}
              onChange={setMilestones}
              milestoneTypes={milestoneTypes}
              startDate={startDate}
              endDate={endDate}
              evergreen={evergreen}
              socialPosts={socialPosts}
              onOpenSocialPost={onOpenSocialPost}
              onDeletePost={(postId) => setDeletePostIds((cur) => [...cur, postId])}
              onPrompting={setPrompting}
            />
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
          {!inline && <button onClick={onCancel}>Cancel</button>}
          <button className="primary" onClick={submit} disabled={!canSave}>
            {mode === "create" ? "Add campaign" : "Save changes"}
          </button>
        </footer>
      </div>
  );
  return (
    <div className={inline ? "item-editor-wrap" : "modal-overlay"}>
      {editor}
    </div>
  );
}
