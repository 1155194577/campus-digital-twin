import type { Campus, Feature, Point } from "./types";
import type { Endpoint, WalkingRoute } from "./walking-route";

type Bounds = [number, number, number, number];
type Area = { local: Bounds; bbox: Bounds; scale: number };
type Geometry =
  | { type: "Point"; coordinates: Point }
  | { type: "LineString"; coordinates: Point[] }
  | { type: "MultiLineString" | "Polygon"; coordinates: Point[][] };
type GeoFeature = { type: "Feature"; id?: string; geometry: Geometry; properties: Record<string, unknown> };

function toWgs84(center: Point, [x, z]: Point): Point {
  return [center[1] + x / (111320 * Math.cos(center[0] * Math.PI / 180)), center[0] - z / 111320];
}

export function tactileArea(center: Point, points: Point[]): Area | null {
  if (!points.length) return null;
  const padding = 35;
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const [x, z] of points) {
    minX = Math.min(x, minX); minZ = Math.min(z, minZ);
    maxX = Math.max(x, maxX); maxZ = Math.max(z, maxZ);
  }
  const local: Bounds = [minX - padding, minZ - padding, maxX + padding, maxZ + padding];
  const [west, south] = toWgs84(center, [local[0], local[3]]);
  const [east, north] = toWgs84(center, [local[2], local[1]]);
  const bbox: Bounds = [
    Math.floor(west * 1e6) / 1e6, Math.floor(south * 1e6) / 1e6,
    Math.ceil(east * 1e6) / 1e6, Math.ceil(north * 1e6) / 1e6,
  ];
  const scale = Math.max(1000, Math.ceil(Math.max(maxX - minX, maxZ - minZ, 0) / 17 + padding * 2 / 17) * 100);
  return { local, bbox, scale };
}

export const formatBounds = (bbox: Bounds) => bbox.map(value => value.toFixed(6)).join(" ");

export function tactileCommand(area: Area) {
  return `touch-mapper generate --bbox ${formatBounds(area.bbox)} --scale ${area.scale} --hk-tactile-paving --out-dir campus-tactile-map`;
}

function clipSegment([x, y]: Point, [endX, endY]: Point, [minX, minY, maxX, maxY]: Bounds): [Point, Point] | null {
  const dx = endX - x, dy = endY - y;
  let start = 0, end = 1;
  for (const [direction, margin] of [[-dx, x - minX], [dx, maxX - x], [-dy, y - minY], [dy, maxY - y]]) {
    if (!direction) {
      if (margin < 0) return null;
    } else if (direction < 0) start = Math.max(start, margin / direction);
    else end = Math.min(end, margin / direction);
  }
  return start < end && (dx || dy) ? [[x + start * dx, y + start * dy], [x + end * dx, y + end * dy]] : null;
}

function boundedFeature(feature: Feature, center: Point, bounds: Bounds): GeoFeature | null {
  const inside = ([x, y]: Point) => x >= bounds[0] && x <= bounds[2] && y >= bounds[1] && y <= bounds[3];
  const coords = (points: Point[]) => points.map(point => toWgs84(center, point));
  let geometry: Geometry;
  if (feature.points.length === 1) {
    if (!inside(feature.points[0])) return null;
    geometry = { type: "Point", coordinates: coords(feature.points)[0] };
  } else if (feature.kind === "road") {
    const lines: Point[][] = [];
    let line: Point[] | undefined;
    for (let i = 1; i < feature.points.length; i++) {
      const segment = clipSegment(feature.points[i - 1], feature.points[i], bounds);
      if (!segment) { line = undefined; continue; }
      if (line && inside(feature.points[i - 1])) line.push(segment[1]);
      else { line = [...segment]; lines.push(line); }
    }
    if (!lines.length) return null;
    geometry = lines.length === 1 ? { type: "LineString", coordinates: coords(lines[0]) } : { type: "MultiLineString", coordinates: lines.map(coords) };
  } else {
    if (!feature.points.every(inside)) return null;
    geometry = { type: "Polygon", coordinates: [coords(feature.points)] };
  }
  return {
    type: "Feature", id: feature.id, geometry,
    properties: { kind: feature.kind, name: feature.name, category: feature.category, crossing: feature.crossing, tactilePaving: feature.tactilePaving },
  };
}

export function tactileGeoJson(campus: Campus, area: Area, endpoints: [Endpoint | null, Endpoint | null], route: WalkingRoute | null) {
  const features: GeoFeature[] = [];
  for (const feature of campus.features) {
    const bounded = boundedFeature(feature, campus.center, area.local);
    if (bounded) features.push(bounded);
  }
  endpoints.forEach((endpoint, index) => {
    if (endpoint) features.push({
      type: "Feature", geometry: { type: "Point", coordinates: toWgs84(campus.center, endpoint.point) },
      properties: { kind: index === 0 ? "route_start" : "route_destination", sourceFeatureId: endpoint.featureId },
    });
  });
  if (route && route.points.length > 1) features.push({
    type: "Feature", geometry: { type: "LineString", coordinates: route.points.map(point => toWgs84(campus.center, point)) },
    properties: { kind: "mapped_route", lengthMeters: route.length, steps: route.steps, crossings: route.crossings, accessibilityVerified: false },
  });
  return {
    type: "FeatureCollection", bbox: area.bbox, attribution: "© OpenStreetMap contributors (ODbL)",
    snapshot: campus.fetchedAt, features,
  };
}
