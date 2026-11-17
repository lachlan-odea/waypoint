// The changes the assistant can make, and how it makes them: it never
// writes. A "propose_…" tool checks what the model asked for against the
// app's data and turns it into a Proposal, which the panel shows as a card.
// Nothing is saved until the person clicks Apply, and then the change goes
// through the same save paths as the rest of the app (applyAssistantAction
// in App.tsx), as that person.
//
// What it can propose: a new project; a project's status, due date,
// priority or assignees; a comment; a project milestone ticked off; a
// campaign milestone; a draft social post. There is nothing here that
// deletes.

import type Anthropic from "@anthropic-ai/sdk";
import type { MilestoneType, Priority, ProjectStatus } from "./types";
import { projectStatusLabel } from "./constants";
import { formatShort } from "./dates";
import type { AssistantData } from "./assistantTools";

export type AssistantAction =
  | {
      kind: "create_project";
      workspaceId: string;
      title: string;
      overview: string;
      client: string;
      brand: string;
      contentTypes: string[];
      briefUrl: string;
      dueDate: string;
      priority: Priority;
      assigneeIds: string[];
    }
  | {
      kind: "update_project";
      projectId: string;
      // Only the fields being changed are present.
      status?: ProjectStatus;
      dueDate?: string;
      priority?: Priority;
      assigneeIds?: string[];
    }
  | { kind: "add_comment"; projectId: string; text: string }
  | { kind: "set_milestone"; projectId: string; milestoneId: string; done: boolean }
  | { kind: "add_campaign_milestone"; campaignId: string; date: string; label: string; description: string; url: string }
  | {
      kind: "create_social_post";
      date: string;
      month: string;
      channel: string;
      category: string;
      topic: string;
      copy: string;
      owner: string;
      notes: string;
    };

// A change waiting on the person, as the panel's card shows it.
export type Proposal = {
  id: string;
  action: AssistantAction;
  // "Create project “Brochure refresh”".
  title: string;
  // The card's lines: what will be set, as label and value.
  details: [string, string][];
  state: "pending" | "applied" | "dismissed" | "failed";
  // Where the changed thing can be opened, once applied (a hash route).
  link?: string;
  error?: string;
};

// What the app needs beyond the look-ups' data to check a proposal.
export type ActionContext = AssistantData & {
  milestoneTypes: MilestoneType[];
  socialCategories: string[];
  contentTypes: string[];
};

const PRIORITIES: Priority[] = ["Urgent", "High", "Normal", "Low"];
const STATUS_BY_LABEL: Record<string, ProjectStatus> = {
  planning: "planning",
  active: "active",
  "on hold": "paused",
  completed: "completed",
  cancelled: "cancelled",
};

