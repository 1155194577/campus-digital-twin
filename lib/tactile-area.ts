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
  const width = maxX - minX + 2 * padding, depth = maxZ - minZ + 2 * padding;
  const scale = Math.max(1000, Math.ceil(Math.max(width, depth) / 17) * 100);
  const minPrintSideCm = 1.05;
  const minimumSpan = minPrintSideCm * scale / 100;
  const padX = padding + Math.max(0, minimumSpan - width) / 2;
  const padZ = padding + Math.max(0, minimumSpan - depth) / 2;
  const local: Bounds = [minX - padX, minZ - padZ, maxX + padX, maxZ + padZ];
  const [west, south] = toWgs84(center, [local[0], local[3]]);
  const [east, north] = toWgs84(center, [local[2], local[1]]);
  const bbox: Bounds = [
    Math.floor(west * 1e6) / 1e6, Math.floor(south * 1e6) / 1e6,
    Math.ceil(east * 1e6) / 1e6, Math.ceil(north * 1e6) / 1e6,
  ];
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

function insideBounds([x, y]: Point, [minX, minY, maxX, maxY]: Bounds) {
  return x >= minX && x <= maxX && y >= minY && y <= maxY;
}

function boundedLine(points: Point[], center: Point, bounds: Bounds): Geometry | null {
  const lines: Point[][] = [];
  let line: Point[] | undefined;
  for (let i = 1; i < points.length; i++) {
    const segment = clipSegment(points[i - 1], points[i], bounds);
    if (!segment) { line = undefined; continue; }
    if (line && insideBounds(points[i - 1], bounds)) line.push(segment[1]);
    else { line = [...segment]; lines.push(line); }
  }
  if (!lines.length) return null;
  const coords = (line: Point[]) => line.map(point => toWgs84(center, point));
  return lines.length === 1 ? { type: "LineString", coordinates: coords(lines[0]) } : { type: "MultiLineString", coordinates: lines.map(coords) };
}

function boundedFeature(feature: Feature, center: Point, bounds: Bounds): GeoFeature | null {
  const inside = (point: Point) => insideBounds(point, bounds);
  const coords = (points: Point[]) => points.map(point => toWgs84(center, point));
  let geometry: Geometry;
  if (feature.points.length === 1) {
    if (!inside(feature.points[0])) return null;
    geometry = { type: "Point", coordinates: coords(feature.points)[0] };
  } else if (feature.kind === "road") {
    const clipped = boundedLine(feature.points, center, bounds);
    if (!clipped) return null;
    geometry = clipped;
  } else {
    if (!feature.points.every(inside)) return null;
    const ring = coords(feature.points);
    const [originX, originY] = ring[0];
    const signedArea = ring.reduce((area, [x, y], i) => {
      const [nextX, nextY] = ring[(i + 1) % ring.length];
      return area + (x - originX) * (nextY - originY) - (nextX - originX) * (y - originY);
    }, 0);
    geometry = { type: "Polygon", coordinates: [signedArea < 0 ? ring.reverse() : ring] };
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
  for (const points of campus.coastline ?? []) {
    const geometry = boundedLine(points, campus.center, area.local);
    if (geometry) features.push({ type: "Feature", geometry, properties: { kind: "coastline" } });
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
