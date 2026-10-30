import type { TourStep } from "./components/HelpTour";

// What the Help button walks through on each page. Keys are the sidebar
// views plus the three kinds of page, with "webinar" for a campaign that
// carries the kit. Targets are CSS selectors for parts of the page; a
// step whose target isn't on screen still shows, as a card in the middle.

export type Tour = { title: string; steps: TourStep[] };

const NEW: TourStep = {
  target: ".topbar .new-menu",
  title: "Create anything from + New",
  body: "Projects, campaigns, events and social posts all start here. A project opens its page straight away; a campaign, event or post opens its editor on its own page.",
};

const NAV: TourStep = {
  target: ".sidebar-nav",
  title: "Get around from the sidebar",
  body: "Teams are the boards; the views below them are the shared plans: Executive Dashboard, Campaigns, Events, the Social calendar, Analytics and the Archive. Drag a project card onto a team to move it there.",
};

const TOURS: Record<string, Tour> = {
  myDesk: {
    title: "My Desk",
    steps: [
      { target: ".mydesk-header", title: "Your start page", body: "Everything that's yours, in one place: your projects, anything waiting on your review, your notifications and a private checklist nobody else sees." },
      { target: ".mydesk-notify", title: "Notifications", body: "Mentions, replies, likes and review requests land here. Open one to jump to the project; clear them all when you've caught up." },
      { target: ".desk-panels", title: "Your checklist", body: "Add anything you need to do today. Unticked items roll forward each morning and say how many times they've rolled. Set a reminder to park an item until its time arrives; done items sweep themselves out after a fortnight." },
      { target: ".mydesk-grid", title: "Your projects and campaigns", body: "The projects assigned to you, soonest due first, the ones flagged for your review, and the campaigns you own with their next milestones. Tick a milestone here when it's happened." },
      NEW,
      NAV,
    ],
  },
  board: {
    title: "Team board",
    steps: [
      { target: ".topbar .search", title: "Find a project", body: "Search by title, client, brand or content type. The board filters as you type." },
      { target: ".camps-panel", title: "Campaigns this team feeds", body: "The campaigns any of this team's live projects contribute to, with their next milestone. Open one to see the whole campaign." },
      { target: ".drop-target.workspace-section", title: "My work", body: "Your projects, high priority first. Drop a card here to claim it. Switch to Kanban to see everything assigned to you by status — Planning, Active, On hold, Completed, Cancelled — and drag a card between columns to change its status. Click a card to open the project." },
      { target: ".team-section", title: "The team", body: "A column per teammate. Drag a card between columns to reassign it, or into Unassigned to free it up. Collapse the section with the arrow to focus on your own work; it stays collapsed until you open it again." },
      { target: ".planning-section", title: "Planning, On hold, Completed", body: "Below the board, work that isn't live yet, work that's paused and work that's done. Collapse the ones you don't need; open a project to move it between stages." },
      NEW,
      NAV,
    ],
  },
  executiveDashboard: {
    title: "Executive Dashboard",
    steps: [
      { target: ".ex-stats", title: "The numbers", body: "Across every team and programme: live projects, overdue, due this week, awaiting review, live campaigns, webinars in flight, events in the next 30 days and posts this week. Tiles with a pointer open the page behind them." },
      { target: ".ex-grid-4", title: "Programmes", body: "Live and launching campaigns with their next milestone, webinars by stage with each one's health, events with the year's spend, conversations, opportunities and follow-ups owed, and the Social calendar's month by status with what's going out this week. Every row opens the item." },
      { target: ".ex-teams", title: "Teams and projects", body: "One row per team: live work, overdue, due this week, in review, planning, on hold, done, and live projects per person. Click a team to open its board. Beside it, every project on the boards by status, with overdue, due, review, urgent and unassigned at a glance." },
      NEW,
    ],
  },
  campaigns: {
    title: "Campaigns",
    steps: [
      { target: ".soc-toolbar", title: "Pick a month and a type", body: "Step through the months, filter by campaign type (Webinar is one of them) and choose evergreen or dated runs. The counts on the pills are for the month you're on." },
      { target: ".soc-tabs", title: "Cards, Calendar or Webinars", body: "Cards lists the month's campaigns with their milestones; Calendar puts the milestones on a day grid you can drag them around; Webinars is the webinar pipeline, tracker, results and speaker directory." },
      { target: ".camps-grid, .camps-cal, .wb-head", title: "The campaigns", body: "Open a campaign for its full page: overview, details, milestones and linked projects. A Webinar campaign gets the nine-section kit as well. Tick a milestone's diamond when it's happened." },
      { target: ".camps-upcoming", title: "Coming up", body: "What starts after this month, so the plan doesn't end at the edge of the calendar." },
      NEW,
    ],
  },
  events: {
    title: "Events",
    steps: [
      { target: ".ev-kpi-btn", title: "The year at a glance", body: "Upcoming, live now, done, needs follow-up, spend in US dollars and conversations to opportunities. The Live and Needs follow-up tiles are filters: click one to narrow the list." },
      { target: ".ev-filters", title: "Filter and search", body: "By status, division (CargoWise or Landside), region and marketing lead. Search matches names, places, people and campaign codes." },
      { target: ".soc-tabs", title: "List, Cards or Calendar", body: "A table grouped by month, cards by month, or a month grid where each event is a card like the Social calendar's. Your choice is remembered." },
      { target: ".ev-table, .soc-grid", title: "The events", body: "Open an event for its page: the ten-step checklist as a strip you can tick, the itinerary, results and links. Past events missing their feedback form, report or logged results are flagged as needing follow-up." },
      NEW,
    ],
  },
  socialCalendar: {
    title: "Social calendar",
    steps: [
      { target: ".soc-toolbar", title: "Months and tabs", body: "Step through the months. The tabs switch between the calendar, the Unscheduled tray and the Evergreen library of reusable copy." },
      { target: ".soc-filters", title: "Filter by channel, type and status", body: "Pills with counts for the month. Search dims the posts that don't match instead of hiding them, so a hit still reads against its week." },
      { target: ".soc-grid", title: "The month", body: "Each card is a post: the channel on its left edge, the status pill washing the card, the category, topic and owner. Drag a card to another day to reschedule; use + on a day to add a post there." },
      { target: ".soc-tray", title: "Unscheduled", body: "Posts planned for the month that don't have a day yet. Drop a card here to take it off the calendar." },
      NEW,
    ],
  },
  analytics: {
    title: "Analytics",
    steps: [
      { target: ".an-filters", title: "One row of filters", body: "Pick the team and the range; the quick pills set the common ranges. CSV and JSON export the filtered projects." },
      { target: ".an-stats", title: "The headline numbers", body: "Stat tiles for the section: counts turn red only when something is a problem, like overdue work or posts missing an asset. The gauges show tasks and milestones done." },
      { target: ".an-panel", title: "The charts", body: "Thin bars with the value at the end, so there's no axis to read. Hover a bar for its number. Further down: posts per month stacked by status, campaign milestones to watch and campaign progress." },
      NEW,
    ],
  },
  archived: {
    title: "Archive",
    steps: [
      { target: ".archive-filter", title: "Every team's archive", body: "Narrow to one team or see them all. Archived projects are filed away, not deleted: open one and click Unarchive to bring it back to its board." },
      { target: ".topbar .search", title: "Search the archive", body: "The same search as the board, across everything archived." },
      NEW,
    ],
  },
  project: {
    title: "Project",
    steps: [
      { target: ".item-band", title: "The project at a glance", body: "The name, team, brand and client, a countdown to the due date, status and priority chips, and the facts: due date, tasks done, who's assigned. Copy link shares the page." },
      { target: ".item-strip", title: "The lifecycle", body: "Planning, Active, On hold, Completed. Click a stage to move the project there." },
      { target: ".item-tabs", title: "Tabs", body: "Overview for the summary, Details for the full editor, Tasks to tick, rename and reorder, Comments for the thread with @-mentions, and Links for the campaigns and social posts this project feeds." },
      { target: ".item-grid-top", title: "Status and Ready when", body: "Change status, due date, priority and team here. Ready when lists what has to be true before the project is done, with a Mark completed button once it all is." },
      { target: ".item-grid-bottom", title: "Links and Manage", body: "The brief, linked campaigns and posts, and the archive and delete controls." },
      NEW,
    ],
  },
  campaign: {
    title: "Campaign",
    steps: [
      { target: ".item-band", title: "The campaign at a glance", body: "Brand, type and phase, a countdown to launch or the end, and the facts: dates, milestones done, owner and linked projects. Open the SharePoint page from here once it exists." },
      { target: ".item-strip", title: "Milestones as the strip", body: "Every milestone in date order, with its date and whether it's done, late or today. Click one to go to the Milestones tab." },
      { target: ".item-tabs", title: "Tabs", body: "Overview, Details (the editor, including milestones and the SharePoint page), Milestones to tick off, and the Projects doing the work." },
      { target: ".item-grid-main", title: "Up next and the schedule", body: "The next milestones to do, the campaign drawn as a timeline bar with its milestones and today, and the description." },
      { target: ".item-grid-bottom", title: "Manage", body: "Duplicate the campaign for a test or a template, work it as a webinar, or delete it." },
      NEW,
    ],
  },
  webinar: {
    title: "Webinar",
    steps: [
      { target: ".item-band", title: "The webinar at a glance", body: "Series and episode, type and delivery, a countdown to go-live, the stage and health, and the facts: go-live, recording, sections done, lead. Briefing document downloads sections 01, 02, 04 and 05 as Word. In a series, the episode pills switch episodes and Show all stacks every episode on the schedule." },
      { target: ".item-strip", title: "The nine kit sections", body: "Brief, Core message, Landing page, Speakers & assets, Runsheet, Pre-promo, Final checks, Post-promo, Results. Each shows its status and due date, counted back from go-live. Click one to open it." },
      { target: ".item-grid-main", title: "Schedule, details and team", body: "On the Overview: every section as a bar from start to due with the key dates above, the project-level details, and the team by role. Section owners come from these roles." },
      { target: ".item-grid-top", title: "Up next and activity", body: "The sections due soonest, and who did what recently." },
      { target: ".kit-sec-head, .item-tabs", title: "Working a section", body: "Inside a section: fill in its fields (speakers can be added from the speaker directory or saved to it), set its status and owner, change its due date if the kit's timing doesn't suit, tick off Ready when, and keep files, links and notes against it." },
      NEW,
    ],
  },
  event: {
    title: "Event",
    steps: [
      { target: ".item-band", title: "The event at a glance", body: "Division, region and financial year, a countdown to the event, the status and whether follow-up is owed, and the facts: dates, place, lead, checklist and spend. Generate or edit the itinerary from here." },
      { target: ".item-strip", title: "The checklist as the strip", body: "Ten steps from budget to logged results. Click a step to tick it. After the event, a missing feedback form, report or results shows as owed." },
      { target: ".item-tabs", title: "Tabs", body: "Overview, Details (the editor), Checklist, Itinerary (the attendee plan, put on SharePoint as a page) and Results." },
      { target: ".item-grid-top", title: "Status and Ready when", body: "Change the status here; a confirmed event turns live and done by its dates on its own. Ready when is the checklist's progress." },
      NEW,
    ],
  },
};

export function tourFor(key: string): Tour | null {
  return TOURS[key] ?? null;
}
