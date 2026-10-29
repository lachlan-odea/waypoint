"""
Convert a CargoWise Event Portal export (the Markdown file the portal
produces, e.g. "CargoWise-Event-Portal-Export.md") into
src/data/eventsSeed.json, the file seedEventsIfMissing() in src/firestore.ts
writes into the /events collection on first use.

    python scripts/event-portal-md-to-seed.py "path/to/CargoWise-Event-Portal-Export.md"

No dependencies beyond the standard library.

Export shape: a summary, one table per year, then "### <year> event
details", under which every event is a "#### <name>" heading followed by a
two-column "| Field | Value |" table. Only the detail sections are read —
they carry everything the year tables show and more.

Fields are mapped onto MarketingEvent in src/types.ts. Dates come in four
shapes ("21–23 Jan 2026 (FY26)", "30 Mar – 2 Apr 2026 (FY26)", "Feb 2026
(TBC) (FY26)", "TBC") and become startDate/endDate, a tbcMonth, or just the
year. The checklist line ("7/10 — ☑ Budget approved; ☐ …") becomes the ten
booleans. Email addresses are stripped from the partner-attendee field so
the seed, which is committed, doesn't carry them.

Document ids are derived from the year and the event name, so re-running
this script and re-seeding is idempotent.
"""
import json
import re
import sys
from pathlib import Path

MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "sept": 9, "oct": 10, "nov": 11, "dec": 12,
}

CHECKLIST_KEYS = {
    "Budget approved": "budgetApproved",
    "Booth / tickets booked": "boothBooked",
    "Campaign code created": "campaignCodeCreated",
    "Travel & accommodation": "travelBooked",
    "Collateral & presentation": "collateralReady",
    "Book-with-me link live": "bookWithMeLive",
    "Lead scanning arranged": "leadScanningArranged",
    "Feedback form sent": "feedbackFormSent",
    "Event report filed": "reportFiled",
    "Comms & opps logged": "resultsLogged",
}

STATUS_MAP = {
    "prospect": "prospect",
    "planning": "planning",
    "confirmed": "confirmed",
    "live": "live",
    "done": "done",
    "cancelled": "cancelled",
    "canceled": "cancelled",
}

EMAIL = re.compile(r"\s*<[^<>@\s]+@[^<>\s]+>|\b[^\s<>@;]+@[^\s<>;]+\.\w+\b")
DASH = re.compile(r"\s*[–—-]\s*")


def clean(s: str) -> str:
    s = s.strip()
    return "" if s in ("—", "-", "") else s


def iso(year: int, month: int, day: int) -> str:
    return f"{year:04d}-{month:02d}-{day:02d}"


def month_num(word: str) -> int:
    m = MONTHS.get(word.strip().lower()[:4]) or MONTHS.get(word.strip().lower()[:3])
    if not m:
        raise SystemExit(f"Unknown month {word!r}")
    return m


def parse_dates(value: str, section_year: int) -> dict:
    """startDate/endDate/tbcMonth/year from the portal's Dates field."""
    v = re.sub(r"\s*\(FY\d+\)\s*$", "", clean(value)).strip()
    if not v or v.upper() == "TBC":
        return {"startDate": "", "endDate": "", "year": section_year}
    m = re.fullmatch(r"(\w+)\s+(\d{4})\s*\(TBC\)", v)
    if m:
        year = int(m.group(2))
        return {
            "startDate": "",
            "endDate": "",
            "tbcMonth": f"{year:04d}-{month_num(m.group(1)):02d}",
            "year": year,
        }
    # "30 Mar – 2 Apr 2026"
    m = re.fullmatch(r"(\d{1,2})\s+(\w+)\s*[–—-]\s*(\d{1,2})\s+(\w+)\s+(\d{4})", v)
    if m:
        year = int(m.group(5))
        start_month = month_num(m.group(2))
        end_month = month_num(m.group(4))
        # A run that crosses New Year ("30 Dec – 2 Jan 2027") ends in the
        # stated year and starts in the one before.
        start_year = year - 1 if start_month > end_month else year
        return {
            "startDate": iso(start_year, start_month, int(m.group(1))),
            "endDate": iso(year, end_month, int(m.group(3))),
            "year": section_year,
        }
    # "21–23 Jan 2026"
    m = re.fullmatch(r"(\d{1,2})\s*[–—-]\s*(\d{1,2})\s+(\w+)\s+(\d{4})", v)
    if m:
        year = int(m.group(4))
        month = month_num(m.group(3))
        return {
            "startDate": iso(year, month, int(m.group(1))),
            "endDate": iso(year, month, int(m.group(2))),
            "year": section_year,
        }
    # "4 Mar 2026"
    m = re.fullmatch(r"(\d{1,2})\s+(\w+)\s+(\d{4})", v)
    if m:
        year = int(m.group(3))
        d = iso(year, month_num(m.group(2)), int(m.group(1)))
        return {"startDate": d, "endDate": d, "year": section_year}
    raise SystemExit(f"Couldn't read dates {value!r}")