export const ACTION_TOOLS: Anthropic.Tool[] = [
  {
    name: "propose_create_project",
    description:
      "Propose a new project on a team's board. The person sees it as a card and it is only created if they click Apply. Ask which team it belongs to if they haven't said.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["title", "team"],
      properties: {
        title: { type: "string" },
        team: { type: "string", description: "The team (workspace) name or id whose board it goes on." },
        overview: { type: "string", description: "What the work is, in a few sentences." },
        due_date: { type: "string", description: "YYYY-MM-DD." },
        priority: { type: "string", enum: PRIORITIES, description: "Defaults to Normal." },
        assignees: { type: "array", items: { type: "string" }, description: "People's names or ids, or \"me\"." },
        client: { type: "string" },
        brand: { type: "string" },
        content_types: { type: "array", items: { type: "string" }, description: "e.g. Web, Email, Video." },
        brief_url: { type: "string" },
      },
    },
  },
  {
    name: "propose_update_project",
    description:
      "Propose a change to an existing project's status, due date, priority or assignees. Include only what should change. The person sees it as a card and it is only saved if they click Apply. Find the project's id with find_projects first.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["project_id"],
      properties: {
        project_id: { type: "string" },
        status: { type: "string", enum: Object.keys(STATUS_BY_LABEL) },
        due_date: { type: "string", description: "YYYY-MM-DD, or an empty string to clear the due date." },
        priority: { type: "string", enum: PRIORITIES },
        add_assignees: { type: "array", items: { type: "string" }, description: "People to add: names or ids, or \"me\"." },
        remove_assignees: { type: "array", items: { type: "string" }, description: "People to take off: names or ids, or \"me\"." },
      },
    },
  },
  {
    name: "propose_comment",
    description:
      "Propose a comment on a project's thread, posted as the person you're talking to. Write it in their voice. Mentioning someone as @Firstname notifies them. Only posted if the person clicks Apply.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["project_id", "text"],
      properties: { project_id: { type: "string" }, text: { type: "string" } },
    },
  },
  {
    name: "propose_milestone_done",
    description:
      "Propose ticking off (or un-ticking) one of a project's milestones. Use get_project to see its milestones. Only saved if the person clicks Apply.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["project_id", "milestone"],
      properties: {
        project_id: { type: "string" },
        milestone: { type: "string", description: "The milestone's label, as get_project lists it." },
        done: { type: "boolean", description: "Defaults to true. False un-ticks it." },
      },
    },
  },
  {
    name: "propose_campaign_milestone",
    description:
      "Propose a new dated milestone on a campaign (an EDM send, a landing page going live, a social post). Only added if the person clicks Apply. Find the campaign's id with find_campaigns first.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["campaign_id", "date", "type"],
      properties: {
        campaign_id: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD." },
        type: { type: "string", description: "The milestone type, e.g. EDM, Landing Page, Organic Social Post. If it isn't one of the team's types, the error lists them." },
        description: { type: "string", description: "A line on what it is." },
        url: { type: "string", description: "Where its asset lives, if known." },
      },
    },
  },
  {
    name: "propose_social_post",
    description:
      "Propose a new draft post on the Social calendar. It is created as a draft for the social team to finish, and only if the person clicks Apply.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["topic"],
      properties: {
        topic: { type: "string", description: "What the post is about, in a few words." },
        date: { type: "string", description: "YYYY-MM-DD publish date. Leave out if it isn't scheduled yet and give month." },
        month: { type: "string", description: "YYYY-MM the post is planned for, when there's no date. Defaults to this month." },
        channel: { type: "string", description: "The brand account: CargoWise or WiseTech. Defaults to CargoWise." },
        category: { type: "string", description: "The kind of post. If it isn't one of the team's categories, the error lists them." },
        copy: { type: "string", description: "The post's text, if drafted." },
        owner: { type: "string", description: "Who's driving it. Defaults to the person asking." },
        notes: { type: "string" },
      },
    },
  },
];

export const ACTION_STATUS: Record<string, string> = {
  propose_create_project: "Drafting a new project",
  propose_update_project: "Drafting a change",
  propose_comment: "Drafting a comment",
  propose_milestone_done: "Drafting a change",
  propose_campaign_milestone: "Drafting a milestone",
  propose_social_post: "Drafting a social post",
};

// ── Checking what was asked for ────────────────────────────────────────

type Input = Record<string, unknown>;
type Draft = Pick<Proposal, "action" | "title" | "details">;

// Thrown with words for the model, so it can fix the request or ask.
class Refused extends Error {}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => str(x, 200)).filter(Boolean) : [];
}

function date(v: unknown, what: string): string {
  const s = str(v, 40);
  // Parsing alone would roll 31 February into March, so the date has to
  // come back out as it went in.
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : null;
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== s) {
    throw new Refused(`${what} must be a real date as YYYY-MM-DD.`);
  }
  return s;
}

