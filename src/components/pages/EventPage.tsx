import { useState } from "react";
import type {
  Campaign,
  Designer,
  EventChecklist,
  EventStatus,
  MarketingEvent,
  Project,
  Workspace,
} from "../../types";
import {
  EVENT_CHECKLIST,
  EVENT_STATUSES,
  checklistDone,
  eventDays,
  eventPhase,
  eventStatusMeta,
  fiscalYear,
  followUpMissing,
  formatEventDates,
  formatUsd,
} from "../../events";
import { daysUntil, formatShort, todayIso } from "../../dates";
import { Icon } from "../Icon";
import { ActivityPortalLink } from "../ActivityPortalLink";
import { LinkifiedText } from "../LinkifiedText";
import { EventModal } from "../EventModal";
import { ItineraryModal } from "../ItineraryModal";
import { ProjectCard } from "../ProjectCard";
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
  event: MarketingEvent;
  events: MarketingEvent[];
  campaigns: Campaign[];
  designers: Designer[];
  projects: Project[];
  workspaces: Workspace[];
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

export function EventPage({
  event,
  events,
  campaigns,
  designers,
  projects,
  workspaces,
  tab,
  onTab,
  onBack,
  onSave,
  onDelete,
  onOpenProject,
  onOpenCampaign,
}: Props) {
  const today = todayIso();
  const phase = eventPhase(event, today);
  const phaseMeta = eventStatusMeta(phase);
  const missing = followUpMissing(event, today);
  const done = checklistDone(event);
  const total = EVENT_CHECKLIST.length;
  const linkedCampaign = event.campaignId ? campaigns.find((c) => c.id === event.campaignId) : undefined;
  const linkedProjects = event.projectIds
    .map((id) => projects.find((p) => p.id === id))
    .filter((p): p is Project => !!p);
  const [itineraryOpen, setItineraryOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const countdown =
    phase === "cancelled"
      ? { value: "Off", label: "event cancelled" }
      : !event.startDate
        ? { value: "TBC", label: event.tbcMonth ? `pencilled for ${monthName(event.tbcMonth)}` : `dates to be confirmed · ${event.year}` }
        : phase === "live"
          ? { value: "On now", label: `until ${formatShort(event.endDate)}` }
          : phase === "done"
            ? countdownFor(daysUntil(event.endDate), {
                none: "",
                before: "days to the end",
                today: "ends today",
                after: "days since the event",
              })
            : countdownFor(daysUntil(event.startDate), {
                none: "no start date",
                before: "days to the event",
                today: "starts today",
                after: "days since it started",
              });

  function setChecklist(key: keyof EventChecklist, value: boolean) {
    onSave({ ...event, checklist: { ...event.checklist, [key]: value } });
  }

  const reqs: [string, boolean][] = EVENT_CHECKLIST.map((item) => [item.label, !!event.checklist?.[item.key]]);

  const strip: StripCell[] = EVENT_CHECKLIST.map((item, i) => {
    const ticked = !!event.checklist?.[item.key];
    const owed = !ticked && !!item.followUp && phase === "done";
    return {
      key: item.key,
      n: String(i + 1).padStart(2, "0"),
      label: item.label,
      detail: ticked ? "Done" : owed ? "Owed" : undefined,
      state: ticked ? "done" : owed ? "late" : "open",
      title: `${item.label}: ${ticked ? "done, click to untick" : "not done, click to tick"}`,
      onClick: () => setChecklist(item.key, !ticked),
    };
  });

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "details", label: "Details" },
    { id: "checklist", label: "Checklist", count: total - done },
    { id: "itinerary", label: "Itinerary" },
    { id: "results", label: "Results" },
  ];

  const facts = [
    { label: "Dates", value: <b className="mono">{formatEventDates(event)}</b> },
    { label: "Where", value: event.location?.trim() || "Not set" },
    { label: "Lead", value: event.marketingLead?.trim() || "Not set" },
    { label: "Checklist", value: <b className="mono">{done}/{total}</b> },
    {
      label: "Spend",
      value: event.investmentUsd !== undefined ? <b className="mono">US${formatUsd(event.investmentUsd)}</b> : "—",
    },
  ];

  const presence = [
    event.sponsor ? `Sponsor${event.sponsorNote ? ` · ${event.sponsorNote}` : ""}` : null,
    event.booth ? `Booth${event.boothNote ? ` · ${event.boothNote}` : ""}` : null,
    event.attendAndSell ? "Attend and sell" : null,
    event.speakingOpportunity?.trim() ? `Speaking · ${event.speakingOpportunity.trim()}` : null,
  ].filter((s): s is string => !!s);

  return (
    <>
      <ItemPage
        kind="event"
        crumbs={[
          { label: "Events", onClick: onBack },
          { label: event.name || "Untitled event", onClick: tab === "overview" ? undefined : () => onTab("overview") },
          ...(tab === "overview" ? [] : [{ label: tabs.find((t) => t.id === tab)?.label ?? tab }]),
        ]}
        eyebrow={[event.division, event.region, event.startDate ? fiscalYear(event.startDate) : String(event.year)]
          .filter(Boolean)
          .join(" · ")}
        title={event.name || "Untitled event"}
        subtitle={event.location?.trim() || undefined}
        countdown={countdown}
        chips={
          <>
            <StatusChip status={STATUS_CHIP[phase]}>{phaseMeta.label}</StatusChip>
            {missing.length > 0 && <StatusChip status="blocked">Needs follow-up</StatusChip>}
            {event.campaignCode && <span className="item-chip mono">{event.campaignCode}</span>}
          </>
        }
        facts={facts}
        actions={
          <>
            <ActivityPortalLink kind="event" id={event.id} />
            {event.itinerarySharePointUrl && (
              <a className="btn btn-ghost btn-sm" href={event.itinerarySharePointUrl} target="_blank" rel="noopener noreferrer">
                <Icon name="external-link" size={14} /> Itinerary on SharePoint
              </a>
            )}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setItineraryOpen(true)}>
              <Icon name="map-path" size={14} /> {event.itinerary ? "Edit itinerary" : "Generate itinerary"}
            </button>
          </>
        }
        tabs={tabs}
        tab={tab}
        onTab={onTab}
        strip={strip}
        stripLabel="Event checklist"
      >
        {tab === "details" ? (
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
            onOpenProject={onOpenProject}
            onOpenCampaign={onOpenCampaign}
            onCancel={onBack}
            onSave={onSave}
            onDelete={onDelete}
          />
        ) : tab === "checklist" ? (
          <ItemGrid
            main={
              <SideCard title="Checklist" aside={<span className="item-counter">{done} of {total}</span>}>
                <ul className="item-tasks">
                  {EVENT_CHECKLIST.map((item) => {
                    const ticked = !!event.checklist?.[item.key];
                    const owed = !ticked && !!item.followUp && phase === "done";
                    return (
                      <li key={item.key} className={ticked ? "done" : owed ? "late" : ""}>
                        <button
                          type="button"
                          className="item-tick"
                          aria-pressed={ticked}
                          aria-label={`${item.label}: ${ticked ? "done" : "not done"}`}
                          onClick={() => setChecklist(item.key, !ticked)}
                        >
                          {ticked && <Icon name="checkmark" size={12} />}
                        </button>
                        <span className="item-task-label">
                          {item.label}
                          {item.followUp && <span className="item-hint"> · after the event</span>}
                        </span>
                        {owed && <StatusChip status="blocked">Owed</StatusChip>}
                      </li>
                    );
                  })}
                </ul>
                <p className="item-hint">
                  Once the event is over, a missing feedback form, report or logged results puts it on the needs-follow-up list.
                </p>
              </SideCard>
            }
            sideTop={
              <SideCard title="Ready when" aside={<ReadyCount reqs={reqs} />}>
                <ReadyWhen reqs={reqs} />
              </SideCard>
            }
          />
        ) : tab === "itinerary" ? (
          <ItemGrid
            main={
              <SideCard
                title="Attendee itinerary"
                aside={
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => setItineraryOpen(true)}>
                    {event.itinerary ? "Edit itinerary" : "Generate itinerary"}
                  </button>
                }
              >
                {event.itinerary ? (
                  <>
                    <KeyValues
                      rows={[
                        { label: "Header", value: event.itinerary.headerLine || <span className="item-hint">Not set</span> },
                        { label: "Cities", value: event.itinerary.cities.map((c) => c.name).join(", ") || "—" },
                        { label: "Attending", value: `${event.itinerary.attendees.length} ${event.itinerary.attendees.length === 1 ? "person" : "people"}` },
                        { label: "Days", value: `${event.itinerary.days.length} planned` },
                        { label: "Updated", value: event.itinerary.updatedAt ? new Date(event.itinerary.updatedAt).toLocaleString() : "—" },
                      ]}
                    />
                    <ul className="item-days">
                      {event.itinerary.days.map((d) => (
                        <li key={d.date}>
                          <span className="mono">{formatShort(d.date)}</span>
                          <span>
                            <b>{d.title || "Day"}</b>
                            {d.city ? ` · ${d.city}` : ""} · {d.items.length} item{d.items.length === 1 ? "" : "s"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <EmptyNote>
                    No itinerary yet. Generate one from the event: a day per date, the stand open on each, the speaking slot and the leads, then put it on SharePoint for attendees.
                  </EmptyNote>
                )}
              </SideCard>
            }
            sideTop={
              <SideCard title="SharePoint">
                {event.itinerarySharePointUrl ? (
                  <a className="btn btn-secondary btn-sm" href={event.itinerarySharePointUrl} target="_blank" rel="noopener noreferrer">
                    <Icon name="external-link" size={14} /> Open the itinerary page
                  </a>
                ) : (
                  <p className="item-hint">Not on SharePoint yet. Use Check &amp; send inside the itinerary to put it there.</p>
                )}
              </SideCard>
            }
          />
        ) : tab === "results" ? (
          <ItemGrid
            main={
              <>
                <SideCard
                  title="Results"
                  aside={
                    <button type="button" className="link-btn" onClick={() => onTab("details")}>
                      Log results
                    </button>
                  }
                >
                  <div className="item-stats">
                    <Stat label="Conversations" value={event.comms} />
                    <Stat label="Opportunities" value={event.opps} />
                    <Stat label="Cost per opp" value={event.opps && event.investmentUsd ? Math.round(event.investmentUsd / event.opps) : undefined} prefix="US$" />
                  </div>
                  {event.oppsBreakdown && <p className="item-prose">{event.oppsBreakdown}</p>}
                  {!event.comms && !event.opps && <EmptyNote>No results logged yet. Add conversations and opportunities on the Details tab once the event is over.</EmptyNote>}
                </SideCard>
                <SideCard title="Budget">
                  <KeyValues
                    rows={[
                      {
                        label: "Investment",
                        value:
                          event.investment !== undefined ? `${event.currency ?? "USD"} ${formatUsd(event.investment)}` : <span className="item-hint">Not set</span>,
                      },
                      { label: "In US dollars", value: event.investmentUsd !== undefined ? `US$${formatUsd(event.investmentUsd)}` : "—" },
                      { label: "Cost details", value: event.costDetails?.trim() || <span className="item-hint">—</span> },
                    ]}
                  />
                </SideCard>
              </>
            }
            sideTop={
              <SideCard title="After the event">
                <ReadyWhen
                  reqs={EVENT_CHECKLIST.filter((i) => i.followUp).map((i) => [i.label, !!event.checklist?.[i.key]])}
                />
              </SideCard>
            }
          />
        ) : (
          <ItemGrid
            main={
              <>
                <SideCard title="Next steps" aside={<span className="item-hint">{total - done} to do</span>}>
                  {done === total ? (
                    <EmptyNote>Everything on the checklist is done.</EmptyNote>
                  ) : (
                    <ul className="item-tasks">
                      {EVENT_CHECKLIST.filter((i) => !event.checklist?.[i.key])
                        .slice(0, 5)
                        .map((item) => (
                          <li key={item.key}>
                            <button
                              type="button"
                              className="item-tick"
                              aria-pressed={false}
                              aria-label={`${item.label}: not done`}
                              onClick={() => setChecklist(item.key, true)}
                            />
                            <span className="item-task-label">{item.label}</span>
                          </li>
                        ))}
                      {total - done > 5 && (
                        <li className="item-more">
                          <button type="button" className="link-btn" onClick={() => onTab("checklist")}>
                            {total - done - 5} more on the Checklist tab
                          </button>
                        </li>
                      )}
                    </ul>
                  )}
                </SideCard>
                <SideCard
                  title="About"
                  aside={
                    <button type="button" className="link-btn" onClick={() => onTab("details")}>
                      Edit
                    </button>
                  }
                >
                  <KeyValues
                    rows={[
                      { label: "Audience", value: event.audience?.trim() || <span className="item-hint">Not described</span> },
                      {
                        label: "Our presence",
                        value: presence.length ? (
                          <ul className="item-plain">
                            {presence.map((p) => (
                              <li key={p}>{p}</li>
                            ))}
                          </ul>
                        ) : (
                          <span className="item-hint">Not set</span>
                        ),
                      },
                      { label: "Dates as published", value: event.datesAsPublished?.trim() || "—" },
                    ]}
                  />
                  {event.notes?.trim() && (
                    <div className="item-prose">
                      <LinkifiedText text={event.notes} designers={designers} />
                    </div>
                  )}
                </SideCard>
                <SideCard title="Who's going">
                  <KeyValues
                    rows={[
                      { label: "Marketing lead", value: event.marketingLead?.trim() || "—" },
                      { label: "Sales lead", value: event.salesLead?.trim() || "—" },
                      {
                        label: "Sales attendees",
                        value: event.salesAttendees?.trim()
                          ? `${event.salesAttendees}${event.salesAttendeeCount ? ` (${event.salesAttendeeCount})` : ""}`
                          : event.salesAttendeeCount
                            ? String(event.salesAttendeeCount)
                            : "—",
                      },
                      { label: "Academy", value: event.academyAttendee?.trim() || "—" },
                      { label: "Partners", value: event.partnerAttendees?.trim() || "—" },
                    ]}
                  />
                </SideCard>
                {linkedProjects.length > 0 && (
                  <SideCard title="Projects for this event">
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
                  </SideCard>
                )}
              </>
            }
            sideTop={
              <>
                <SideCard title="Status & schedule">
                  <KeyValues
                    rows={[
                      {
                        label: "Status",
                        value: (
                          <select
                            value={event.status}
                            onChange={(e) => onSave({ ...event, status: e.target.value as EventStatus })}
                            aria-label="Event status"
                          >
                            {EVENT_STATUSES.map((s) => (
                              <option key={s.value} value={s.value}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        ),
                      },
                      { label: "Now", value: <StatusChip status={STATUS_CHIP[phase]}>{phaseMeta.label}</StatusChip> },
                      {
                        label: "Dates",
                        value: `${formatEventDates(event)}${eventDays(event) ? ` · ${eventDays(event)} day${eventDays(event) === 1 ? "" : "s"}` : ""}`,
                      },
                      { label: "Where", value: event.location?.trim() || <span className="item-hint">Not set</span> },
                      { label: "Division", value: event.division || "—" },
                      { label: "Region", value: event.region || "—" },
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
                    {linkedCampaign && (
                      <li>
                        <Icon name="target" size={16} />
                        <button type="button" className="link-btn" onClick={() => onOpenCampaign(linkedCampaign.id)}>
                          {linkedCampaign.name}
                        </button>
                      </li>
                    )}
                    {event.campaignId && !linkedCampaign && (
                      <li className="item-hint">
                        <Icon name="target" size={16} /> Deleted campaign
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
                    {event.itinerarySharePointUrl && (
                      <li>
                        <Icon name="browser" size={16} />
                        <a href={event.itinerarySharePointUrl} target="_blank" rel="noopener noreferrer">
                          Itinerary on SharePoint
                        </a>
                      </li>
                    )}
                    {event.presentation && (
                      <li>
                        <Icon name="file" size={16} /> {event.presentation}
                      </li>
                    )}
                    {event.feedbackDoc && (
                      <li>
                        <Icon name="file" size={16} /> {event.feedbackDoc}
                      </li>
                    )}
                    {!linkedCampaign && linkedProjects.length === 0 && !event.itinerarySharePointUrl && !event.presentation && !event.feedbackDoc && (
                      <li className="item-hint">Nothing linked yet.</li>
                    )}
                  </ul>
                </SideCard>
                <SideCard title="Manage">
                  <div className="item-manage">
                    {confirmingDelete ? (
                      <>
                        <span className="item-hint">Delete this event?</span>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmingDelete(false)}>
                          Keep
                        </button>
                        <button type="button" className="btn btn-danger btn-sm" onClick={onDelete}>
                          Yes, delete
                        </button>
                      </>
                    ) : (
                      <button type="button" className="btn btn-danger-ghost btn-sm" onClick={() => setConfirmingDelete(true)}>
                        Delete event
                      </button>
                    )}
                  </div>
                </SideCard>
              </>
            }
          />
        )}
      </ItemPage>
      {itineraryOpen && (
        <ItineraryModal
          key={event.id}
          event={event}
          onClose={() => setItineraryOpen(false)}
          // The live subscription brings the saved itinerary back.
          onSaved={() => {}}
        />
      )}
    </>
  );
}

function Stat({ label, value, prefix = "" }: { label: string; value: number | undefined; prefix?: string }) {
  return (
    <div className="item-stat">
      <span className="item-stat-value mono">{value === undefined || value === null ? "—" : `${prefix}${value.toLocaleString()}`}</span>
      <span className="item-stat-label">{label}</span>
    </div>
  );
}

function monthName(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}