def parse_yes_no(value: str):
    """("Yes — note") → (True, "note"); "" → (None, "")."""
    v = clean(value)
    if not v:
        return None, ""
    parts = DASH.split(v, maxsplit=1)
    head = parts[0].strip().lower()
    note = parts[1].strip() if len(parts) > 1 else ""
    if head.startswith("y"):
        return True, note
    if head.startswith("n"):
        return False, note
    # Free text with no yes/no in front: keep it as the note.
    return None, v


def parse_money(value: str):
    """"43,245.00 EUR" → (43245.0, "EUR")."""
    v = clean(value)
    if not v:
        return None, None
    m = re.fullmatch(r"≈?\s*([\d,]+(?:\.\d+)?)\s*([A-Z]{3})?", v)
    if not m:
        raise SystemExit(f"Couldn't read money {value!r}")
    amount = float(m.group(1).replace(",", ""))
    return amount, (m.group(2) or "USD")


def parse_int(value: str):
    v = clean(value)
    if not v:
        return None
    m = re.match(r"\d+", v.replace(",", ""))
    return int(m.group(0)) if m else None


def parse_opps(value: str):
    """"8 (2 Delta · 2 Gold · 2 Silver)" → (8, "2 Delta · 2 Gold · 2 Silver")."""
    v = clean(value)
    if not v:
        return None, ""
    m = re.fullmatch(r"(\d+)\s*(?:\((.*)\))?", v)
    if not m:
        return parse_int(v), ""
    return int(m.group(1)), (m.group(2) or "").strip()


def parse_checklist(value: str) -> dict:
    out = {key: False for key in CHECKLIST_KEYS.values()}
    for mark, label in re.findall(r"([☑☐])\s*([^;]+)", value):
        key = CHECKLIST_KEYS.get(label.strip())
        if key is None:
            raise SystemExit(f"Unknown checklist item {label!r}")
        out[key] = mark == "☑"
    return out