function url(v: unknown, what: string): string {
  const s = str(v, 1000);
  if (s && !/^https?:\/\//i.test(s)) throw new Refused(`${what} must start with http:// or https://.`);
  return s;
}

function priority(v: unknown): Priority | undefined {
  const s = str(v, 20).toLowerCase();
  if (!s) return undefined;
  const p = PRIORITIES.find((x) => x.toLowerCase() === s);
  if (!p) throw new Refused(`Priority must be one of ${PRIORITIES.join(", ")}.`);
  return p;
}

// One person from a name, an id or "me". A name that fits nobody, or more
// than one person, is refused so the wrong person is never assigned.
function person(ctx: ActionContext, who: string): string {
  const q = who.trim().toLowerCase();
  if (q === "me" || q === "myself") return ctx.me.id;
  const exact = ctx.designers.filter((d) => d.id === who.trim() || d.name.trim().toLowerCase() === q);
  const found = exact.length ? exact : ctx.designers.filter((d) => d.name.toLowerCase().includes(q));
  if (found.length === 1) return found[0].id;
  if (found.length === 0) throw new Refused(`Nobody on Waypoint is called "${who}".`);
  throw new Refused(`"${who}" could be ${found.map((d) => d.name).join(" or ")}. Ask which one.`);
}

function names(ctx: ActionContext, ids: string[]): string {
  return ids.map((id) => ctx.designers.find((d) => d.id === id)?.name ?? "").filter(Boolean).join(", ") || "Nobody";
}

function project(ctx: ActionContext, id: unknown) {
  const pid = str(id, 200);
  const p = ctx.projects.find((x) => x.id === pid);
  if (!p || !ctx.workspaces.some((w) => w.id === p.workspaceId)) {
    throw new Refused(`No project with the id "${pid}". Use find_projects to get its id.`);
  }
  return p;
}

// One of the team's own options, matched without regard to case.
function option(value: string, options: string[], what: string): string {
  const hit = options.find((o) => o.toLowerCase() === value.toLowerCase());
  if (!hit) throw new Refused(`"${value}" isn't one of the ${what}: ${options.join(", ")}.`);
  return hit;
}

const day = (iso: string) => (iso ? formatShort(iso) : "None");

function createProject(ctx: ActionContext, input: Input): Draft {
  const title = str(input.title, 160);
  if (!title) throw new Refused("A project needs a title.");
  const teamText = str(input.team, 80).toLowerCase();
  const teams = ctx.workspaces.filter((w) => w.id.toLowerCase() === teamText || w.name.toLowerCase() === teamText);
  const team = teams.length === 1 ? teams : ctx.workspaces.filter((w) => w.name.toLowerCase().includes(teamText));
  if (!teamText || team.length !== 1) {
    throw new Refused(`Which team's board? The teams are: ${ctx.workspaces.map((w) => w.name).join(", ")}.`);
  }
  const dueDate = input.due_date ? date(input.due_date, "The due date") : "";
  const assigneeIds = [...new Set(strings(input.assignees).map((a) => person(ctx, a)))];
  const contentTypes = strings(input.content_types).map((c) => option(c, ctx.contentTypes, "team's content types"));
  const action: AssistantAction = {
    kind: "create_project",
    workspaceId: team[0].id,
    title,
    overview: str(input.overview, 4000),
    client: str(input.client, 120),
    brand: str(input.brand, 120),
    contentTypes,
    briefUrl: url(input.brief_url, "The brief link"),
    dueDate,
    priority: priority(input.priority) ?? "Normal",
    assigneeIds,
  };
  const details: [string, string][] = [
    ["Team", team[0].name],
    ["Due", day(dueDate)],
    ["Priority", action.priority],
    ["Assigned to", names(ctx, assigneeIds)],
  ];
  if (action.client) details.push(["Client", action.client]);
  if (action.brand) details.push(["Brand", action.brand]);
  if (contentTypes.length) details.push(["Content", contentTypes.join(", ")]);
  if (action.overview) details.push(["Overview", action.overview]);
  if (action.briefUrl) details.push(["Brief", action.briefUrl]);
  return { action, title: `Create project “${title}”`, details };
}

function updateProject(ctx: ActionContext, input: Input): Draft {
  const p = project(ctx, input.project_id);
  const action: AssistantAction = { kind: "update_project", projectId: p.id };
  const details: [string, string][] = [];

  const statusText = str(input.status, 20).toLowerCase();
  if (statusText) {
    const status = STATUS_BY_LABEL[statusText];
    if (!status) throw new Refused(`Status must be one of ${Object.keys(STATUS_BY_LABEL).join(", ")}.`);
    if (status !== (p.status ?? "active")) {
      action.status = status;
      details.push(["Status", `${projectStatusLabel(p.status)} → ${projectStatusLabel(status)}`]);
    }
  }
  if (typeof input.due_date === "string") {
    const dueDate = input.due_date.trim() ? date(input.due_date, "The due date") : "";
    if (dueDate !== (p.dueDate ?? "")) {
      action.dueDate = dueDate;
      details.push(["Due", `${day(p.dueDate)} → ${day(dueDate)}`]);
    }
  }
  const nextPriority = priority(input.priority);
  if (nextPriority && nextPriority !== p.priority) {
    action.priority = nextPriority;
    details.push(["Priority", `${p.priority} → ${nextPriority}`]);
  }
  const add = strings(input.add_assignees).map((a) => person(ctx, a));
  const remove = strings(input.remove_assignees).map((a) => person(ctx, a));
  if (add.length || remove.length) {
    const next = [...new Set([...(p.assigneeIds ?? []), ...add])].filter((id) => !remove.includes(id));
    const before = p.assigneeIds ?? [];
    if (next.length !== before.length || next.some((id) => !before.includes(id))) {
      action.assigneeIds = next;
      details.push(["Assigned to", `${names(ctx, before)} → ${names(ctx, next)}`]);
    }
  }
  if (details.length === 0) {
    throw new Refused("That wouldn't change anything: the project already has those values. Tell the person so.");
  }
  return { action, title: `Update “${p.title}”`, details };
}

function comment(ctx: ActionContext, input: Input): Draft {
  const p = project(ctx, input.project_id);
  const text = str(input.text, 4000);
  if (!text) throw new Refused("The comment is empty.");
  return {
    action: { kind: "add_comment", projectId: p.id, text },
    title: `Comment on “${p.title}”`,
    details: [
      ["Posted as", ctx.me.name],
      ["Comment", text],
    ],
  };
}

function milestoneDone(ctx: ActionContext, input: Input): Draft {
  const p = project(ctx, input.project_id);
  const q = str(input.milestone, 200).toLowerCase();
  const all = p.milestones ?? [];
  const exact = all.filter((m) => m.id === str(input.milestone, 200) || m.label.trim().toLowerCase() === q);
  const found = exact.length ? exact : all.filter((m) => q && m.label.toLowerCase().includes(q));
  if (found.length !== 1) {
    throw new Refused(
      all.length === 0
        ? "That project has no milestones."
        : `Which milestone? The project's milestones are: ${all.map((m) => `"${m.label}"`).join(", ")}.`,
    );
  }
  const done = input.done !== false;
  if (found[0].done === done) {
    throw new Refused(`"${found[0].label}" is already ${done ? "ticked off" : "open"}. Tell the person so.`);
  }
  return {
    action: { kind: "set_milestone", projectId: p.id, milestoneId: found[0].id, done },
    title: `${done ? "Tick off" : "Reopen"} a milestone on “${p.title}”`,
    details: [["Milestone", found[0].label]],
  };
}

function campaignMilestone(ctx: ActionContext, input: Input): Draft {
  const cid = str(input.campaign_id, 200);
  const c = ctx.campaigns.find((x) => x.id === cid);
  if (!c) throw new Refused(`No campaign with the id "${cid}". Use find_campaigns to get its id.`);
  const type = ctx.milestoneTypes.find((t) => t.label.toLowerCase() === str(input.type, 80).toLowerCase());
  if (!type) {
    throw new Refused(`The milestone type must be one of the team's: ${ctx.milestoneTypes.map((t) => t.label).join(", ")}.`);
  }
  const when = date(input.date, "The milestone's date");
  const description = str(input.description, 300);
  const link = url(input.url, "The milestone's link");
  const details: [string, string][] = [
    ["Type", type.label],
    ["Date", day(when)],
  ];
  if (description) details.push(["About", description]);
  if (link) details.push(["Link", link]);
  if (type.social) details.push(["Also", "Puts a draft post on the Social calendar for that day"]);
  return {
    action: { kind: "add_campaign_milestone", campaignId: c.id, date: when, label: type.label, description, url: link },
    title: `Add a milestone to “${c.name}”`,
    details,
  };
}

function socialPost(ctx: ActionContext, input: Input): Draft {
  const topic = str(input.topic, 200);
  if (!topic) throw new Refused("A post needs a topic.");
  const when = input.date ? date(input.date, "The post's date") : "";
  const monthText = str(input.month, 7);
  if (monthText && !/^\d{4}-(0[1-9]|1[0-2])$/.test(monthText)) throw new Refused("The month must be YYYY-MM.");
  const month = when ? when.slice(0, 7) : monthText || ctx.today.slice(0, 7);
  const categoryText = str(input.category, 80);
  const category = categoryText ? option(categoryText, ctx.socialCategories, "team's post categories") : "";
  const action: AssistantAction = {
    kind: "create_social_post",
    date: when,
    month,
    channel: str(input.channel, 60) || "CargoWise",
    category,
    topic,
    copy: str(input.copy, 3000),
    owner: str(input.owner, 80) || ctx.me.name,
    notes: str(input.notes, 1000),
  };
  const details: [string, string][] = [
    ["When", when ? day(when) : `Unscheduled, planned for ${month}`],
    ["Channel", action.channel],
    ["Status", "Draft"],
    ["Owner", action.owner],
  ];
  if (category) details.push(["Category", category]);
  if (action.copy) details.push(["Copy", action.copy]);
  if (action.notes) details.push(["Notes", action.notes]);
  return { action, title: `Create draft post “${topic}”`, details };
}

const PROPOSERS: Record<string, (ctx: ActionContext, input: Input) => Draft> = {
  propose_create_project: createProject,
  propose_update_project: updateProject,
  propose_comment: comment,
  propose_milestone_done: milestoneDone,
  propose_campaign_milestone: campaignMilestone,
  propose_social_post: socialPost,
};

let nextId = 0;

// Turn one "propose_…" call into a Proposal, or into the reason it can't be
// one. Returns null for a tool that isn't a proposal. `content` is what the
// model is told either way.
export function proposeAction(
  ctx: ActionContext,
  name: string,
  input: unknown,
): { content: string; isError: boolean; proposal?: Proposal } | null {
  const propose = PROPOSERS[name];
  if (!propose) return null;
  try {
    const draft = propose(ctx, input && typeof input === "object" ? (input as Input) : {});
    return {
      proposal: { ...draft, id: `proposal-${Date.now()}-${nextId++}`, state: "pending" },
      isError: false,
      content: JSON.stringify({
        shownToPerson: draft.title,
        saved: false,
        note: "This is now a card in the chat with Apply and Dismiss buttons. Nothing has been saved. Tell the person in a sentence what you've proposed and that they need to click Apply; don't say it's done.",
      }),
    };
  } catch (err) {
    if (err instanceof Refused) return { content: err.message, isError: true };
    console.error("Assistant proposal failed", name, err);
    return { content: "That change couldn't be prepared. Tell the person it didn't work.", isError: true };
  }
}

// How a past proposal is described to the model on later turns, so it
// knows what was applied and what wasn't.
export function proposalNote(p: Proposal): string {
  const state =
    p.state === "applied"
      ? "the person applied it"
      : p.state === "dismissed"
        ? "the person dismissed it; it was not saved"
        : p.state === "failed"
          ? "it could not be saved"
          : "not yet applied or dismissed";
  return `[Proposed change: ${p.title}. ${p.details.map(([k, v]) => `${k}: ${v}`).join("; ")}. Outcome: ${state}.]`;
}
