import type { Campus, Feature, Point } from "./types";

export type Endpoint = { point: Point; featureId?: string };
type Segment = { from: string; to: string; a: Point; b: Point; length: number; way: Feature };
type Edge = { to: string; length: number; segment: Segment };
type WalkingGraph = { segments: Segment[]; edges: Map<string, Edge[]>; points: Map<string, Point> };
export type WalkingRoute = {
  points: Point[];
  length: number;
  offsets: [number, number];
  steps: number;
  crossings: number;
  tactile: number;
};

export const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function featureEndpoint(feature: Feature): Endpoint {
  const points = feature.points;
  const ring = points.length > 1 && distance(points[0], points[points.length - 1]) === 0;
  const vertices = ring ? points.slice(0, -1) : points;
  return {
    featureId: feature.id,
    point: [
      vertices.reduce((sum, point) => sum + point[0], 0) / vertices.length,
      vertices.reduce((sum, point) => sum + point[1], 0) / vertices.length,
    ],
  };
}

export function parseEndpoint(campus: Campus, value: string | null): Endpoint | null {
  if (!value) return null;
  const feature = campus.features.find(f => f.id === value);
  if (feature) return featureEndpoint(feature);
  const coordinates = value.split(",");
  if (coordinates.length !== 2 || coordinates.some(p => !p.trim())) return null;
  const point = coordinates.map(Number) as Point;
  if (!point.every(Number.isFinite) || Math.abs(point[0]) > campus.width / 2 || Math.abs(point[1]) > campus.depth / 2) return null;
  return { point };
}

export function formatEndpoint(endpoint: Endpoint | null) {
  return endpoint ? endpoint.featureId ?? endpoint.point.map(x => x.toFixed(2)).join(",") : null;
}

export function buildWalkingGraph(campus: Campus): WalkingGraph {
  const graph: WalkingGraph = { segments: [], edges: new Map(), points: new Map() };
  function addEdge(from: string, edge: Edge) {
    const edges = graph.edges.get(from);
    if (edges) edges.push(edge);
    else graph.edges.set(from, [edge]);
  }
  for (const way of campus.features) {
    if (way.walkNodes?.length !== way.points.length) continue;
    const refs = way.walkNodes;
    for (let i = 1; i < refs.length; i++) {
      const a = way.points[i - 1];
      const b = way.points[i];
      const [from, to] = [refs[i - 1], refs[i]];
      if (from === to) continue;
      const length = distance(a, b);
      const segment = { from, to, a, b, length, way };
      graph.segments.push(segment);
      graph.points.set(from, a);
      graph.points.set(to, b);
      addEdge(from, { to, length, segment });
      addEdge(to, { to: from, length, segment });
    }
  }
  return graph;
}

function nearestSegment(graph: WalkingGraph, point: Point) {
  let closest: { segment: Segment; fraction: number; point: Point; offset: number } | null = null;
  for (const segment of graph.segments) {
    const { a, b, length } = segment;
    const projection = length ? ((point[0] - a[0]) * (b[0] - a[0]) + (point[1] - a[1]) * (b[1] - a[1])) / length ** 2 : 0;
    const fraction = Math.max(0, Math.min(1, projection));
    const snap: Point = [a[0] + fraction * (b[0] - a[0]), a[1] + fraction * (b[1] - a[1])];
    const offset = distance(point, snap);
    if (!closest || offset < closest.offset) closest = { segment, fraction, point: snap, offset };
  }
  return closest && closest.offset <= 75 ? closest : null;
}

export function findWalkingRoute(graph: WalkingGraph, details: Campus["walkDetails"], start: Point, destination: Point): WalkingRoute | null {
  const a = nearestSegment(graph, start);
  const b = nearestSegment(graph, destination);
  if (!a || !b) return null;

  const frontier = new Map([[a.segment.from, a.fraction * a.segment.length], [a.segment.to, (1 - a.fraction) * a.segment.length]]);
  const visited = new Set<string>();
  const previous = new Map<string, { from: string; segment: Segment }>();
  let best = a.segment === b.segment ? distance(a.point, b.point) : Infinity;
  let last: string | undefined;
  while (frontier.size) {
    let node = "";
    let length = Infinity;
    for (const [candidate, cost] of frontier) {
      if (cost < length) { node = candidate; length = cost; }
    }
    if (length >= best) break;
    frontier.delete(node);
    visited.add(node);
    const extra = node === b.segment.from ? b.fraction * b.segment.length : node === b.segment.to ? (1 - b.fraction) * b.segment.length : Infinity;
    if (length + extra < best) { best = length + extra; last = node; }
    for (const edge of graph.edges.get(node) ?? []) {
      const next = length + edge.length;
      if (!visited.has(edge.to) && next < (frontier.get(edge.to) ?? Infinity)) {
        frontier.set(edge.to, next);
        previous.set(edge.to, { from: node, segment: edge.segment });
      }
    }
  }
  if (!Number.isFinite(best)) return null;

  const nodes: string[] = [];
  const ways = new Map<string, Feature>();
  function include(segment: Segment) { ways.set(segment.way.id, segment.way); }
  if (last) {
    if ((last === b.segment.from ? b.fraction : 1 - b.fraction) > 0) include(b.segment);
    let node = last;
    nodes.push(node);
    let prior = previous.get(node);
    while (prior) {
      include(prior.segment);
      node = prior.from;
      nodes.push(node);
      prior = previous.get(node);
    }
    if ((node === a.segment.from ? a.fraction : 1 - a.fraction) > 0) include(a.segment);
    nodes.reverse();
  } else {
    if (best > 0) include(a.segment);
    if (Math.min(a.fraction, b.fraction) === 0) nodes.push(a.segment.from);
    if (Math.max(a.fraction, b.fraction) === 1) nodes.push(a.segment.to);
  }
  const tagged = [...ways.values(), ...nodes.map(node => details?.[node])];
  return {
    points: [a.point, ...nodes.map(node => graph.points.get(node)!), b.point].filter((p, i, list) => !i || distance(p, list[i - 1]) > 0),
    length: best,
    offsets: [a.offset, b.offset],
    steps: [...ways.values()].filter(way => way.category === "steps").length,
    crossings: tagged.filter(item => item?.crossing).length,
    tactile: tagged.filter(item => item?.tactilePaving === "yes").length,
  };
}
