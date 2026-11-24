"""Convert OSM API XML snapshots into compact, attributed browser geometry.

Usage: python3 scripts/prepare_campuses.py /path/hkstp.osm /path/cuhk.osm
Fetch source XML from https://api.openstreetmap.org/api/0.6/map?bbox=...
No random geometry or live telemetry is generated.
"""
import json
import math
from pathlib import Path
import sys
import xml.etree.ElementTree as ET

CAMPUSES = [
    ("hkstp", "Hong Kong Science Park", "Pak Shek Kok · Innovation by the waterfront", (114.205, 22.421, 114.216, 22.431)),
    ("cuhk", "The Chinese University of Hong Kong", "Ma Liu Shui · A campus on the hillside", (114.198, 22.410, 114.21515, 22.42845)),
]


def convert(path, spec):
    ident, name, subtitle, bounds = spec
    root = ET.parse(path).getroot()
    nodes = {n.attrib["id"]: (float(n.attrib["lon"]), float(n.attrib["lat"])) for n in root.findall("node")}
    ways = {w.attrib["id"]: w for w in root.findall("way")}
    cx, cy = (bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2
    factor = 111320 * math.cos(math.radians(cy))
    def project(lon, lat):
        return [round((lon - cx) * factor, 2), round((cy - lat) * 111320, 2)]

    coastline = [
        [project(*nodes[ref]) for nd in way.findall("nd") if (ref := nd.attrib["ref"]) in nodes]
        for way in ways.values()
        if way.find('./tag[@k="natural"][@v="coastline"]') is not None
    ]
    features = []
    consumed = set()

    def add(ident, refs, tags):
        coords = [nodes[ref] for ref in refs if ref in nodes]
        if len(coords) < 2:
            return
        lon, lat = sum(p[0] for p in coords) / len(coords), sum(p[1] for p in coords) / len(coords)
        if not bounds[0] <= lon <= bounds[2] or not bounds[1] <= lat <= bounds[3]:
            return
        kind = None
        if tags.get("building") not in (None, "no"):
            kind = "building"
        elif tags.get("natural") == "water" or tags.get("water") or tags.get("waterway") == "riverbank":
            kind = "water"
        elif tags.get("landuse") in ("grass", "forest", "recreation_ground", "meadow") or tags.get("leisure") in ("park", "garden", "pitch") or tags.get("natural") in ("wood", "scrub", "grassland"):
            kind = "park"
        elif tags.get("highway") and tags["highway"] not in ("proposed", "construction", "steps"):
            kind = "road"
        if not kind or kind != "road" and (len(coords) < 4 or coords[0] != coords[-1]):
            return
        points = [project(x, y) for x, y in coords]
        try:
            height = float(tags.get("height", "").replace(" m", ""))
            estimated = False
        except ValueError:
            try:
                height = float(tags.get("building:levels", "")) * 3.5
            except ValueError:
                height = 14
            estimated = True
        area = abs(sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(points,points[1:]))) / 2
        features.append(dict(id=ident, kind=kind, name=tags.get("name:en") or tags.get("name") or "", localName=tags.get("name:zh", ""), points=points, height=max(2,min(height,180)), heightEstimated=estimated, levels=tags.get("building:levels"), category=tags.get("amenity") or tags.get("building") or tags.get("highway") or tags.get("leisure") or kind, area=round(area), lat=round(lat,6), lon=round(lon,6)))

    # Closed outer relation members (complex stitched rings are deliberately omitted).
    for relation in root.findall("relation"):
        tags = {t.attrib["k"]: t.attrib["v"] for t in relation.findall("tag")}
        if tags.get("type") != "multipolygon":
            continue
        for member in relation.findall("member"):
            if member.attrib.get("role") != "outer" or member.attrib.get("ref") not in ways:
                continue
            way = ways[member.attrib["ref"]]
            refs = [n.attrib["ref"] for n in way.findall("nd")]
            if refs and refs[0] == refs[-1]:
                count = len(features)
                add("relation/"+relation.attrib["id"]+"/"+way.attrib["id"], refs, tags)
                if len(features) > count:
                    consumed.add(way.attrib["id"])
    for ident, way in ways.items():
        if ident not in consumed:
            add("way/"+ident, [n.attrib["ref"] for n in way.findall("nd")], {t.attrib["k"]:t.attrib["v"] for t in way.findall("tag")})
    buildings = [f for f in features if f["kind"] == "building"]
    print(ident, name, len(features), "features;", len(buildings), "buildings")
    from datetime import datetime, timezone
    return dict(id=spec[0], name=name, subtitle=subtitle, center=[cy,cx], width=round((bounds[2]-bounds[0])*factor), depth=round((bounds[3]-bounds[1])*111320), fetchedAt=datetime.now(timezone.utc).isoformat(), coastline=coastline, features=features)


if __name__ == "__main__":
    destination = Path(__file__).resolve().parents[1] / "public" / "data"
    for path, spec in zip(sys.argv[1:], CAMPUSES):
        (destination / f"{spec[0]}.json").write_text(json.dumps(convert(path,spec), ensure_ascii=False,separators=(",",":")))
