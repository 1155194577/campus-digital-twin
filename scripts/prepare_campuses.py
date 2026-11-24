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
    ("cuhk", "The Chinese University of Hong Kong", "Ma Liu Shui · A campus on the hillside", (114.198, 22.410, 114.214, 22.424)),
]


def osm_tags(element):
    return {tag.attrib["k"]: tag.attrib["v"] for tag in element.findall("tag")}


def crossing(tags):
    return tags.get("highway") == "crossing" or tags.get("footway") == "crossing" or tags.get("crossing") not in (None, "no")


def walkable(tags):
    highway, foot = tags.get("highway"), tags.get("foot")
    if foot in ("no", "private", "use_sidepath") or highway in ("motorway", "motorway_link", "construction", "proposed"):
        return False
    if foot in ("yes", "designated", "permissive"):
        return True
    if tags.get("access") in ("no", "private"):
        return False
    return highway in ("footway", "pedestrian", "path", "steps", "living_street", "residential", "service", "unclassified", "track", "corridor")


def convert(path, spec):
    ident, name, subtitle, bounds = spec
    root = ET.parse(path).getroot()
    node_elements = root.findall("node")
    nodes = {n.attrib["id"]: (float(n.attrib["lon"]), float(n.attrib["lat"])) for n in node_elements}
    ways = {w.attrib["id"]: w for w in root.findall("way")}
    cx, cy = (bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2
    factor = 111320 * math.cos(math.radians(cy))
    features = []
    consumed = set()

    def add(ident, refs, tags):
        if len(refs) < 2 or any(ref not in nodes for ref in refs):
            return
        coords = [nodes[ref] for ref in refs]
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
        elif tags.get("highway") and tags["highway"] not in ("proposed", "construction"):
            kind = "road"
        if not kind or kind != "road" and (len(coords) < 4 or coords[0] != coords[-1]):
            return
        points = [[round((x - cx) * factor, 2), round(-(y - cy) * 111320, 2)] for x, y in coords]
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
        feature = dict(id=ident, kind=kind, name=tags.get("name:en") or tags.get("name") or "", localName=tags.get("name:zh", ""), points=points, height=max(2,min(height,180)), heightEstimated=estimated, levels=tags.get("building:levels"), category=tags.get("amenity") or tags.get("building") or tags.get("highway") or tags.get("leisure") or kind, area=round(area), lat=round(lat,6), lon=round(lon,6))
        if kind == "road":
            if walkable(tags):
                feature["walkNodes"] = refs
            if crossing(tags):
                feature["crossing"] = True
            if "tactile_paving" in tags:
                feature["tactilePaving"] = tags["tactile_paving"]
        features.append(feature)

    # Closed outer relation members (complex stitched rings are deliberately omitted).
    for relation in root.findall("relation"):
        tags = osm_tags(relation)
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
    for way_id, way in ways.items():
        if way_id not in consumed:
            add("way/"+way_id, [n.attrib["ref"] for n in way.findall("nd")], osm_tags(way))
    walk_nodes = {ref for feature in features for ref in feature.get("walkNodes", [])}
    walk_details = {}
    for node in node_elements:
        ref = node.attrib["id"]
        if ref not in walk_nodes:
            continue
        tags = osm_tags(node)
        details = {}
        if crossing(tags):
            details["crossing"] = True
        if "tactile_paving" in tags:
            details["tactilePaving"] = tags["tactile_paving"]
        if details:
            walk_details[ref] = details
    buildings = [f for f in features if f["kind"] == "building"]
    print(ident, name, len(features), "features;", len(buildings), "buildings")
    from datetime import datetime, timezone
    return dict(id=spec[0], name=name, subtitle=subtitle, center=[cy,cx], width=round((bounds[2]-bounds[0])*factor), depth=round((bounds[3]-bounds[1])*111320), fetchedAt=datetime.now(timezone.utc).isoformat(), features=features, walkDetails=walk_details)


if __name__ == "__main__":
    destination = Path(__file__).resolve().parents[1] / "public" / "data"
    for path, spec in zip(sys.argv[1:], CAMPUSES):
        (destination / f"{spec[0]}.json").write_text(json.dumps(convert(path,spec), ensure_ascii=False,separators=(",",":")))
