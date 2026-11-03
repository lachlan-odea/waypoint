import { useState, type ReactNode } from "react";
import type {
  BigRock,
  Campaign,
  MarketingEvent,
  Project,
  SocialPost,
  WorkspaceData,
} from "../types";
import { rockWork, unattributed, type RockWork } from "../bigRocks";
import { PHASE_LABEL, campaignPhase } from "../campaigns";
import { brandColor, projectStatusLabel, socialStatusMeta } from "../constants";
import { eventPhase, eventStatusMeta, formatEventDates } from "../events";
import { STAGE_LABEL, kitName, kitOf, kitState } from "../webinarKit";
import { socialPostTitle } from "../socialPosts";
import { formatShort, todayIso } from "../dates";
import {
  campaignPhaseTone,
  eventStatusTone,
  projectStatusTone,
  socialStatusTone,
} from "../statusTone";
import { StatusChip } from "./pages/ItemPage";

// The Big Rocks page: each rock with what the team has done for it —
// projects, campaigns, webinars, social posts and events — and the live
// work no rock claims. The attribution rules are in src/bigRocks.ts.

type Props = {
  rocks: BigRock[];
  workspace: WorkspaceData;
  campaigns: Campaign[];
  events: MarketingEvent[];
  socialPosts: SocialPost[];
  onOpenProject: (id: string) => void;
  onOpenCampaign: (id: string, tab?: string) => void;
  onOpenEvent: (id: string, tab?: string) => void;
  onOpenSocialPost: (id: string) => void;
  // Super users only: open the editor.
  onManage?: () => void;
};

const UNATTRIBUTED = "__none__";

function isLive(p: Project): boolean {
  return !p.archived && ["active", "planning"].includes(p.status ?? "active");
}

