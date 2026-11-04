# Waypoint

Project management for the WiseTech Global creative teams — Design, Video, Marketing, Comms and Events — plus the marketing team's social media calendar, campaign planning and events.

Live app: **https://lachlan-odea.github.io/waypoint/** (installable as a PWA). Sign in with your WiseTech email.

When a new build is deployed, every open tab shows a toast and applies the update after a 30-second countdown (or on **Refresh now**), holding off while a modal is open or a field has focus (`src/components/UpdatePrompt.tsx`). Updates never sign anyone out: the Firebase session persists across the reload.

Version 3.0 is the Waypoint design system release: the Waypoint logo, the WiseTech palette and type, and projects, campaigns and events that open as full pages rather than windows.

## What it does

### Team boards
Each team has a board: a column per person, you first, with the team's campaigns above; drag a card between columns to reassign it (onto your own to claim it), or onto a team in the sidebar to move it across. Projects carry a client, brand, content types, priority, due date, a brief link, milestones and a comment thread with @-mentions and likes. The **Team** section collapses with the arrow beside its heading, and stays collapsed per browser. Sections below the board collect Planning, On hold, Completed and Cancelled work; the Archive spans every team.

The **+ New** menu in the header creates a project, a campaign, an event or a social post. Beside it, **Help** opens a guided tour of the page on screen: each step spotlights a part of the page and explains it, with the page still live underneath (`src/components/HelpTour.tsx`; the steps per page are in `src/helpTours.ts`).

### Pages
A project, a campaign or an event opens as its own page, at `#project/<id>/<tab>`, `#campaign/<id>/<tab>` or `#event/<id>/<tab>` (`src/router.ts`). Each page has the same shape (`src/components/pages/ItemPage.tsx`): breadcrumbs, a header band with the name, a countdown to the key date and the facts that matter, tabs, a stage strip, then the body as a main column with side cards for **Status & schedule**, **Ready when** (what has to be true before the item is done, with progress), **Links** and **Manage**.

- **Project** (`ProjectPage.tsx`): tabs Overview, Details, Tasks, Links. The strip is the lifecycle, Planning → Active → On hold → Completed; click a stage to move the project. Details is the full editor, inline.
- **Campaign** (`CampaignPage.tsx`): tabs Overview, Details, Milestones, Projects. The strip is the milestones in date order; the Overview draws the campaign as a timeline bar with its milestones and today.
- **Event** (`EventPage.tsx`): tabs Overview, Details, Checklist, Itinerary, Results. The strip is the ten-step checklist; click a step to tick it.

Tab changes replace the history entry, so Back always closes the page and returns to the list it came from. The editors (`ProjectDetailModal`, `CampaignModal`, `EventModal`) take an `inline` prop and render as the Details tab; the Campaigns and Events pages only open them as windows to create.

### My Desk
A personal start page built on the same shell as a campaign page (`ItemPage` in `src/components/pages/ItemPage.tsx`): a header band with the greeting, your day's numbers, your teams and a countdown to your next deadline (or how much is overdue); tabs; a strip of the week ahead with what's due and what's on your list each day; then the body. **Overview** is the attention cards, your next deadlines and the milestones on campaigns you own, with today's list and what needs you down the side. **My work** (`src/components/MyWork.tsx`) is every project assigned to you across every team, each card marked with its team, as a grid of your active projects or, with the Kanban switch, as columns for every status (Planning, Active, On hold, Completed, Cancelled) where dragging a card between columns changes its status, or as a List with the status changeable in place. **Checklist** is the private list, **Campaigns** (when you own one or your projects feed one) the campaigns you're part of, and **Notifications** what people have sent you plus anything flagged for your review. The desk remembers the tab you were on. **Desktop alerts** (switched on from the Notifications panel, `src/desktopNotifications.ts`) show a Windows notification with the Waypoint icon when someone @-mentions you, replies to you, likes your comment or hands you a task while the app is open; clicking it brings Waypoint to the front and opens the project's Comments tab. Unticked items roll forward each day (and say how many times they've rolled), reminders surface when their time arrives, and completed items sweep themselves out after a fortnight.

### Executive Dashboard and Analytics
The **Executive Dashboard** is the head of marketing's one page (`src/components/Dashboard.tsx`): stat tiles across every team and programme; **Programmes** (campaigns live and launching, webinars by stage with health, events with spend, results and follow-ups, and the Social calendar's month by status); **Big Rocks**, the live projects, open campaigns, published posts and events serving each of the team's strategic priorities; and **Teams and projects**, a by-team table beside the project status mix. Every row opens the thing it describes.

