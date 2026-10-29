import { useMemo, useState } from "react";
import type {
  Campaign,
  Designer,
  MilestoneType,
  Project,
  SocialCategory,
  SocialPost,
  Workspace,
} from "../../types";
import { brandColor } from "../../constants";
import {
  PHASE_LABEL,
  campaignPhase,
  spanDays,
  type CampaignPhase,
} from "../../campaigns";
import {
  PHASES,
  SEC_BY_KEY,
  STAGE_LABEL,
  STATUS,
  allSeries,
  emptyKit,
  kitName,
  kitOf,
  kitState,
  seriesLabel,
  typeTag,
} from "../../webinarKit";
import { daysUntil, formatShort, shiftIso, todayIso } from "../../dates";
import { Avatar } from "../Avatar";
import { Icon } from "../Icon";
import { LinkifiedText } from "../LinkifiedText";
import { CampaignModal } from "../CampaignModal";
import { MilestonePostLink } from "../MilestonePostLink";
import { ProjectCard } from "../ProjectCard";
import { useKitApi } from "../webinar/kitApi";
import { KitSection } from "../webinar/KitSection";
import { pad } from "../webinar/kitUi";
import { KitActivityTab, KitFilesTab, KitHealthChip, KitManage, KitOverview } from "../webinar/KitOverview";
import { NewWebinarModal } from "../webinar/NewWebinarModal";
import {
  EmptyNote,
  ItemGrid,
  ItemPage,
  KeyValues,
  ReadyCount,
  ReadyWhen,
  SideCard,
  StatusChip,
  type StripCell,
  type WpStatus,
} from "./ItemPage";
import { countdownFor } from "./countdown";

type Props = {
  campaign: Campaign;
  // Every campaign, for series episodes and names already in use.
  campaigns: Campaign[];
  categories: SocialCategory[];
  milestoneTypes: MilestoneType[];
  designers: Designer[];
  projects: Project[];
  workspaces: Workspace[];
  socialPosts: SocialPost[];
  currentDesignerId: string;
  tab: string;
  onTab: (tab: string) => void;
  onBack: () => void;
  onSave: (campaign: Campaign, deletePostIds?: string[]) => void;
  onDelete: () => void;
  // An exact copy of this campaign, opened straight away.
  onDuplicate: () => void;
  onOpenProject: (projectId: string) => void;
  onOpenSocialPost: (postId: string) => void;
  onOpenCampaign: (campaignId: string, tab?: string) => void;
};

const PHASE_CHIP: Record<CampaignPhase, WpStatus> = {
  upcoming: "planning",
  live: "live",
  finished: "complete",
  evergreen: "in-progress",
};

export function CampaignPage(props: Props) {
  const { campaign, designers, currentDesignerId, onSave } = props;
  const stored = kitOf(campaign);
  // The kit the API works on: the stored one, or a fresh one for a Webinar
  // campaign saved before the kit existed (written on the first edit).
  const kit = useMemo(() => stored ?? emptyKit(campaign), [stored, campaign]);
  const save = useMemo(() => (c: Campaign) => onSave(c), [onSave]);
  const api = useKitApi(campaign, kit, designers, currentDesignerId, save);
  if (stored) return <WebinarCampaignPage {...props} api={api} />;
  return <PlainCampaignPage {...props} />;
}

// ── A webinar: the kit's nine sections ──────────────────────────────────

