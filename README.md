# Waypoint

Project management for the WiseTech Global creative teams — Design, Video, Marketing and Comms — plus the marketing team's social media calendar.

Live app: **https://lachlan-odea.github.io/waypoint/** (installable as a PWA). Sign in with your WiseTech email.

## What it does

### Team boards
Each team has a board. Your own work sits at the top, then a column per teammate; drag a card between columns to reassign it, or onto a team in the sidebar to move it across. Projects carry a client, brand, content types, priority, due date, a brief link, milestones and a comment thread with @-mentions and likes. Sections below the board collect Planning, On hold and Completed work; the Archive spans every team.

### My Desk
A personal start page: your assigned projects, anything flagged for your review, your notifications, and a private checklist. Unticked items roll forward each day (and say how many times they've rolled), reminders surface when their time arrives, and completed items sweep themselves out after a fortnight.

### Executive Dashboard and Analytics
A read-only view across every team — deadlines, recent activity, overdue work — and charts breaking the work down by priority, brand, content type and designer (the by-designer chart is super-users only). Filter by team and date range, and export the filtered projects as CSV.

### Social calendar
The marketing team's LinkedIn plan as a month grid of post cards, seeded from the 2026 spreadsheet.

- Cards show the **channel** (CargoWise / WiseTech) on the left edge, a solid **status** pill (draft, pending, scheduled, published, cancelled) that also washes the card's background, an outlined **category** pill (Product – CargoWise, Thought Leadership, Event…), the topic, owner initials, and glyphs for an attached asset, CTA link, linked project or live LinkedIn post.
- Add a post from the toolbar or the `+` on any day; drag a card to another day to reschedule; drop it in the **Unscheduled** tray to take it off the calendar.
- Filter by channel, type and status (pills with counts); search dims non-matching posts rather than hiding them, so a hit is read against its week.
- The **Evergreen** tab holds reusable copy; *Use this post* starts a fresh draft from it.
- The post editor previews assets (images inline, video, PDFs on request, SharePoint links when you're signed in), links the post to a board project, offers one-click company hashtags, and hands off to LinkedIn: **Post on LinkedIn** copies the text and opens LinkedIn's composer pre-filled, then **Mark as published** records it. Posting to the company pages through LinkedIn's API would need an approved developer app and a backend to hold its token, which don't exist yet.
- Linked posts appear in the project's detail window and open the calendar at that post.

### Settings
Dark mode, text size, profile photo, password. Super users also manage users (roles, team membership, locations), office locations and their time zones (which drive the live clocks in the sidebar), and the Social calendar's categories and company hashtags.

### Inbound integrations
- **Outlook add-in** — a separate repo. Opens the New project form pre-filled, either by `postMessage` into an open Waypoint window or by deep link (`/waypoint/?new=<base64 json>`).
- **Teams / Power Automate** — the `createProject` Cloud Function accepts a JSON project and a shared secret header. See `functions/src/index.ts`.
- **Shared project links** — `/waypoint/?project=<id>`. The installed app captures these where the browser allows.

## Stack

| Layer | Choice |
| --- | --- |
| UI | React 19, TypeScript, Vite 8, hand-written CSS (`src/App.css`), Recharts |
| Data | Firebase Firestore with offline persistence; live `onSnapshot` subscriptions throughout |
| Auth | Firebase Auth, email + password |
| Backend | Firebase Cloud Functions v2 (`functions/`): Teams ingest, reviewer-assigned emails via the Trigger Email extension |
| Hosting | GitHub Pages, deployed by `.github/workflows/deploy.yml` on every push to `main` |

Firestore collections: `designers`, `workspaces`, `projects`, `notifications`, `hubs`, `deskItems` (private per owner), `socialPosts`, `socialConfig`. Types for every document live in `src/types.ts`; every read and write goes through `src/firestore.ts`.

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

**Seeding.** On first sign-in the app creates anything missing: the seed teams (`SEED_WORKSPACES`), the seed locations (`SEED_HUBS`), and — only if the collection is completely empty — the 2026 social calendar from `src/data/socialPostsSeed.json`. Edits and deletions after that stick. The social seed is also available from the empty-state Import button on the calendar.

## Regenerating the social calendar seed

`scripts/social-calendar-xlsx-to-seed.py` converts the marketing team's `Social Media Calendar 2026.xlsx` into `src/data/socialPostsSeed.json`. It needs Python with `openpyxl`:

```bash
pip install openpyxl
python scripts/social-calendar-xlsx-to-seed.py "path/to/Social Media Calendar 2026.xlsx"
```

The script's docstring explains how the sheet is read (the coloured cell is the publish day; undated rows take a date from their Notes where one is written). Document ids are derived from sheet and row, so re-running is idempotent.

## Conventions

- Work goes on a branch and through a pull request; nothing is pushed straight to `main`. Merging to `main` deploys.
- Don't stack a PR on another open branch — if both merge together the second lands in the first's branch, not `main`.
- Super-user gating is enforced in the UI, not in Firestore rules: any signed-in user can technically write most collections. That's the right trade for a small trusted team; tighten the rules before opening the app to anyone else.
- Stored values that are displayed differently (e.g. project status `paused` → "On hold") are rendered through helpers in `src/constants.ts`, never printed raw.
- Dates are local calendar dates (`YYYY-MM-DD`) handled through `src/dates.ts`; timestamps are ISO strings.