**Analytics** charts the work in three groups: Projects (by status, brand and content type), the Social calendar (posts per month, by category and by channel), and Campaigns (milestones to watch, campaign progress). Filter by team and date range, and export the filtered rows as CSV.

### Big Rocks
The **Big Rocks** are the few things the marketing team is working towards, as the Head of Marketing (any super user) defines them in Settings → Big Rocks or from the Big Rocks page's **Manage Big Rocks** button: a name, a line on what done looks like, a colour and an order (`BigRock` in `src/types.ts`, stored in `/bigRocks`). Campaigns, projects, social posts and events carry the rocks they serve (`bigRockIds`, picked as chips in their editors and on their Details tabs; shown as chips on campaign and project pages). Posts and events also pick up rocks through what they're linked to, by the rules in `src/bigRocks.ts`: a project counts for a rock when it's tagged itself or contributes to one of the rock's campaigns; a social post when it's tagged itself, promotes one of the rock's projects or was created by a milestone of one of the rock's campaigns; a webinar is a campaign with the kit; an event when it's tagged itself, is part of one of the rock's campaigns or one of the rock's projects does work for it.

The **Big Rocks** page (`src/components/BigRocksView.tsx`) is the report: stat tiles for how much of the live work serves a rock; a table with one row per rock (live projects, all projects, campaigns, webinars, posts and how many are published, events) plus a **Not on any rock** row for the live work nothing claims; and, for the selected row, the lists of projects (marked "via campaign" when attributed through one), campaigns and webinars, social posts and events, every row opening the item. The Executive Dashboard carries a Big Rocks panel with the same per-rock numbers. **Retiring** a rock takes it out of the pickers but keeps its reporting; **removing** one also takes the tag off every project, campaign, post and event that carried it (`saveBigRocks` in `src/firestore.ts`, one batch).

### Social calendar
The marketing team's LinkedIn plan as a month grid of post cards, seeded from the 2026 spreadsheet.

