import { useMemo, useState } from "react";
import type { BigRock, Campaign, Designer, EventStatus, MajorEventKit, MarketingEvent, Project, Workspace } from "../../types";
import { eventPhase, eventStatusMeta, fiscalYear, formatEventDates } from "../../events";
import { MAJOR_EVENT_LABEL, majorRoot, setMajorRoot, withMajorKit } from "../../majorEvent";
import { MAJOR_DEF } from "../../majorEventKit";
import { STATUS, kitState, num } from "../../webinarKit";
import { formatShort, todayIso } from "../../dates";
import { Avatar } from "../Avatar";
import { Icon } from "../Icon";
import { ActivityPortalLink } from "../ActivityPortalLink";
import { EventModal } from "../EventModal";
import { ProjectCard } from "../ProjectCard";
import { EmptyNote, ItemGrid, ItemPage, SideCard, StatusChip, type StripCell, type WpStatus } from "../pages/ItemPage";
import { eventCountdown } from "../pages/countdown";
import { useKitCore, type KitHost } from "../webinar/kitApi";
import { KitSection } from "../webinar/KitSection";
import { KitActivityTab, KitFilesTab, KitOverview } from "../webinar/KitOverview";
import { pad } from "../webinar/kitUi";

// A WiseTech Global Major Event's page: the Major Event Workflow's twelve
// sections across the strip, each opening to its tasks, and the same
// Overview, Files and Activity a webinar has. The event's own details
// (division, linked projects and campaign, Big Rocks, spend) stay on the
// Details tab, in the editor every event uses.

type Props = {
  event: MarketingEvent;
  kit: MajorEventKit;
  events: MarketingEvent[];
  campaigns: Campaign[];
  designers: Designer[];
  projects: Project[];
  workspaces: Workspace[];
  bigRocks: BigRock[];
  currentDesignerId: string;
  tab: string;
  onTab: (tab: string) => void;
  onBack: () => void;
  onSave: (event: MarketingEvent) => void;
  onDelete: () => void;
  onOpenProject: (projectId: string) => void;
  onOpenCampaign: (campaignId: string) => void;
};

const STATUS_CHIP: Record<EventStatus, WpStatus> = {
  prospect: "draft",
  planning: "planning",
  confirmed: "scheduled",
  live: "live",
  done: "complete",
  cancelled: "blocked",
};

const OWN_TABS = ["details", "projects", "files", "activity"];