function WebinarCampaignPage({
  campaign,
  campaigns,
  categories,
  milestoneTypes,
  designers,
  projects,
  workspaces,
  socialPosts,
  currentDesignerId,
  tab,
  onTab,
  onBack,
  onSave,
  onDelete,
  onDuplicate,
  onOpenProject,
  onOpenSocialPost,
  onOpenCampaign,
  api,
}: Props & { api: ReturnType<typeof useKitApi> }) {
  const { kit } = api;
  const today = todayIso();
  const st = kitState(kit, today);
  const lead = kit.lead ? designers.find((d) => d.id === kit.lead) : undefined;
  const n = kit.goLive ? daysUntil(kit.goLive) : null;
  const countdown = countdownFor(n, {
    none: "no go-live date",
    before: "days to go-live",
    today: "go-live day",
    after: "days since go-live",
  });
  const [iterating, setIterating] = useState(false);
  const eps = kit.series
    ? campaigns
        .filter((c) => kitOf(c)?.series === kit.series && !kitOf(c)?.archived)
        .sort((a, b) => (kitOf(a)!.ep ?? 99) - (kitOf(b)!.ep ?? 99) || kitName(a).localeCompare(kitName(b)))
    : [];
  const linkedProjects = campaign.projectIds.map((id) => projects.find((p) => p.id === id)).filter((p): p is Project => !!p);
  const sectionTab = SEC_BY_KEY[tab] ? tab : null;
  const here = sectionTab ?? (["details", "milestones", "projects", "files", "activity"].includes(tab) ? tab : "overview");

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "details", label: "Details" },
    { id: "milestones", label: "Milestones", count: campaign.milestones.filter((m) => !m.done).length },
    { id: "projects", label: "Projects", count: linkedProjects.length },
    { id: "files", label: "Files & links", count: kit.files.length },
    { id: "activity", label: "Activity" },
  ];

  const strip: StripCell[] = st.infos.map((i) => ({
    key: i.s.k,
    n: pad(i.s.n),
    label: i.s.short,
    detail: i.due ? (i.late ? `Late · ${formatShort(i.due)}` : formatShort(i.due)) : "No date",
    state: i.st === "done" ? "done" : i.late ? "late" : i.st === "na" ? "na" : i.st === "doing" || i.st === "review" ? "current" : "open",
    active: sectionTab === i.s.k,
    title: `${i.s.title} · ${STATUS[i.st]}${i.due ? ` · due ${formatShort(i.due)}` : ""}${i.late ? " · overdue" : ""}`,
    onClick: () => onTab(i.s.k),
  }));

  const facts = [
    ...(kit.delivery === "prerecorded" ? [{ label: "Recording", value: <b className="mono">{kit.recordDate ? formatShort(kit.recordDate) : "Not set"}</b> }] : []),
    { label: "Go-live", value: <b className="mono">{kit.goLive ? formatShort(kit.goLive) : "Not set"}</b> },
    { label: "Progress", value: <b className="mono">{st.done}/{st.total} sections</b> },
    {
      label: "Lead",
      value: lead ? (
        <span className="item-people">
          <Avatar designer={lead} size={20} /> <span>{lead.name}</span>
        </span>
      ) : (
        "Not set"
      ),
    },
    { label: "Brand", value: campaign.brand || "No brand" },
  ];

  const sub = kit.ft || kit.wt;
  let hint: React.ReactNode = null;
  if (kit.goLive && n !== null && n < 0 && ["proposed", "planning", "production", "promotion"].includes(kit.stage)) {
    hint = (
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => api.setRoot("stage", "post", "Stage")}>
        Go-live has passed · Move to Post-event
      </button>
    );
  } else if (kit.stage === "post" && st.total > 0 && st.done === st.total) {
    hint = (
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => api.setRoot("stage", "complete", "Stage")}>
        Every section is done · Mark complete
      </button>
    );
  }

  return (
    <>
      <ItemPage
        kind="campaign"
        crumbs={[
          { label: "Campaigns", onClick: onBack },
          { label: "Webinars", onClick: onBack },
          { label: kitName(campaign), onClick: here === "overview" ? undefined : () => onTab("overview") },
          ...(here === "overview" ? [] : [{ label: sectionTab ? `${pad(SEC_BY_KEY[sectionTab].n)} · ${SEC_BY_KEY[sectionTab].title}` : tabs.find((t) => t.id === here)?.label ?? here }]),
        ]}
        eyebrow={[kit.series ? seriesLabel(kit, true, eps.length) : null, typeTag(kit), PHASES[kit.phase]].filter(Boolean).join(" · ")}
        title={kitName(campaign)}
        subtitle={
          <>
            {sub && sub !== kitName(campaign) ? sub : null}
            {eps.length > 1 && (
              <nav className="kit-epnav" aria-label="Episodes in this series">
                <span>Episodes</span>
                {eps.map((q) => (
                  <button key={q.id} type="button" aria-current={q.id === campaign.id ? "page" : undefined} title={kitName(q)} onClick={() => onOpenCampaign(q.id, here)}>
                    {kitOf(q)!.ep ? `Ep ${kitOf(q)!.ep}` : kitName(q)}
                  </button>
                ))}
              </nav>
            )}
          </>
        }
        countdown={countdown}
        chips={
          <>
            <span className="item-chip">{STAGE_LABEL[kit.stage]}</span>
            <KitHealthChip st={st} campaign={campaign} />
          </>
        }
        facts={facts}
        actions={
          <>
            {hint}
            {campaign.sharePointUrl && (
              <a className="btn btn-ghost btn-sm" href={campaign.sharePointUrl} target="_blank" rel="noopener noreferrer">
                <Icon name="external-link" size={14} /> Open on SharePoint
              </a>
            )}
            {kit.folder && (
              <a className="btn btn-ghost btn-sm" href={kit.folder} target="_blank" rel="noopener noreferrer">
                <Icon name="folder" size={14} /> Project folder
              </a>
            )}
          </>
        }
        tabs={tabs}
        tab={here}
        onTab={onTab}
        strip={strip}
        stripLabel="Kit sections"
      >
        {sectionTab ? (
          <KitSection sectionKey={sectionTab} api={api} />
        ) : here === "details" ? (
          <CampaignModal
            inline
            key={campaign.id}
            mode="edit"
            initial={campaign}
            categories={categories}
            milestoneTypes={milestoneTypes}
            designers={designers}
            projects={projects}
            workspaces={workspaces}
            socialPosts={socialPosts}
            onOpenProject={onOpenProject}
            onOpenSocialPost={onOpenSocialPost}
            onCancel={onBack}
            onSave={(c, deletePostIds) => onSave({ ...c, webinar: campaign.webinar }, deletePostIds)}
            onDelete={onDelete}
          />
        ) : here === "milestones" ? (
          <MilestonesTab campaign={campaign} socialPosts={socialPosts} onSave={onSave} onOpenSocialPost={onOpenSocialPost} onTab={onTab} />
        ) : here === "projects" ? (
          <ProjectsTab campaign={campaign} linkedProjects={linkedProjects} designers={designers} workspaces={workspaces} onOpenProject={onOpenProject} onTab={onTab} />
        ) : here === "files" ? (
          <KitFilesTab api={api} />
        ) : here === "activity" ? (
          <KitActivityTab api={api} />
        ) : (
          <KitOverview api={api} onSection={onTab} onTab={onTab} manage={<KitManage api={api} onDelete={onDelete} onDuplicate={() => setIterating(true)} onCopy={onDuplicate} />} />
        )}
      </ItemPage>
      {iterating && (
        <NewWebinarModal
          designers={designers}
          currentDesignerId={currentDesignerId}
          series={allSeries(campaigns)}
          preset={{
            name: `${kitName(campaign)} · iteration 2`,
            type: kit.type,
            delivery: kit.delivery,
            phase: "optimize",
            series: kit.series,
            ep: kit.ep ? kit.ep + 1 : undefined,
            wt: kit.wt,
            lead: kit.lead,
            from: campaign,
          }}
          onCancel={() => setIterating(false)}
          onCreate={(c) => {
            onSave(c);
            setIterating(false);
            onOpenCampaign(c.id, "overview");
          }}
        />
      )}
    </>
  );
}

