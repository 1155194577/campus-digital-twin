"""Generate the static timetable from a checkout of the pinned CUHK catalog."""

import json
import re
import subprocess
import sys
from datetime import date, timedelta
from pathlib import Path

REVISION = "427933d410e071917791b246fe1a17012e481e93"
ROOT = Path(__file__).resolve().parents[1]

VENUES = {
    "Yasumoto Int'l Acad Park": "way/201907981",
    "Lee Shau Kee Building": "way/188010216",
    "Wu Ho Man Yuen Bldg": "way/201907994",
    "Esther Lee Bldg": "way/135156233",
    "T.C. Cheng Bldg": "relation/3086286/135193912",
    "Cheng Yu Tung Building": "way/185266979",
    "William M W Mong Eng Bldg": "way/135311808",
    "William MW Mong Eng Bldg": "way/135311808",
    "Mong Man Wai Bldg": "way/134410719",
    "Science Centre": "way/134410450",
    "Science Center": "way/134410450",
    "Science Ctr East Block": "way/134410447",
    "Lady Shaw Bldg": "relation/1806438/134409112",
    "Wong Foo Yuan Bldg": "way/138223977",
    "Chen Kou Bun Bldg": "way/138223979",
    "Y.C. Liang Hall": "way/185740160",
    "Humanities Building": "way/134408690",
    "Lee Shau Kee Archi Bldg": "way/201907977",
    "ARC Bldg": "way/201907977",
    "Hui Yeung Shing Bldg": "way/135181545",
    "Sino Building": "way/138223978",
    "Tsang Shiu Tim Bldg": "way/135193164",
    "Ho Tim Building": "way/135156235",
    "Basic Med Sci Bldg": "way/134410448",
    "Cheng Ming Building": "way/134408689",
    "Li Dak Sum Building": "way/188010213",
    "Leung Kau Kui Bldg": "way/135265381",
    "Li Koon Chun Hall": "way/135098351",
    "Fung King Hey Bldg": "way/135265380",
    "Ho Sin-Hang Engg Bldg": "way/135312912",
    "Institute of Chin Studies": "relation/2096073/134410717",
    "University Gymnasium": "way/135191010",
    "Kwok Sports Bldg": "way/135182311",
    "LKS Intg Biomed Sci Bldg": "relation/2532440/188007442",
    "CC College Theology Bldg": "way/135311810",
    "Fok Ying Tung RS Sci. Bldg": "way/135904891",
    "Shaw College LT": "way/135904507",
    "Wen Lan Tang": "way/135904506",
    "Pres Chi-tung Yung MBldg": "way/219389532",
    "President Chi-tung Yung MBldg": "way/219389532",
    "Pi-Ch'iu Building": "way/107139024",
    "Li Wai Chun,": "way/135098352",
    "Chung Chi College Chapel": "way/135156315",
    "Table Tennis Rm, U Sport Centr": "way/134820401",
    "Covered Playgrd, U Sport Centr": "way/134820401",
    "Academic Building I": "way/135311802",
    "Sir Run Run Shaw Hall": "way/107139030",
    "Morningside College": "way/230185998",
}

OTHER_PREFIXES = (
    "Town Centre", "Chung Chi College Lib", "Lai Chan Pui Ngong",
    "T.Y.Wong Hall", "Lee W.S Col,", "Tennis Court", "Haddon-Cave Tennis Court",
    "Multi-purpose Halls,JCPG",
)


def venue_for(location, features):
    for prefix in sorted((*VENUES, *OTHER_PREFIXES), key=len, reverse=True):
        if location == prefix or location.startswith(prefix + " "):
            feature_id = VENUES.get(prefix)
            return features[feature_id] if feature_id else prefix.rstrip(","), feature_id
    match = re.fullmatch(r"(.+) [A-Z]*\d+[A-Z]*", location)
    return (match[1] if match else location), None


def weekday(day):
    return (day.weekday() + 1) % 7


def meeting_dates(values, term, days):
    academic_year = int(term[:4])
    dates = set()
    for value in values:
        if re.fullmatch(r"\d{1,2}/\d{1,2}", value):
            day, month = map(int, value.split("/"))
            year = academic_year + (month < 8 or (month == 8 and term.endswith("Summer Session")))
            dates.add(date(year, month, day))
        elif " - " in value:
            first, last = sorted(date(y, m, d) for d, m, y in (
                map(int, part.split("/")) for part in value.split(" - ")
            ))
            dates.update(first + timedelta(days=i) for i in range((last - first).days + 1))
        elif value != "TBA":
            raise ValueError(f"Unrecognized meeting date: {value!r}")
    return {
        day: tuple(d.isoformat() for d in sorted(dates) if weekday(d) == day)
        for day in days if isinstance(day, int)
    }


def minutes(value):
    hour, minute = map(int, value.split(":"))
    return hour * 60 + minute


def collect(source, features):
    tables = {name: {} for name in ("venues", "rooms", "courses", "dates", "terms")}

    def index(table, item):
        values = tables[table]
        return values.setdefault(item, len(values))

    meetings = {}
    for path in sorted((source / "courses").glob("*.json")):
        for course in json.loads(path.read_text()):
            for term, sections in course.get("terms", {}).items():
                for section, info in sections.items():
                    by_day = meeting_dates(info["meetingDates"], term, info["days"])
                    for day, start, end, raw_location in zip(
                        info["days"], info["startTimes"], info["endTimes"], info["locations"], strict=True,
                    ):
                        location = " ".join(raw_location.split())
                        dates = by_day.get(day)
                        if not dates or location in ("", "TBA", "No Room Required") or "TBA" in (start, end):
                            continue
                        start, end = minutes(start), minutes(end)
                        if not 0 <= start < end <= 1440:
                            continue
                        venue = index("venues", venue_for(location, features))
                        room = index("rooms", (venue, location))
                        code = index("courses", (path.stem + course["code"], course["title"]))
                        term_id = index("terms", term)
                        date_id = index("dates", dates)
                        meetings[(room, code, section, term_id, start, end, date_id)] = None
    if not meetings:
        raise ValueError("No dated, in-person meetings found")
    return {**{name: list(values) for name, values in tables.items()}, "meetings": list(meetings)}


def main():
    source = Path(sys.argv[1])
    revision = subprocess.check_output(["git", "-C", source, "rev-parse", "HEAD"], text=True).strip()
    if revision != REVISION or subprocess.check_output(
        ["git", "-C", source, "status", "--porcelain", "--", "courses"], text=True,
    ).strip():
        raise SystemExit(f"Use an unmodified courses directory from commit {REVISION}")
    campus = json.loads((ROOT / "public/data/cuhk.json").read_text())
    features = {f["id"]: f["name"] for f in campus["features"] if f["kind"] == "building"}
    data = collect(source, features)
    output = ROOT / "public/data/cuhk-timetable.json"
    output.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    matched = sum(feature_id is not None for _, feature_id in data["venues"])
    rooms_matched = sum(data["venues"][venue][1] is not None for venue, _ in data["rooms"])
    print(f"{len(data['meetings'])} meeting patterns; {matched}/{len(data['venues'])} map venues, "
          f"{rooms_matched}/{len(data['rooms'])} rooms; {output.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