export function MajorEventPage({
  event,
  kit,
  events,
  campaigns,
  designers,
  projects,
  workspaces,
  bigRocks,
  currentDesignerId,
  tab,
  onTab,
  onBack,
  onSave,
  onDelete,
  onOpenProject,
  onOpenCampaign,
}: Props) {
  const host = useMemo<KitHost>(
    () => ({
      id: event.id,
      commit: (k) => onSave(withMajorKit(event, k)),
      root: majorRoot(event, kit),
      setRoot: (k, key, value) => onSave(setMajorRoot(event, k, key, value)),
      rename: (k, name) => onSave(withMajorKit({ ...event, name }, k)),
    }),
    [event, kit, onSave],
  );
  const api = useKitCore(MAJOR_DEF, kit, host, designers, currentDesignerId);

  const today = todayIso();
  const st = kitState(kit, today, MAJOR_DEF);
  const phase = eventPhase(event, today);
  const lead = kit.lead ? designers.find((d) => d.id === kit.lead) : undefined;
  const linkedProjects = event.projectIds.map((id) => projects.find((p) => p.id === id)).filter((p): p is Project => !!p);
  const sectionTab = MAJOR_DEF.secByKey[tab] ? tab : null;
  const here = sectionTab ?? (OWN_TABS.includes(tab) ? tab : "overview");
  const name = event.name || "Untitled major event";
  const guests = num(kit.values.brief?.tInPerson);

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "details", label: "Details" },
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
    { label: "Dates", value: <b className="mono">{formatEventDates(event)}</b> },
    { label: "Venue", value: event.location?.trim() || "Not set" },
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
    { label: "In-person guests", value: guests ? <b className="mono">{guests.toLocaleString()}</b> : "Not set" },
  ];

  // An event that is off or over isn't "at risk": its status says it all.
  const showHealth = phase !== "cancelled" && phase !== "done" && !kit.archived && st.health;

  return (
    <ItemPage
      kind="event"
      crumbs={[
        { label: "Events", onClick: onBack },
        { label: name, onClick: here === "overview" ? undefined : () => onTab("overview") },
        ...(here === "overview"
          ? []
          : [{ label: sectionTab ? `${pad(MAJOR_DEF.secByKey[sectionTab].n)} · ${MAJOR_DEF.secByKey[sectionTab].title}` : (tabs.find((t) => t.id === here)?.label ?? here) }]),
      ]}
      eyebrow={[MAJOR_EVENT_LABEL, event.region, event.startDate ? fiscalYear(event.startDate) : String(event.year)].filter(Boolean).join(" · ")}
      title={name}
      subtitle={event.location?.trim() || undefined}
      countdown={eventCountdown(event, phase)}
      chips={
        <>
          <StatusChip status={STATUS_CHIP[phase]}>{eventStatusMeta(phase).label}</StatusChip>
          {kit.archived && <span className="kit-chip line">Archived</span>}
          {showHealth && (
            <StatusChip status={showHealth.k === "bad" ? "blocked" : showHealth.k === "warn" ? "scheduled" : "live"}>{showHealth.label}</StatusChip>
          )}
        </>
      }
      facts={facts}
      actions={
        <>
          <ActivityPortalLink kind="event" id={event.id} />
          {kit.tracker && (
            <a className="btn btn-ghost btn-sm" href={kit.tracker} target="_blank" rel="noopener noreferrer">
              <Icon name="external-link" size={14} /> Task tracker
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
      stripLabel="Workflow sections"
    >
      {sectionTab ? (
        <KitSection sectionKey={sectionTab} api={api} />
      ) : here === "details" ? (
        <EventModal
          inline
          key={event.id}
          mode="edit"
          initial={event}
          events={events}
          campaigns={campaigns}
          designers={designers}
          projects={projects}
          workspaces={workspaces}
          bigRocks={bigRocks}
          onOpenProject={onOpenProject}
          onOpenCampaign={onOpenCampaign}
          onCancel={onBack}
          // The editor builds the event from its own fields, so the kit is
          // put back on, with the dates it may just have changed.
          onSave={(e) => onSave(withMajorKit(e, kit))}
          onDelete={onDelete}
        />
      ) : here === "projects" ? (
        <ItemGrid
          main={
            <SideCard
              title="Projects for this event"
              aside={
                <button type="button" className="link-btn" onClick={() => onTab("details")}>
                  Link projects
                </button>
              }
            >
              {linkedProjects.length ? (
                <div className="workspace-grid item-project-grid">
                  {linkedProjects.map((p) => (
                    <ProjectCard
                      key={p.id}
                      project={p}
                      designers={designers}
                      onClick={() => onOpenProject(p.id)}
                      teamBadge={workspaces.find((w) => w.id === p.workspaceId)?.name}
                      compact
                    />
                  ))}
                </div>
              ) : (
                <EmptyNote>No projects linked yet. Link the board projects producing work for the event (the stage design, the signage, the EDMs) on the Details tab.</EmptyNote>
              )}
            </SideCard>
          }
        />
      ) : here === "files" ? (
        <KitFilesTab api={api} />
      ) : here === "activity" ? (
        <KitActivityTab api={api} />
      ) : (
        <KitOverview api={api} onSection={onTab} onTab={onTab} manage={<Manage archived={!!kit.archived} onArchive={() => api.update((k) => ({ ...k, archived: !k.archived }), kit.archived ? "restored the major event" : "archived the major event")} onDelete={onDelete} />} />
      )}
    </ItemPage>
  );
}

function Manage({ archived, onArchive, onDelete }: { archived: boolean; onArchive: () => void; onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="item-manage">
      <button type="button" className="btn btn-secondary btn-sm" onClick={onArchive}>
        {archived ? "Restore from archive" : "Archive major event"}
      </button>
      {confirming ? (
        <>
          <span className="item-hint">Delete the event and its whole workflow?</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirming(false)}>
            Keep
          </button>
          <button type="button" className="btn btn-danger btn-sm" onClick={onDelete}>
            Yes, delete
          </button>
        </>
      ) : (
        <button type="button" className="btn btn-danger-ghost btn-sm" onClick={() => setConfirming(true)}>
          Delete major event
        </button>
      )}
    </div>
  );
}
