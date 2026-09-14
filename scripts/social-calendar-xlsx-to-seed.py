"""
Convert the marketing team's "Social Media Calendar 2026.xlsx" workbook into
src/data/socialPostsSeed.json, the file seedSocialPostsIfMissing() in
src/firestore.ts writes into the /socialPosts collection on first use.

    python scripts/social-calendar-xlsx-to-seed.py "path/to/Social Media Calendar 2026.xlsx"

Requires openpyxl (pip install openpyxl).

Workbook shape, one sheet per month plus an "evergreen" library:

  * Row 1 holds the month title ("February 2026"); the header row is the one
    whose column A reads "Channel". Text columns are Channel, [Owner], Topic,
    Copy, Screenshot, Asset, CTA Link, Status, Notes.
  * The remaining header cells are day numbers 1..31. The publish day of a
    post is the cell in its row that has been filled with a colour: green
    for published, pink for pending, red for pulled. The colour of the cell
    is the calendar; the Status column is what the team typed. Where they
    disagree the Status column wins except for red, which always means
    cancelled.
  * A row with no coloured cell is unscheduled. When its Notes name a date
    ("September 21 AEST", "Scheduled 26 May 9AM", "16/7") we use that,
    otherwise the post is left undated and shows in the month's
    "Unscheduled" tray.
  * The evergreen sheet has its own header row (Created, Channel, Topic,
    Copy, Asset, CTA Link, Status) and every row is a reusable "backlog"
    post filed under the month it was created.

Document ids are derived from sheet + row so re-running this script and
re-seeding is idempotent.
"""
import json
import re
import sys
from pathlib import Path

import openpyxl

YEAR = 2026
MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]
MONTH_ABBR = {m[:3].lower(): i + 1 for i, m in enumerate(MONTHS)}

# Cell fills that carry meaning. Anything else (weekend grey, white, none) is
# not a scheduled day.
FILL_PUBLISHED = "FF00B050"
FILL_PENDING = "FFC04080"
FILL_CANCELLED = "FFFF0000"
MEANINGFUL_FILLS = {FILL_PUBLISHED, FILL_PENDING, FILL_CANCELLED}

STATUS_MAP = {
    "published": "published",
    "pending": "pending",
    "scheduled": "scheduled",
    "backlog": "backlog",
    "draft": "draft",
    "cancelled": "cancelled",
    "canceled": "cancelled",
}

CHANNEL_FIXES = {
    "cargowiise": "CargoWise",
    "cargowise": "CargoWise",
    "wisetech": "WiseTech",
    "wtg": "WiseTech",
    "wisetech global": "WiseTech",
}


def clean(v) -> str:
    if v is None:
        return ""
    s = str(v)
    if s.strip() in ("#VALUE!", "#REF!", "#N/A"):
        return ""
    return s.strip()


def one_line(v) -> str:
    return re.sub(r"\s+", " ", clean(v)).strip()


def normalise_channel(v) -> str:
    s = one_line(v)
    return CHANNEL_FIXES.get(s.lower(), s)


def normalise_status(v, fill) -> str:
    if fill == FILL_CANCELLED:
        return "cancelled"
    s = one_line(v).lower()
    return STATUS_MAP.get(s, "draft")


def iso(month: int, day: int) -> str:
    return f"{YEAR:04d}-{month:02d}-{day:02d}"


MONTH_WORD = "|".join(MONTHS + [m[:3] for m in MONTHS] + ["Sept"])
DATE_WORDS = re.compile(rf"\b({MONTH_WORD})\.?\s+(\d{{1,2}})\b", re.IGNORECASE)
DATE_WORDS_REV = re.compile(rf"\b(\d{{1,2}})\s+({MONTH_WORD})\b", re.IGNORECASE)
DATE_NUMERIC = re.compile(r"\b(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?\b")


def date_from_notes(notes: str) -> str:
    """Best-effort publish date from free-text notes; '' if none found."""
    if not notes:
        return ""
    m = DATE_WORDS.search(notes)
    if m:
        month = MONTH_ABBR.get(m.group(1)[:3].lower())
        day = int(m.group(2))
        if month and 1 <= day <= 31:
            return iso(month, day)
    m = DATE_WORDS_REV.search(notes)
    if m:
        month = MONTH_ABBR.get(m.group(2)[:3].lower())
        day = int(m.group(1))
        if month and 1 <= day <= 31:
            return iso(month, day)
    m = DATE_NUMERIC.search(notes)
    if m:
        day, month = int(m.group(1)), int(m.group(2))
        if 1 <= month <= 12 and 1 <= day <= 31:
            return iso(month, day)
    return ""


def month_from_title(title: str):
    for i, name in enumerate(MONTHS):
        if title.lower().startswith(name.lower()):
            return i + 1
    return None