- Cards show the **channel** (CargoWise / WiseTech) on the left edge, a solid **status** pill (draft, pending, scheduled, published, cancelled) that also washes the card's background, an outlined **category** pill (Product – CargoWise, Thought Leadership, Event…), the topic, owner initials, and glyphs for an attached asset, CTA link, linked project or live LinkedIn post.
- Add a post from the toolbar, the `+` on any day, or the **+ New** menu; drag a card to another day to reschedule; drop it in the **Unscheduled** tray to take it off the calendar.
- Filter by channel, type and status (pills with counts); search dims non-matching posts rather than hiding them, so a hit is read against its week.
- The **Evergreen library** tab holds reusable copy; *Use this post* starts a fresh draft from it.
- The post editor previews assets (images inline, video, PDFs on request, SharePoint links when you're signed in), links the post to a board project, offers one-click company hashtags, and hands off to LinkedIn: **Post on LinkedIn** copies the text and opens LinkedIn's composer pre-filled, then **Mark as published** records it. Posting to the company pages through LinkedIn's API would need an approved developer app and a backend to hold its token, which don't exist yet.
- Linked posts appear in the project's detail window and open the calendar at that post.

### Campaigns
A campaign is a dated run with milestones, owned by a person picked from its team. The Campaigns page shows the month's campaigns either as **cards** or on a **calendar** grid (a per-browser choice, remembered), with the grid below the cards. Milestones show on the calendar and can be dragged between days. Filter by evergreen or dated runs, and export them as CSV. **Webinar** is a predefined campaign type — a campaign of that type is a webinar, from brief to on-demand recording.

**Evergreen campaigns.** Ticking **Evergreen campaign** in the editor makes a campaign always on: its dates are hidden (and kept, in case it's switched back), it's left off the Campaigns grid and the Social calendar overlay, along with its milestones, and it's listed under "This month's campaigns" in every month with an Evergreen tag. Its SharePoint page shows "Always on" in place of timings.

### Webinars
The Campaigns page has a third view, **Webinars**: the webinar pipeline. A webinar is a campaign of type Webinar with the 2026 webinar kit attached (`webinar` on the campaign document, modelled by `WebinarKit` in `src/types.ts`; the kit itself is defined in `src/webinarKit.ts`). **New webinar** asks for the name, series type (Thought Leadership, Product Deep Dive, Market Update), live or pre-recorded, go-live and recording dates, phase, series and episode, lead and brand, and previews the kit schedule before creating.

- **Pipeline** groups webinars by stage (Proposed → Planning → Production → Promotion → Post-event → Complete, plus On hold and Cancelled) or by series, with search, type, "My webinars" and parked filters. Each card shows the nine-section strip, go-live, what is due next and the lead.
- **Tracker** is a timeline of every active webinar with its section due dates, recording and go-live, and the due list grouped into Overdue, Next 7 days, 1–3 weeks and Later, filterable by team and "Assigned to me".
- **Results** compares webinars on registrants, attendees, attendance rate, page-to-registration, watch time and the format decision, with the learnings from section 09.
- **Speakers** is the speaker directory (`/speakers`, `Speaker` in `src/types.ts`): name, title and organisation, bio, headshot link, LinkedIn and email, with the webinars each has spoken on. On a webinar's speaker rows, **Add from the speaker directory** fills a row from a saved speaker and **Save to directory** saves a row for other webinars; a row keeps its own copy of the details and the speaker's id in `speakerId`.

A webinar's page carries the kit: the stage strip is the nine sections (Brief, Core message, Landing page, Speakers & assets, Runsheet, Pre-promo, Final checks, Post-promo, Results), each with its fields, a status, a due date counted back from go-live (scaled by the type's lead time, weekends snapped, overridable per section), an owner from the role's team, a **Ready when** list, and its own files, links and notes. The Overview shows what is up next, the section schedule, the project details, the team by role and recent activity. Changing the go-live date moves every due date and the campaign's **Webinar** milestone with it. **Start the next iteration** copies the brief, core message, speakers and run of show into a new webinar. **Briefing document** downloads a Word file of sections 01 Brief, 02 Core message, 04 Speakers, run of show & assets and 05 Runsheet & storyboard (`src/webinarBrief.ts`, built in the browser with the `docx` library, which loads only when asked for).

### Campaign milestones
Each milestone on a campaign has a type. The types are managed in Settings → Types & tags, so the team can add or rename them as needed (stored in `socialConfig.milestoneTypes`, modelled by `MilestoneType` in `src/types.ts`). A type marked **social** puts a draft post on the Social calendar when a milestone of that type is saved. **Webinar** is predefined as a milestone type (and as a campaign type): `resolveSocialConfig` in `src/constants.ts` always offers it, even when the saved lists predate it. The post has no category, channel "Other", and the campaign's name as its topic. The milestone then links to that post from the campaign card and the editor, with the post's status. Moving the milestone's date moves the post with it. Removing the milestone asks whether to delete its post too, and that happens when the campaign is saved. Deleting the post from the calendar leaves the milestone, showing "Post deleted". The logic lives in `isSocialMilestone` and `milestoneSocialPost` in `src/campaigns.ts`.

### Events
The events team's view of every trade show, conference and industry meeting — the CargoWise Event Portal's two year sheets (CargoWise and Landside) brought into Waypoint. One event is a `MarketingEvent` in `src/types.ts`, stored in `/events`; the page is `src/components/EventsView.tsx`, the editor `EventModal.tsx`, the helpers `src/events.ts`.

- The page shows one **year** at a time, as a **List** (a table grouped by month: dates, place, status, leads, campaign code, spend, comms, opps and checklist progress), as **Cards** by month, or as a **Calendar** month grid with a chip on every day an event runs. The choice is remembered per browser.
- **Status** is Prospect → Planning → Confirmed → Live → Done, or Cancelled. The stored status is what the team set; a confirmed event shows as Live while it's on and Done once it's over, by its dates (`eventPhase`). Filter by status, division (CargoWise / Landside), region and marketing lead; search matches names, places, people and campaign codes.
- A **KPI strip** sums the year: upcoming, live now, done, needs follow-up, spend in US dollars (converted at the portal's fixed rates, cancelled events excluded) and comms → opps with the cost per opp. The Live and Needs follow-up tiles are buttons that set the matching filter.
- Each event has a ten-step **checklist** (budget, booth, campaign code, travel, collateral, book-with-me link, lead scanning, feedback form, report, comms & opps logged). A past event missing any of the last three is flagged **needs follow-up**, which is also a filter.
- Dates can be a run, a month only ("Feb 2026, TBC") or fully TBC; TBC events are listed under their month or at the end of their year. Spend is entered in its own currency and shown in US dollars; results (comms, opps and opps by tier) are logged after the event. An event can link a Waypoint campaign and the board projects doing work for it.
- Export CSV downloads every event touching a date range, one row each, with its checklist and results.
- **Generate itinerary** on an event (its card, its row or its editor) opens the attendee itinerary: the event header, its cities, who's attending, the venue and stand, optional key contacts / stand shifts / shipping, then a timeline per day of meetings, stand & setup, meals & networking and sessions & speaking. The first draft comes from the event itself (a day per date, the stand open on each, the speaking slot, the leads). Travel and accommodation stay off the day timelines: every page says each attendee books their own, a check flags any day item that reads like a flight, hotel or transfer, and the page has its own Travel and accommodation section for attendees to record what they've booked. **Check & send** runs the automatic checks (every day planned and non-empty, venue and stand filled in, no travel, Attending names in the attendee list, each city named and coloured) and holds the manual ones. **Put on SharePoint** works exactly like a campaign's page (see below). Types live in `src/types.ts` (`EventItinerary`), helpers in `src/itinerary.ts`, the editor in `src/components/ItineraryModal.tsx`.

### Live event requests
The Video team's intake for live event support (town halls, hybrid streams, online-only events), requested by anyone in the company from the **Live event request form** on SharePoint. The form (`src/liveEventRequestForm.template.html`, built by `src/liveEventRequestExport.ts`) is the Live Events team's own wizard: who's asking, the event's date, times and audience numbers, the audience type and room, access, in-person presenters and mics, content (slides, videos, pre-recorded segments, dial-ins), Q&A and moderation, platform and timer, deliverables and where the recording is published, a facilities acknowledgement, the runsheet and recording-guide resources, then a review. It stands alone on SharePoint and names nothing of Waypoint; a half-finished form survives a refresh. Sending it writes one `LiveEventRequest` (`src/types.ts`) to `/liveEventRequests` through Firestore's REST API, without signing in, and the requester gets a reference, a PDF of what they sent and email buttons for a copy.

- **The panel.** The Video board (`LIVE_EVENT_REQUESTS_WORKSPACE_ID` in `src/constants.ts`) carries a **Live event requests** panel (`src/components/LiveEventRequestsPanel.tsx`) above the team's campaigns: Pending, Upcoming (approved events still ahead, by date, each with a one-line setup summary, which is the team's schedule), Declined and All. A card opens the request (`LiveEventRequestModal.tsx`): headline tiles, the setup line, a **For attention** list (unconfirmed dates, non-Sydney venues, public external audiences, unmoderated Q&A at scale, dial-ins, slide remotes, timers, recordings for attendees), the decision with a message to the requester, team notes, and every answer under a disclosure. **Approve** or **Decline** writes the decision onto the request; until the Entra app can send mail, the buttons draft the reply email (email app or Outlook on the web) from the decision and its message, and `confirmationSentAt` is reserved for the automatic confirmation. Helpers in `src/liveEventRequests.ts` keep the vocabulary in step with the form.
- **The calendar.** The panel's **Calendar** view is a month of the team's live events: approved events solid, pending ones dashed (declined don't show), with the team's **no-booking periods** shaded across their days (`LiveEventCalendar.tsx`). **Block out dates** (`LiveEventBlackoutModal.tsx`) saves a period with a reason to `/liveEventBlackouts`, and shows which events already sit inside it; a shaded period opens for editing or removal. The periods reach the form through `/liveEventPublic/{token}`, a copy of the dates and reasons under the current intake token that `App.tsx` rewrites whenever a period or the token changes; the form reads it on load, lists the periods under its date field, and refuses a date inside one (a requester who isn't sure of the date can still send). A pending request whose date is inside a period is flagged on its card and in its review.
- **Events the team adds.** **Add event** (`LiveEventAddModal.tsx`, also the + on a calendar day) puts an event on the calendar without a request, with the regulars (`TEAM_EVENT_PRESETS` in `src/liveEventRequests.ts`: Cake Day, AGM, Full Year Results, Half Year Results, each in the Events Space for Comms) one click away as a starting point, and the contact for each kept in the form settings (`presetContacts`, edited in the Request form dialog) rather than in this public source: it's stored as a `LiveEventRequest` that's already approved, with `source: "team"` and who added it, and the few things asked (name, date and times, audience, room, numbers, who it's for, team notes) written in the form's own shape (`teamEventJson`), so it lists, reviews and prints like a submission.
- **Setting up the form.** **Request form** on the panel (`LiveEventFormModal.tsx`) holds the form's settings in `/settings/liveEventIntake` (`LiveEventIntake`): the two mailboxes and the links behind its resource buttons (the blank and example runsheets, the OBS/webcam and phone recording guides, hosted on SharePoint), a download of `live-event-request.aspx` with those baked in, the upload steps, and the live copy's link. The first download issues the form's **intake token**; the rules accept a request only when its token matches the one in settings, so **Issue a new key** retires every copy already out there and a fresh download starts straight away.

### Settings
Dark mode, text size, profile photo, password. Super users also manage:

- **Users** — roles, team membership, locations.
- **Types & tags** — the shared lists behind the pickers: category types and company hashtags for the Social calendar, campaign milestone types, and content types. These open in a dedicated window.
- **Locations & time zones** — office locations, which drive the live clocks in the sidebar.
- **Big Rocks** — the team's strategic priorities: name, description, colour, order, and whether each is retired.

### Inbound integrations
- **Outlook add-in** — a separate repo. Opens the New project form pre-filled, either by `postMessage` into an open Waypoint window or by deep link (`/waypoint/?new=<base64 json>`).
- **Teams / Power Automate** — the `createProject` Cloud Function accepts a JSON project and a shared secret in the `X-Waypoint-Secret` header. See `functions/src/index.ts`.
- **Shared project links** — `/waypoint/?project=<id>`. The installed app captures these where the browser allows.

## Stack

| Layer | Choice |
| --- | --- |
| UI | React 19, TypeScript, Vite 8, hand-written CSS (`src/App.css`), Recharts, vite-plugin-pwa |
| Data | Firebase Firestore with offline persistence; live `onSnapshot` subscriptions throughout |
| Auth | Firebase Auth, email + password, restricted to the WiseTech email domain |
| Backend | Firebase Cloud Functions v2 on Node 20 (`functions/`): Teams ingest, reviewer-assigned emails via the Trigger Email extension |
| Hosting | GitHub Pages, deployed by `.github/workflows/deploy.yml` on every push to `main` |

### Design system
The reference is the Waypoint agent reference (the design system PDF). In code: the tokens at the top of `src/App.css` (`--wtg-*` brand colours, the `--ink-*` neutral scale, `--wp-status-*` work statuses, one `--radius` of 10px, no shadows, 120–200ms motion on `--ease`); the logo as `WaypointLogo` / `WaypointMark` in `src/components/brand/WaypointLogo.tsx` with the SVG lockups and app icon in `public/logos/` (regenerate with `node scripts/make-logos.mjs`) and the PNG icons the tab, installed app, iOS and desktop alerts use in `public/` (`node scripts/make-icons.mjs`, no image library needed); the line icons as `<Icon name="…">` in `src/components/Icon.tsx`, which renders a dashed placeholder for a name it does not know rather than inventing one; each team has its own sidebar icon (`src/workspaceIcon.ts`, keyed by workspace id, overridable by a workspace `icon` field); and the page styles in `src/pages.css`. Fonts are DM Sans and DM Mono only — mono for dates, counts, eyebrows and labels, never body copy.

Firestore collections: `designers`, `workspaces`, `projects`, `notifications`, `hubs`, `deskItems` (private per owner), `socialPosts`, `socialConfig`, `bigRocks`, `campaigns`, `campaignPages` (public copies behind SharePoint pages), `events`, `itineraryPages` (public copies of event itineraries behind their SharePoint pages). Types for every document live in `src/types.ts`; every read and write goes through `src/firestore.ts`.

## Running it locally

```bash
npm install
npm run dev        # http://localhost:5173/waypoint/
```

The Firebase web config in `src/firebase.ts` is a public project identifier, not a secret; access is gated by Firestore rules and sign-in. You sign in to the same project as production, so be deliberate about test data.

```bash
npm run build      # tsc -b && vite build → dist/
npm run lint       # eslint
npm run preview    # serve dist/
```

`npm run lint` currently reports a handful of pre-existing `react-hooks/set-state-in-effect` findings; new code should not add to them.

## Firebase

**Firestore rules** are in `firestore.rules` and are deployed by hand — paste them into the Firebase console (Firestore Database → Rules) or run:

```bash
firebase login
firebase deploy --only firestore:rules
```

A new collection is denied until its rule is live, so any PR that adds one says so.

**Cloud Functions** live in `functions/` (Node 20). Deploy with:

```bash
firebase deploy --only functions
```

`createProject` reads the `WAYPOINT_INGEST_SECRET` secret (`firebase functions:secrets:set WAYPOINT_INGEST_SECRET`). `notifyReviewerAssigned` writes to a `mail` collection watched by the Trigger Email extension, which is installed and configured in the console.

### Marketing activity page
One SharePoint page for people outside the marketing team. The home page is three doors, Campaigns, Webinars and Events, each with a count and what is live and coming up; a section lists its activities as cards grouped by month (Always on and dates-to-be-confirmed at the end), filterable by live / coming up / finished and by search, and Events also has a month calendar (`#events/calendar`, a link that can be shared) where each event spans the days it runs; click an activity and the same file shows its information page: a campaign's milestones with their asset links (ticked when delivered, never struck through), a webinar's go-live, speakers, summary, milestones and key dates, an event's dates, location, presence and people. Internal working detail never reaches the public copy: no projects, checklists, section statuses, spend, notes, itineraries or SharePoint working pages (see `activityPageData` in `src/activityExport.ts`). **Put activity on SharePoint** on the Executive Dashboard downloads `marketing-activity.aspx` (`src/activityExport.ts`, `src/activityPage.template.html`) and walks through uploading it; the page then fetches `/activityPages/{token}` on every open, which App rewrites after each campaign or event save. The token and the page's link live in `/settings/activityPage`.

### Campaign SharePoint pages (superseded)

Before the activity portal, each campaign could have its own SharePoint page (`src/campaignExport.ts`, `src/campaignPage.template.html`, public copy at `/campaignPages/{token}`). The UI for creating one is gone: every "open on SharePoint" action on a campaign, webinar or event now links to its page inside the marketing activity portal (`src/activityPortal.ts`, `ActivityPortalLink`), or offers to set the portal up. Campaigns that already have a page keep their `shareToken` and `sharePointUrl`, and App still refreshes their public copy on save, so those pages carry on working until they are retired.

### Event itinerary pages

The same arrangement as campaign pages, for an event's attendee itinerary. **Put on SharePoint** in the itinerary editor opens the same four-step guide; the first download gives the event an `itineraryShareToken`, and from then on every save of the itinerary (and of the event, since the page shows its name and dates) writes the page's data to `/itineraryPages/{itineraryShareToken}`. Deleting the event deletes it. The page (`src/itineraryPage.template.html`, built by `src/itineraryExport.ts`) shows a strip of the days, who's attending, the venue and stand, the other tables, the fixed travel-and-accommodation statement, a timeline per day with a mark per item type, and the fixed footer notes. Anyone reading the page can **add to a day** without signing in: a small form under each day takes their name, a time, a type and what's happening, and writes it through Firestore's REST API to `/itineraryPages/{token}/additions`, where the rules accept a create from anyone holding the token (every field checked and capped), refuse changes, and let only signed-in users delete. Additions show on the page straight away, marked with who added them, and appear in the itinerary editor under their day, where the organiser folds each into the itinerary or dismisses it. The page also has a **Travel and accommodation** section where each attendee enters their own flights, hotel and contact number (and can correct or remove them later) at `/itineraryPages/{token}/travel`, same rule but with updates and deletes allowed, so the whole team can see who arrives when and where everyone is staying. Travel still stays off the day timelines, and the editor lists the entries read-only with a Remove.

### Live event request form

The third kind of SharePoint page, and the only one that writes rather than reads: `src/liveEventRequestForm.template.html` is filled in by `src/liveEventRequestExport.ts` with the Firestore REST endpoint for `/liveEventRequests`, the intake token and the form's settings, and downloaded as `live-event-request.aspx`. A finished request is a single REST `POST` of eight string fields: the whole submission as `json`, the headline fields (`eventName`, `requesterName`, `requesterEmail`, `eventDate`, `createdAt`) the panel lists by, `status` (always `pending`) and `intakeToken`. The rules take that create from anyone, but only with exactly those fields, each capped, and only when the token equals `/settings/liveEventIntake.token`; nothing unauthenticated can read a request back, and only signed-in users create freely (the team's own events), update or delete. The form's one read is `/liveEventPublic/{token}`, the no-booking periods, public under the unguessable token the way campaign and itinerary pages are. Rotating the token from the panel's form set-up retires every downloaded copy at once.

The rules are not deployed by CI (`deploy.yml` only publishes the site), so a change to `firestore.rules` goes live with `firebase deploy --only firestore:rules` from a signed-in Firebase CLI. Until the `/liveEventRequests` block is live, Firestore refuses every create with the same `PERMISSION_DENIED` it gives a retired copy, and the form can't tell the two apart; **Send a test request** in the form set-up dialog can, because it posts with the current token.

**Seeding.** On first sign-in the app creates anything missing: the seed teams (`SEED_WORKSPACES`), the seed locations (`SEED_HUBS`), and — only if the collection is completely empty — the 2026 social calendar from `src/data/socialPostsSeed.json` and the events from `src/data/eventsSeed.json`. Edits and deletions after that stick. Both seeds are also available from the empty-state Import button on their page.

## Regenerating the social calendar seed

`scripts/social-calendar-xlsx-to-seed.py` converts the marketing team's `Social Media Calendar 2026.xlsx` into `src/data/socialPostsSeed.json`. It needs Python with `openpyxl`:

```bash
pip install openpyxl
python scripts/social-calendar-xlsx-to-seed.py "path/to/Social Media Calendar 2026.xlsx"
```

The script's docstring explains how the sheet is read (the coloured cell is the publish day; undated rows take a date from their Notes where one is written). Document ids are derived from sheet and row, so re-running is idempotent.

## Regenerating the events seed

`scripts/event-portal-md-to-seed.py` converts a CargoWise Event Portal export (the Markdown file the portal produces) into `src/data/eventsSeed.json`. Standard library only:

```bash
python scripts/event-portal-md-to-seed.py "path/to/CargoWise-Event-Portal-Export.md"
```

It reads the per-event detail tables, turns the portal's date wordings into `startDate`/`endDate`, a `tbcMonth` or just a year, and the checklist line into the ten booleans. Email addresses are stripped from the partner-attendee field, since the seed is committed. Document ids are derived from the year and the event name, so re-running is idempotent. Remember the seed only loads into an empty `/events` collection; to replace what's there, delete the collection first.

## Conventions

- Work goes on a branch and through a pull request; nothing is pushed straight to `main`. Merging to `main` deploys.
- Don't stack a PR on another open branch — if both merge together the second lands in the first's branch, not `main`.
- Super-user gating is enforced in the UI, not in Firestore rules: any signed-in user can technically write most collections. That's the right trade for a small trusted team; tighten the rules before opening the app to anyone else.
- Stored values that are displayed differently (e.g. project status `paused` → "On hold") are rendered through helpers in `src/constants.ts`, never printed raw.
- Dates are local calendar dates (`YYYY-MM-DD`) handled through `src/dates.ts`; timestamps are ISO strings.