export function BigRocksView({
  rocks,
  workspace,
  campaigns,
  events,
  socialPosts,
  onOpenProject,
  onOpenCampaign,
  onOpenEvent,
  onOpenSocialPost,
  onManage,
}: Props) {
  const today = todayIso();
  const lists = { projects: workspace.projects, campaigns, socialPosts, events };
  const works = rocks.map((r) => rockWork(r, lists));
  const active = works.filter((w) => !w.rock.retired);
  const retired = works.filter((w) => w.rock.retired);
  const un = unattributed(works, lists);
  const unLiveProjects = un.projects.filter(isLive);
  const unOpenCampaigns = un.campaigns.filter((c) => campaignPhase(c, today) !== "finished");

  const liveProjects = workspace.projects.filter(isLive);
  const liveOnRock = liveProjects.filter((p) => works.some((w) => w.projects.some((x) => x.id === p.id)));
  const openCampaigns = campaigns.filter((c) => campaignPhase(c, today) !== "finished");
  const openOnRock = openCampaigns.filter((c) => works.some((w) => [...w.campaigns, ...w.webinars].some((x) => x.id === c.id)));
  const postsOnRock = new Set(works.flatMap((w) => w.posts.map((p) => p.id))).size;
  const webinarsOnRock = new Set(works.flatMap((w) => w.webinars.map((c) => c.id))).size;
  const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

  // The rock whose lists are showing. Falls back to the first live rock
  // when nothing's been picked or the pick has since been removed.
  const [picked, setPicked] = useState<string | null>(null);
  const selectedKey =
    picked && (picked === UNATTRIBUTED || works.some((w) => w.rock.id === picked))
      ? picked
      : (active[0]?.rock.id ?? works[0]?.rock.id ?? UNATTRIBUTED);
  const selected = works.find((w) => w.rock.id === selectedKey) ?? null;

  const teamName = (id: string) => workspace.workspaces.find((w) => w.id === id)?.name ?? id;
  const designerName = (id: string) => workspace.designers.find((d) => d.id === id)?.name ?? "";

  if (rocks.length === 0) {
    return (
      <div className="an br">
        <section className="an-panel br-empty">
          <div className="an-panel-body">
            <div className="eyebrow">Big Rocks</div>
            <h2>Nothing defined yet</h2>
            <p>
              Big Rocks are the few things the marketing team is working towards.
              Once they're defined, every campaign and project can be tagged with
              the rock it serves, and this page shows what has been done for each:
              the projects, campaigns, webinars, social posts and events.
            </p>
            {onManage ? (
              <button type="button" className="btn btn-primary" onClick={onManage}>
                Define the Big Rocks
              </button>
            ) : (
              <p className="muted small">A super user defines them from Settings → Big Rocks.</p>
            )}
          </div>
        </section>
      </div>
    );
  }

  const maxLive = Math.max(1, ...works.map((w) => w.projects.filter(isLive).length), unLiveProjects.length);

  return (
    <div className="an br">
      <div className="an-stats br-stats">
        <Stat label="Big Rocks" value={active.length} sub={retired.length ? `${retired.length} retired` : "in play"} />
        <Stat label="Live projects on a rock" value={liveOnRock.length} sub={`of ${liveProjects.length} · ${pct(liveOnRock.length, liveProjects.length)}%`} />
        <Stat label="Open campaigns on a rock" value={openOnRock.length} sub={`of ${openCampaigns.length} · ${pct(openOnRock.length, openCampaigns.length)}%`} />
        <Stat label="Webinars" value={webinarsOnRock} sub="serving a rock" />
        <Stat label="Social posts" value={postsOnRock} sub="attributed" />
        <Stat
          label="Live work on no rock"
          value={unLiveProjects.length + unOpenCampaigns.length}
          sub="projects and campaigns"
          alert={unLiveProjects.length + unOpenCampaigns.length > 0}
          onClick={() => setPicked(UNATTRIBUTED)}
        />
      </div>

      <section className="an-section">
        <div className="an-section-head">
          <div>
            <div className="eyebrow">What the work is for</div>
            <h2>The rocks</h2>
          </div>
          <p className="an-summary">
            A project counts when it's tagged with the rock or contributes to one of the rock's
            campaigns; posts, webinars and events follow from those. Click a rock for its lists.
          </p>
        </div>
        <div className="an-panel">
          <div className="an-panel-body">
            <div className="an-table-wrap">
              <table className="an-table br-table">
                <thead>
                  <tr>
                    <th>Big Rock</th>
                    <th>Live projects</th>
                    <th className="n">All projects</th>
                    <th className="n">Campaigns</th>
                    <th className="n">Webinars</th>
                    <th className="n">Posts</th>
                    <th className="n">Published</th>
                    <th className="n">Events</th>
                  </tr>
                </thead>
                <tbody>
                  {[...active, ...retired].map((w) => {
                    const live = w.projects.filter(isLive).length;
                    const published = w.posts.filter((p) => p.status === "published").length;
                    return (
                      <tr
                        key={w.rock.id}
                        className={`ex-clickable ${selectedKey === w.rock.id ? "selected" : ""} ${w.rock.retired ? "retired" : ""}`}
                        onClick={() => setPicked(w.rock.id)}
                      >
                        <td>
                          <span className="an-table-name">
                            <i className="rock-dot" style={{ background: w.rock.color }} />
                            <b>{w.rock.name}</b>
                            {w.rock.retired && <span className="item-chip">Retired</span>}
                          </span>
                          {w.rock.description && <span className="br-desc">{w.rock.description}</span>}
                        </td>
                        <td>
                          <span className="ex-bar" title={`${live} live`}>
                            <i style={{ width: `${(live / maxLive) * 100}%`, background: w.rock.color }} />
                            <span className="mono">{live}</span>
                          </span>
                        </td>
                        <td className="n mono">{w.projects.length}</td>
                        <td className="n mono">{w.campaigns.length}</td>
                        <td className="n mono">{w.webinars.length}</td>
                        <td className="n mono">{w.posts.length}</td>
                        <td className="n mono">{published}</td>
                        <td className="n mono">{w.events.length}</td>
                      </tr>
                    );
                  })}
                  <tr
                    className={`ex-clickable br-none ${selectedKey === UNATTRIBUTED ? "selected" : ""}`}
                    onClick={() => setPicked(UNATTRIBUTED)}
                  >
                    <td>
                      <span className="an-table-name">
                        <i className="rock-dot none" />
                        <b>Not on any rock</b>
                      </span>
                      <span className="br-desc">Live work no rock claims</span>
                    </td>
                    <td>
                      <span className="ex-bar" title={`${unLiveProjects.length} live`}>
                        <i className="muted-bar" style={{ width: `${(unLiveProjects.length / maxLive) * 100}%` }} />
                        <span className="mono">{unLiveProjects.length}</span>
                      </span>
                    </td>
                    <td className="n mono">{un.projects.length}</td>
                    <td className="n mono">{unOpenCampaigns.filter((c) => !kitOf(c)).length}</td>
                    <td className="n mono">{unOpenCampaigns.filter((c) => !!kitOf(c)).length}</td>
                    <td className="n mono">—</td>
                    <td className="n mono">—</td>
                    <td className="n mono">—</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {selected ? (
        <RockDetail
          w={selected}
          today={today}
          teamName={teamName}
          designerName={designerName}
          onOpenProject={onOpenProject}
          onOpenCampaign={onOpenCampaign}
          onOpenEvent={onOpenEvent}
          onOpenSocialPost={onOpenSocialPost}
        />
      ) : (
        <section className="an-section br-detail">
          <div className="an-section-head">
            <div>
              <div className="eyebrow">Not on any rock</div>
              <h2>Live work no rock claims</h2>
            </div>
            <p className="an-summary">
              Tag a project or campaign from its Details tab. A project linked to a campaign takes
              the campaign's rocks on its own.
            </p>
          </div>
          <div className="an-grid">
            <Panel title="Live projects" aside={`${unLiveProjects.length}`}>
              {unLiveProjects.length === 0 ? (
                <Empty>Every live project serves a Big Rock.</Empty>
              ) : (
                <ul className="ex-list">
                  {unLiveProjects
                    .slice()
                    .sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"))
                    .map((p) => (
                      <ProjectRow key={p.id} p={p} team={teamName(p.workspaceId)} onOpen={() => onOpenProject(p.id)} />
                    ))}
                </ul>
              )}
            </Panel>
            <Panel title="Open campaigns and webinars" aside={`${unOpenCampaigns.length}`}>
              {unOpenCampaigns.length === 0 ? (
                <Empty>Every open campaign serves a Big Rock.</Empty>
              ) : (
                <ul className="ex-list">
                  {unOpenCampaigns
                    .slice()
                    .sort((a, b) => a.startDate.localeCompare(b.startDate))
                    .map((c) =>
                      kitOf(c) ? (
                        <WebinarRow key={c.id} c={c} today={today} designerName={designerName} onOpen={() => onOpenCampaign(c.id)} />
                      ) : (
                        <CampaignRow key={c.id} c={c} today={today} ownerName={c.ownerId ? designerName(c.ownerId) : c.owner} onOpen={() => onOpenCampaign(c.id)} />
                      ),
                    )}
                </ul>
              )}
            </Panel>
          </div>
        </section>
      )}
    </div>
  );
}