def cell_fill(cell):
    if cell.fill is None or cell.fill.fill_type != "solid":
        return None
    rgb = cell.fill.fgColor.rgb
    return rgb if isinstance(rgb, str) else None


def read_month_sheet(ws) -> list:
    month = month_from_title(clean(ws.cell(1, 1).value))
    if month is None:
        raise SystemExit(f"{ws.title}: couldn't read a month from A1")
    header_row = next(
        (r for r in range(1, 8) if clean(ws.cell(r, 1).value) == "Channel"), None
    )
    if header_row is None:
        raise SystemExit(f"{ws.title}: no header row")

    text_cols = {}
    day_cols = {}
    for c in range(1, ws.max_column + 1):
        v = ws.cell(header_row, c).value
        if v is None:
            continue
        if isinstance(v, (int, float)):
            day_cols[int(v)] = c
        else:
            text_cols[one_line(v).rstrip(":").lower()] = c

    def text(r: int, name: str) -> str:
        c = text_cols.get(name)
        return clean(ws.cell(r, c).value) if c else ""

    posts = []
    for r in range(header_row + 1, ws.max_row + 1):
        channel = normalise_channel(text(r, "channel"))
        topic = one_line(text(r, "topic"))
        copy = text(r, "copy")
        if not channel and not topic and not copy:
            continue

        days = []
        for day, c in day_cols.items():
            fill = cell_fill(ws.cell(r, c))
            if fill in MEANINGFUL_FILLS:
                days.append((day, fill))

        notes = text(r, "notes")
        base = {
            "month": f"{YEAR:04d}-{month:02d}",
            "channel": channel,
            "topic": topic,
            "copy": copy,
            "screenshot": text(r, "screenshot"),
            "asset": text(r, "asset"),
            "ctaLink": text(r, "cta link"),
            "notes": notes,
            "owner": one_line(text(r, "owner")),
            "evergreen": False,
        }

        if not days:
            posts.append({
                "id": f"sp-{YEAR}-{month:02d}-r{r}",
                "date": date_from_notes(notes),
                "status": normalise_status(text(r, "status"), None),
                **base,
            })
            continue

        for i, (day, fill) in enumerate(sorted(days)):
            suffix = "" if i == 0 else f"-{i + 1}"
            posts.append({
                "id": f"sp-{YEAR}-{month:02d}-r{r}{suffix}",
                "date": iso(month, day),
                "status": normalise_status(text(r, "status"), fill),
                **base,
            })
    return posts


def read_evergreen_sheet(ws) -> list:
    header_row = next(
        (r for r in range(1, 12) if clean(ws.cell(r, 1).value) == "Created"), None
    )
    if header_row is None:
        raise SystemExit(f"{ws.title}: no header row")
    cols = {
        one_line(ws.cell(header_row, c).value).lower(): c
        for c in range(1, ws.max_column + 1)
        if ws.cell(header_row, c).value is not None
    }

    def text(r: int, name: str) -> str:
        c = cols.get(name)
        return clean(ws.cell(r, c).value) if c else ""

    posts = []
    for r in range(header_row + 1, ws.max_row + 1):
        channel = normalise_channel(text(r, "channel"))
        topic = one_line(text(r, "topic"))
        copy = text(r, "copy")
        if not channel and not topic and not copy:
            continue
        created = month_from_title(text(r, "created"))
        month = f"{YEAR:04d}-{created:02d}" if created else ""
        posts.append({
            "id": f"sp-evergreen-r{r}",
            "month": month,
            "date": "",
            "channel": channel,
            "topic": topic,
            "copy": copy,
            "screenshot": "",
            "asset": text(r, "asset"),
            "ctaLink": text(r, "cta link"),
            "status": normalise_status(text(r, "status") or "backlog", None),
            "notes": "",
            "owner": "",
            "evergreen": True,
        })
    return posts


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    src = Path(sys.argv[1])
    repo = Path(__file__).resolve().parent.parent
    out = repo / "src" / "data" / "socialPostsSeed.json"

    wb = openpyxl.load_workbook(src, data_only=True)
    posts = []
    for ws in wb.worksheets:
        if ws.title.strip().lower() == "evergreen":
            posts.extend(read_evergreen_sheet(ws))
        else:
            posts.extend(read_month_sheet(ws))

    ids = [p["id"] for p in posts]
    assert len(ids) == len(set(ids)), "duplicate ids"

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps(posts, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )
    dated = sum(1 for p in posts if p["date"])
    evergreen = sum(1 for p in posts if p["evergreen"])
    print(
        f"wrote {len(posts)} posts to {out.relative_to(repo)} "
        f"({dated} dated, {len(posts) - dated} unscheduled, {evergreen} evergreen)"
    )


if __name__ == "__main__":
    main()