def slug(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s[:48].rstrip("-") or "event"


def read_sections(text: str) -> list:
    """[(year, name, {field: value})] for every event detail block."""
    events = []
    year = None
    # The year of the event being read: the last event of a year is only
    # appended when the next heading arrives, by which time `year` may
    # already have moved on.
    event_year = None
    name = None
    fields = None
    for line in text.splitlines():
        m = re.match(r"^### (\d{4}) event details\s*$", line)
        if m:
            year = int(m.group(1))
            continue
        if re.match(r"^## ", line):
            # Past the detail sections of this year; the next "###" sets a new one.
            year = None
        if year is None:
            continue
        m = re.match(r"^#### (.+?)\s*$", line)
        if m:
            if name is not None:
                events.append((event_year, name, fields))
            event_year = year
            name = m.group(1)
            fields = {}
            continue
        m = re.match(r"^\|\s*(.+?)\s*\|\s*(.*?)\s*\|\s*$", line)
        if m and fields is not None and m.group(1) not in ("Field", "---"):
            fields[m.group(1)] = m.group(2)
    if name is not None:
        events.append((event_year, name, fields))
    return events


def convert(year: int, name: str, f: dict) -> dict:
    status = STATUS_MAP.get(clean(f.get("Status", "")).lower())
    if status is None:
        raise SystemExit(f"{name}: unknown status {f.get('Status')!r}")
    dates = parse_dates(f.get("Dates", ""), year)
    sponsor, sponsor_note = parse_yes_no(f.get("Sponsor", ""))
    booth, booth_note = parse_yes_no(f.get("Booth", ""))
    attend, _ = parse_yes_no(f.get("Attend & sell / visitor", ""))
    investment, currency = parse_money(f.get("Investment", ""))
    usd, _ = parse_money(f.get("In US dollars", ""))
    opps, opps_breakdown = parse_opps(f.get("Opps", ""))

    event = {
        "id": f"ev-{year}-{slug(name)}",
        "name": name,
        "status": status,
        **dates,
        "division": clean(f.get("Division", "")) or "CargoWise",
        "checklist": parse_checklist(f.get("Checklist", "")),
        "projectIds": [],
    }

    def put(key, value):
        if value is None or value == "":
            return
        event[key] = value

    put("datesAsPublished", clean(f.get("Dates as published", "")))
    put("region", clean(f.get("Region", "")))
    put("location", clean(f.get("Location", "")))
    put("audience", clean(f.get("Audience", "")))
    put("sponsor", sponsor)
    put("sponsorNote", sponsor_note)
    put("booth", booth)
    put("boothNote", booth_note)
    put("attendAndSell", attend)
    put("speakingOpportunity", clean(f.get("Speaking opportunity", "")))
    put("marketingLead", clean(f.get("Marketing lead", "")))
    put("salesLead", clean(f.get("Sales lead", "")))
    put("salesAttendeeCount", parse_int(f.get("Number of sales attendees", "")))
    put("salesAttendees", clean(f.get("Sales attendees", "")))
    put("academyAttendee", clean(f.get("WiseTech Academy attendee", "")))
    partners = EMAIL.sub("", clean(f.get("CargoWise partner attendees", "")))
    put("partnerAttendees", re.sub(r"\s+;", ";", partners).strip(" ;"))
    put("campaignCode", clean(f.get("Campaign code", "")))
    put("presentation", clean(f.get("General presentation", "")))
    put("feedbackDoc", clean(f.get("Event feedback", "")))
    put("investment", investment)
    put("currency", currency)
    put("investmentUsd", usd)
    put("costDetails", clean(f.get("Cost details", "")))
    put("comms", parse_int(f.get("Comms", "")))
    put("opps", opps)
    put("oppsBreakdown", opps_breakdown)
    return event


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    src = Path(sys.argv[1])
    repo = Path(__file__).resolve().parent.parent
    out = repo / "src" / "data" / "eventsSeed.json"

    sections = read_sections(src.read_text(encoding="utf-8"))
    if not sections:
        raise SystemExit("No '### <year> event details' sections found")
    events = [convert(year, name, fields) for year, name, fields in sections]

    # Two events can share a name within a year (the portal allows it); keep
    # both with a numbered id rather than losing one.
    seen = {}
    for e in events:
        n = seen.get(e["id"], 0)
        seen[e["id"]] = n + 1
        if n:
            e["id"] = f"{e['id']}-{n + 1}"
    assert len({e["id"] for e in events}) == len(events), "duplicate ids"

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps(events, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )
    dated = sum(1 for e in events if e["startDate"])
    tbc_month = sum(1 for e in events if e.get("tbcMonth"))
    by_year = {}
    for e in events:
        by_year[e["year"]] = by_year.get(e["year"], 0) + 1
    print(
        f"wrote {len(events)} events to {out.relative_to(repo)} "
        f"({dated} dated, {tbc_month} month-only, {len(events) - dated - tbc_month} TBC; "
        + ", ".join(f"{y}: {n}" for y, n in sorted(by_year.items()))
        + ")"
    )


if __name__ == "__main__":
    main()