// ── One rock's lists ─────────────────────────────────────────────────────

function RockDetail({
  w,
  today,
  teamName,
  designerName,
  onOpenProject,
  onOpenCampaign,
  onOpenEvent,
  onOpenSocialPost,
}: {
  w: RockWork;
  today: string;
  teamName: (id: string) => string;
  designerName: (id: string) => string;
  onOpenProject: (id: string) => void;
  onOpenCampaign: (id: string, tab?: string) => void;
  onOpenEvent: (id: string, tab?: string) => void;
  onOpenSocialPost: (id: string) => void;
}) {
  const projects = w.projects
    .slice()
    .sort((a, b) => Number(isLive(b)) - Number(isLive(a)) || (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
  const live = projects.filter(isLive).length;
  const campaigns = w.campaigns.slice().sort((a, b) => b.startDate.localeCompare(a.startDate));
  const webinars = w.webinars
    .slice()
    .sort((a, b) => (kitOf(b)?.goLive || "0000").localeCompare(kitOf(a)?.goLive || "0000"));
  const posts = w.posts.slice().sort((a, b) => (b.date || "0000").localeCompare(a.date || "0000"));
  const published = posts.filter((p) => p.status === "published").length;
  const events = w.events.slice().sort((a, b) => (b.startDate || "0000").localeCompare(a.startDate || "0000"));
  const POST_LIMIT = 12;

  return (
    <section className="an-section br-detail">
      <div className="an-section-head">
        <div>
          <div className="eyebrow">Big Rock{w.rock.retired ? " · retired" : ""}</div>
          <h2 className="br-detail-title">
            <i className="rock-dot" style={{ background: w.rock.color }} />
            {w.rock.name}
          </h2>
        </div>
        <p className="an-summary">
          {w.rock.description || "No description yet."}
        </p>
      </div>
      <div className="an-grid ex-grid-4">
        <Panel title="Projects" aside={`${live} live · ${projects.length} in all`}>
          {projects.length === 0 ? (
            <Empty>No projects yet. Tag one from its Details tab, or link it to one of this rock's campaigns.</Empty>
          ) : (
            <ul className="ex-list">
              {projects.map((p) => (
                <ProjectRow
                  key={p.id}
                  p={p}
                  team={teamName(p.workspaceId)}
                  via={w.viaCampaign.has(p.id) ? "via campaign" : undefined}
                  onOpen={() => onOpenProject(p.id)}
                />
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Campaigns and webinars" aside={`${campaigns.length} campaign${campaigns.length === 1 ? "" : "s"} · ${webinars.length} webinar${webinars.length === 1 ? "" : "s"}`}>
          {campaigns.length + webinars.length === 0 ? (
            <Empty>No campaigns yet. Tag one from its Details tab.</Empty>
          ) : (
            <ul className="ex-list">
              {campaigns.map((c) => (
                <CampaignRow key={c.id} c={c} today={today} ownerName={c.ownerId ? designerName(c.ownerId) : c.owner} onOpen={() => onOpenCampaign(c.id)} />
              ))}
              {webinars.map((c) => (
                <WebinarRow key={c.id} c={c} today={today} designerName={designerName} onOpen={() => onOpenCampaign(c.id)} />
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Social posts" aside={`${published} published · ${posts.length} in all`}>
          {posts.length === 0 ? (
            <Empty>No posts yet. A post counts when it promotes one of this rock's projects or came from one of its campaigns' milestones.</Empty>
          ) : (
            <>
              <ul className="ex-list">
                {posts.slice(0, POST_LIMIT).map((p) => (
                  <li key={p.id}>
                    <button type="button" className="ex-row" onClick={() => onOpenSocialPost(p.id)}>
                      <span className="mono ex-date">{p.date ? formatShort(p.date) : "—"}</span>
                      <span className="ex-row-main">
                        <b>{socialPostTitle(p)}</b>
                        <span className="ex-row-sub">
                          {p.channel}
                          {p.category ? ` · ${p.category}` : ""}
                          {p.owner ? ` · ${p.owner}` : ""}
                        </span>
                      </span>
                      <StatusChip status={socialStatusTone(p.status)}>{socialStatusMeta(p.status).label}</StatusChip>
                    </button>
                  </li>
                ))}
              </ul>
              {posts.length > POST_LIMIT && (
                <p className="ex-more">{posts.length - POST_LIMIT} more on the Social calendar.</p>
              )}
            </>
          )}
        </Panel>
        <Panel title="Events" aside={`${events.length}`}>
          {events.length === 0 ? (
            <Empty>No events yet. An event counts when it's part of one of this rock's campaigns or one of its projects does work for it.</Empty>
          ) : (
            <ul className="ex-list">
              {events.map((e) => {
                const phase = eventPhase(e, today);
                return (
                  <li key={e.id}>
                    <button type="button" className="ex-row" onClick={() => onOpenEvent(e.id)}>
                      <span className="ex-row-main">
                        <b>{e.name}</b>
                        <span className="ex-row-sub">
                          {formatEventDates(e)}
                          {e.location ? ` · ${e.location}` : ""}
                          {e.marketingLead ? ` · ${e.marketingLead}` : ""}
                        </span>
                      </span>
                      <StatusChip status={eventStatusTone(phase)}>{eventStatusMeta(phase).label}</StatusChip>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </section>
  );
}

// ── Rows and pieces ──────────────────────────────────────────────────────

function ProjectRow({ p, team, via, onOpen }: { p: Project; team: string; via?: string; onOpen: () => void }) {
  const status = p.status ?? "active";
  return (
    <li>
      <button type="button" className="ex-row" onClick={onOpen}>
        <span className="ex-row-main">
          <b>{p.title || "Untitled project"}</b>
          <span className="ex-row-sub">
            {team}
            {p.brand ? ` · ${p.brand}` : ""}
            {p.dueDate ? ` · due ${formatShort(p.dueDate)}` : ""}
            {p.archived ? " · archived" : ""}
            {via ? ` · ${via}` : ""}
          </span>
        </span>
        <StatusChip status={projectStatusTone(status)}>{projectStatusLabel(status)}</StatusChip>
      </button>
    </li>
  );
}

function CampaignRow({ c, today, ownerName, onOpen }: { c: Campaign; today: string; ownerName: string; onOpen: () => void }) {
  const phase = campaignPhase(c, today);
  const done = c.milestones.filter((m) => m.done).length;
  return (
    <li>
      <button type="button" className="ex-row" onClick={onOpen}>
        <i className="an-swatch" style={{ background: c.color || brandColor(c.brand) }} />
        <span className="ex-row-main">
          <b>{c.name}</b>
          <span className="ex-row-sub">
            {c.brand} · {done}/{c.milestones.length} milestones
            {c.evergreen ? ` · from ${formatShort(c.startDate)}` : ` · ${formatShort(c.startDate)} – ${formatShort(c.endDate)}`}
            {ownerName ? ` · ${ownerName}` : ""}
          </span>
        </span>
        <StatusChip status={campaignPhaseTone(phase)}>{PHASE_LABEL[phase]}</StatusChip>
      </button>
    </li>
  );
}

function WebinarRow({ c, today, designerName, onOpen }: { c: Campaign; today: string; designerName: (id: string) => string; onOpen: () => void }) {
  const kit = kitOf(c)!;
  const st = kitState(kit, today);
  return (
    <li>
      <button type="button" className="ex-row" onClick={onOpen}>
        <i className="an-swatch" style={{ background: c.color || brandColor(c.brand) }} />
        <span className="ex-row-main">
          <b>{kitName(c)}</b>
          <span className="ex-row-sub">
            Webinar · {STAGE_LABEL[kit.stage]} · {st.done}/{st.total} sections
            {kit.goLive ? ` · go-live ${formatShort(kit.goLive)}` : ""}
            {kit.lead ? ` · ${designerName(kit.lead)}` : ""}
          </span>
        </span>
        {st.health && (
          <StatusChip status={st.health.k === "bad" ? "blocked" : st.health.k === "warn" ? "scheduled" : "live"}>
            {st.health.label}
          </StatusChip>
        )}
      </button>
    </li>
  );
}

function Panel({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="an-panel">
      <div className="an-panel-head">
        <h3>{title}</h3>
        {aside && <span className="an-panel-aside">{aside}</span>}
      </div>
      <div className="an-panel-body">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="an-empty">{children}</p>;
}

function Stat({ label, value, sub, alert, onClick }: { label: string; value: number; sub?: string; alert?: boolean; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} className={`an-stat ${alert ? "alert" : ""} ${onClick ? "ex-stat-btn" : ""}`} onClick={onClick}>
      <div className="an-stat-text">
        <span className="an-stat-label">{label}</span>
        <span className="an-stat-value">{value.toLocaleString()}</span>
        {sub && <span className="an-stat-sub br-stat-sub">{sub}</span>}
      </div>
    </Tag>
  );
}