// ── An ordinary campaign ────────────────────────────────────────────────

function PlainCampaignPage({
  campaign,
  categories,
  milestoneTypes,
  designers,
  projects,
  workspaces,
  socialPosts,
  tab,
  onTab,
  onBack,
  onSave,
  onDelete,
  onDuplicate,
  onOpenProject,
  onOpenSocialPost,
}: Props) {
  const today = todayIso();
  const phase = campaignPhase(campaign, today);
  const color = campaign.color || brandColor(campaign.brand || "No brand");
  const owner = campaign.ownerId ? designers.find((d) => d.id === campaign.ownerId) : undefined;
  const ownerName = owner?.name ?? campaign.owner;
  const milestones = campaign.milestones.slice().sort((a, b) => a.date.localeCompare(b.date));
  const done = milestones.filter((m) => m.done).length;
  const open = milestones.filter((m) => !m.done);
  const overdue = open.filter((m) => m.date < today);
  const linkedProjects = campaign.projectIds.map((id) => projects.find((p) => p.id === id)).filter((p): p is Project => !!p);

  const countdown =
    phase === "evergreen"
      ? { value: "Always on", label: `since ${formatShort(campaign.startDate)}` }
      : phase === "upcoming"
        ? countdownFor(daysUntil(campaign.startDate), { none: "no start date", before: "days to launch", today: "launches today", after: "days since launch" })
        : phase === "live"
          ? { value: "Live", label: `${daysUntil(campaign.endDate) ?? 0} days left` }
          : countdownFor(daysUntil(campaign.endDate), { none: "no end date", before: "days to the end", today: "ends today", after: "days since it ended" });

  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function toggleMilestone(id: string) {
    onSave({ ...campaign, milestones: campaign.milestones.map((m) => (m.id === id ? { ...m, done: !m.done } : m)) });
  }

  const reqs: [string, boolean][] = [
    ["Named", !!campaign.name.trim()],
    ["Owner picked", !!(campaign.ownerId || campaign.owner.trim())],
    ["Dates set", !!campaign.startDate && (!!campaign.evergreen || !!campaign.endDate)],
    ["Described", !!campaign.description.trim()],
    ["Milestones planned", milestones.length > 0],
    ["Projects linked", campaign.projectIds.length > 0],
    ["Every milestone done", milestones.length > 0 && done === milestones.length],
  ];

  const strip: StripCell[] = milestones.map((m, i) => {
    const late = !m.done && m.date < today;
    return {
      key: m.id,
      n: String(i + 1).padStart(2, "0"),
      label: m.label,
      detail: late ? `Late · ${formatShort(m.date)}` : m.date === today ? "Today" : formatShort(m.date),
      state: m.done ? "done" : late ? "late" : m.date === today ? "current" : "open",
      title: `${m.label} · ${formatShort(m.date)}${m.done ? " · done" : late ? " · overdue" : ""}`,
      onClick: () => onTab("milestones"),
    };
  });

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "details", label: "Details" },
    { id: "milestones", label: "Milestones", count: open.length },
    { id: "projects", label: "Projects", count: linkedProjects.length },
  ];

  const facts = [
    { label: "Start", value: <b className="mono">{formatShort(campaign.startDate)}</b> },
    { label: "End", value: campaign.evergreen ? "No end" : <b className="mono">{formatShort(campaign.endDate)}</b> },
    { label: "Milestones", value: <b className="mono">{done}/{milestones.length}</b> },
    {
      label: "Owner",
      value: owner ? (
        <span className="item-people">
          <Avatar designer={owner} size={20} /> <span>{owner.name}</span>
        </span>
      ) : (
        ownerName || "Not set"
      ),
    },
    { label: "Projects", value: <b className="mono">{linkedProjects.length}</b> },
  ];

  const categoryMeta = categories.find((c) => c.label === campaign.category);

  return (
    <ItemPage
      kind="campaign"
      crumbs={[
        { label: "Campaigns", onClick: onBack },
        { label: campaign.name || "Untitled campaign", onClick: tab === "overview" ? undefined : () => onTab("overview") },
        ...(tab === "overview" ? [] : [{ label: tabs.find((t) => t.id === tab)?.label ?? tab }]),
      ]}
      eyebrow={[campaign.brand || "No brand", campaign.category || "No type", PHASE_LABEL[phase]].join(" · ")}
      title={campaign.name || "Untitled campaign"}
      countdown={countdown}
      chips={
        <>
          <StatusChip status={PHASE_CHIP[phase]}>{PHASE_LABEL[phase]}</StatusChip>
          {categoryMeta && (
            <span className="item-chip" style={{ background: categoryMeta.color, color: "#fff" }}>
              {categoryMeta.short}
            </span>
          )}
          {overdue.length > 0 && (
            <StatusChip status="blocked">
              {overdue.length} overdue milestone{overdue.length === 1 ? "" : "s"}
            </StatusChip>
          )}
        </>
      }
      facts={facts}
      actions={
        campaign.sharePointUrl ? (
          <a className="btn btn-ghost btn-sm" href={campaign.sharePointUrl} target="_blank" rel="noopener noreferrer">
            <Icon name="external-link" size={14} /> Open on SharePoint
          </a>
        ) : (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onTab("details")}>
            <Icon name="browser" size={14} /> Put on SharePoint
          </button>
        )
      }
      tabs={tabs}
      tab={tab}
      onTab={onTab}
      strip={strip}
      stripLabel="Milestones"
    >
      {tab === "details" ? (
        <CampaignModal
          inline
          key={campaign.id}
          mode="edit"
          initial={campaign}
          categories={categories}
          milestoneTypes={milestoneTypes}
          designers={designers}
          projects={projects}
          workspaces={workspaces}
          socialPosts={socialPosts}
          onOpenProject={onOpenProject}
          onOpenSocialPost={onOpenSocialPost}
          onCancel={onBack}
          onSave={(c, deletePostIds) => onSave(c, deletePostIds)}
          onDelete={onDelete}
        />
      ) : tab === "milestones" ? (
        <MilestonesTab campaign={campaign} socialPosts={socialPosts} onSave={onSave} onOpenSocialPost={onOpenSocialPost} onTab={onTab} />
      ) : tab === "projects" ? (
        <ProjectsTab campaign={campaign} linkedProjects={linkedProjects} designers={designers} workspaces={workspaces} onOpenProject={onOpenProject} onTab={onTab} />
      ) : (
        <ItemGrid
          main={
            <>
              <SideCard title="Up next" aside={<span className="item-hint">{open.length} open</span>}>
                {open.length === 0 ? (
                  <EmptyNote>{milestones.length ? "Every milestone is done." : "No milestones yet. Add them on the Details tab."}</EmptyNote>
                ) : (
                  <ul className="item-milestones compact">
                    {open.slice(0, 5).map((m) => {
                      const late = m.date < today;
                      return (
                        <li key={m.id} className={late ? "late" : ""}>
                          <button type="button" className="item-tick" aria-pressed={false} aria-label={`${m.label}: not done`} onClick={() => toggleMilestone(m.id)} />
                          <span className="item-ms-date mono">{formatShort(m.date)}</span>
                          <span className="item-ms-main">
                            <b>{m.label}</b>
                            <span className="item-hint">{late ? `${-daysUntil(m.date)!} days overdue` : m.date === today ? "Today" : `in ${daysUntil(m.date)} days`}</span>
                          </span>
                          <MilestonePostLink milestone={m} socialPosts={socialPosts} onOpen={onOpenSocialPost} />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </SideCard>
              <SideCard title="Schedule">
                <Timeline campaign={campaign} today={today} color={color} />
              </SideCard>
              <SideCard
                title="About"
                aside={
                  <button type="button" className="link-btn" onClick={() => onTab("details")}>
                    Edit
                  </button>
                }
              >
                {campaign.description.trim() ? (
                  <div className="item-prose">
                    <LinkifiedText text={campaign.description} designers={designers} />
                  </div>
                ) : (
                  <EmptyNote>No description yet. Say what the campaign is for on the Details tab.</EmptyNote>
                )}
              </SideCard>
            </>
          }
          sideTop={
            <>
              <SideCard title="Status & schedule">
                <KeyValues
                  rows={[
                    { label: "Phase", value: <StatusChip status={PHASE_CHIP[phase]}>{PHASE_LABEL[phase]}</StatusChip> },
                    {
                      label: "Runs",
                      value: campaign.evergreen
                        ? `From ${formatShort(campaign.startDate)} · always on`
                        : `${formatShort(campaign.startDate)} – ${formatShort(campaign.endDate)} · ${spanDays(campaign)} days`,
                    },
                    {
                      label: "Brand",
                      value: (
                        <span className="item-person">
                          <span className="item-swatch" style={{ background: color }} /> {campaign.brand || "No brand"}
                        </span>
                      ),
                    },
                    { label: "Type", value: campaign.category || <span className="item-hint">Not set</span> },
                    {
                      label: "Owner",
                      value: owner ? (
                        <span className="item-person">
                          <Avatar designer={owner} size={20} /> {owner.name}
                        </span>
                      ) : (
                        ownerName || <span className="item-hint">Not set</span>
                      ),
                    },
                  ]}
                />
              </SideCard>
              <SideCard title="Ready when" aside={<ReadyCount reqs={reqs} />}>
                <ReadyWhen reqs={reqs} />
              </SideCard>
            </>
          }
          sideBottom={
            <>
              <SideCard title="Links">
                <ul className="item-flist">
                  {campaign.sharePointUrl && (
                    <li>
                      <Icon name="browser" size={16} />
                      <a href={campaign.sharePointUrl} target="_blank" rel="noopener noreferrer">
                        Campaign page on SharePoint
                      </a>
                    </li>
                  )}
                  {linkedProjects.map((p) => (
                    <li key={p.id}>
                      <Icon name="folder" size={16} />
                      <button type="button" className="link-btn" onClick={() => onOpenProject(p.id)}>
                        {p.title}
                      </button>
                    </li>
                  ))}
                  {milestones
                    .filter((m) => m.url)
                    .map((m) => (
                      <li key={m.id}>
                        <Icon name="link" size={16} />
                        <a href={m.url} target="_blank" rel="noopener noreferrer">
                          {m.label}
                        </a>
                      </li>
                    ))}
                  {!campaign.sharePointUrl && linkedProjects.length === 0 && !milestones.some((m) => m.url) && <li className="item-hint">Nothing linked yet.</li>}
                </ul>
              </SideCard>
              <SideCard title="Manage">
                <div className="item-manage">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={onDuplicate} title='An exact copy of this campaign, with "(copy)" after its name'>
                    Duplicate campaign
                  </button>
                  {campaign.category !== "Webinar" && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      title="Switch the type to Webinar and work it through the 2026 webinar kit"
                      onClick={() => onSave({ ...campaign, category: "Webinar" })}
                    >
                      Work as a webinar
                    </button>
                  )}
                  {confirmingDelete ? (
                    <>
                      <span className="item-hint">Delete this campaign?</span>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmingDelete(false)}>
                        Keep
                      </button>
                      <button type="button" className="btn btn-danger btn-sm" onClick={onDelete}>
                        Yes, delete
                      </button>
                    </>
                  ) : (
                    <button type="button" className="btn btn-danger-ghost btn-sm" onClick={() => setConfirmingDelete(true)}>
                      Delete campaign
                    </button>
                  )}
                </div>
              </SideCard>
            </>
          }
        />
      )}
    </ItemPage>
  );
}

// ── Shared tabs ─────────────────────────────────────────────────────────

function MilestonesTab({
  campaign,
  socialPosts,
  onSave,
  onOpenSocialPost,
  onTab,
}: {
  campaign: Campaign;
  socialPosts: SocialPost[];
  onSave: Props["onSave"];
  onOpenSocialPost: (id: string) => void;
  onTab: (tab: string) => void;
}) {
  const today = todayIso();
  const milestones = campaign.milestones.slice().sort((a, b) => a.date.localeCompare(b.date));
  function toggle(id: string) {
    onSave({ ...campaign, milestones: campaign.milestones.map((m) => (m.id === id ? { ...m, done: !m.done } : m)) });
  }
  return (
    <ItemGrid
      main={
        <SideCard
          title="Milestones"
          aside={
            <button type="button" className="link-btn" onClick={() => onTab("details")}>
              Add or edit
            </button>
          }
        >
          {milestones.length === 0 ? (
            <EmptyNote>No milestones yet. Add the dated moments of this campaign on the Details tab.</EmptyNote>
          ) : (
            <ul className="item-milestones">
              {milestones.map((m) => {
                const late = !m.done && m.date < today;
                return (
                  <li key={m.id} className={m.done ? "done" : late ? "late" : ""}>
                    <button type="button" className="item-tick" aria-pressed={m.done} aria-label={`${m.label}: ${m.done ? "done" : "not done"}`} onClick={() => toggle(m.id)}>
                      {m.done && <Icon name="checkmark" size={12} />}
                    </button>
                    <span className="item-ms-date mono">{formatShort(m.date)}</span>
                    <span className="item-ms-main">
                      <b>{m.label}</b>
                      {m.description && <span className="item-hint">{m.description}</span>}
                      <span className="item-ms-links">
                        {m.url && (
                          <a href={m.url} target="_blank" rel="noopener noreferrer">
                            Open ↗
                          </a>
                        )}
                        <MilestonePostLink milestone={m} socialPosts={socialPosts} onOpen={onOpenSocialPost} />
                      </span>
                    </span>
                    <span className="item-ms-state">
                      {m.done ? (
                        <StatusChip status="complete">Done</StatusChip>
                      ) : late ? (
                        <StatusChip status="blocked">Overdue</StatusChip>
                      ) : m.date === today ? (
                        <StatusChip status="live">Today</StatusChip>
                      ) : (
                        <StatusChip status="scheduled">Planned</StatusChip>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </SideCard>
      }
    />
  );
}

function ProjectsTab({
  campaign,
  linkedProjects,
  designers,
  workspaces,
  onOpenProject,
  onTab,
}: {
  campaign: Campaign;
  linkedProjects: Project[];
  designers: Designer[];
  workspaces: Workspace[];
  onOpenProject: (id: string) => void;
  onTab: (tab: string) => void;
}) {
  return (
    <ItemGrid
      main={
        <SideCard
          title="Projects"
          aside={
            <button type="button" className="link-btn" onClick={() => onTab("details")}>
              Link projects
            </button>
          }
        >
          {linkedProjects.length === 0 ? (
            <EmptyNote>No board projects linked yet. Link the EDM, the landing page and the social assets on the Details tab.</EmptyNote>
          ) : (
            <div className="workspace-grid item-project-grid">
              {linkedProjects.map((p) => (
                <ProjectCard key={p.id} project={p} designers={designers} campaigns={[campaign]} onClick={() => onOpenProject(p.id)} teamBadge={workspaces.find((w) => w.id === p.workspaceId)?.name} />
              ))}
            </div>
          )}
        </SideCard>
      }
    />
  );
}

// The campaign as a bar with its milestones along it and a line for today:
// the timeline motif from the logo, with the one Cobalt highlight on the
// bar itself. An evergreen campaign shows its first three months.
function Timeline({ campaign, today, color }: { campaign: Campaign; today: string; color: string }) {
  if (!campaign.startDate) return <EmptyNote>Set a start date to see the schedule.</EmptyNote>;
  const start = campaign.startDate;
  const end = campaign.evergreen || !campaign.endDate ? shiftIso(start, 90) : campaign.endDate;
  const dates = [start, end, today, ...campaign.milestones.map((m) => m.date)].filter(Boolean).sort();
  const lo = shiftIso(dates[0], -3);
  const hi = shiftIso(dates[dates.length - 1], 3);
  const span = Math.max(1, daysBetween(lo, hi));
  const pos = (iso: string) => `${Math.max(0, Math.min(100, (daysBetween(lo, iso) / span) * 100))}%`;
  const width = `${Math.max(1, (daysBetween(start, end) / span) * 100)}%`;
  const months: string[] = [];
  for (let m = lo.slice(0, 7); m <= hi.slice(0, 7); m = nextMonth(m)) months.push(m);
  return (
    <div className="item-timeline" aria-label="Campaign schedule">
      <div className="item-tl-months">
        {months.map((m) => {
          const first = `${m}-01`;
          if (first < lo || first > hi) return null;
          return (
            <span key={m} className="item-tl-month mono" style={{ left: pos(first) }}>
              {new Date(`${first}T00:00:00`).toLocaleDateString(undefined, { month: "short" }).toUpperCase()}
            </span>
          );
        })}
      </div>
      <div className="item-tl-track">
        <span className="item-tl-bar" style={{ left: pos(start), width, background: color }} title={campaign.evergreen ? `From ${formatShort(start)} · always on` : `${formatShort(start)} – ${formatShort(end)}`}>
          {campaign.evergreen && <span className="item-tl-fade" aria-hidden="true" />}
        </span>
        {campaign.milestones.map((m) => (
          <span
            key={m.id}
            className={`item-tl-ms ${m.done ? "done" : m.date < today ? "late" : ""}`}
            style={{ left: pos(m.date) }}
            title={`${m.label} · ${formatShort(m.date)}${m.done ? " · done" : m.date < today ? " · overdue" : ""}`}
            tabIndex={0}
            aria-label={`${m.label}, ${formatShort(m.date)}`}
          />
        ))}
        {today >= lo && today <= hi && <span className="item-tl-today" style={{ left: pos(today) }} title="Today" />}
      </div>
      <div className="item-tl-legend">
        <span>
          <i className="item-tl-key bar" style={{ background: color }} /> Campaign
        </span>
        <span>
          <i className="item-tl-key ms" /> Milestone
        </span>
        <span>
          <i className="item-tl-key today" /> Today
        </span>
      </div>
    </div>
  );
}

function daysBetween(a: string, b: string): number {
  const x = new Date(`${a}T00:00:00`).getTime();
  const y = new Date(`${b}T00:00:00`).getTime();
  return Math.round((y - x) / 86400000);
}

function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

