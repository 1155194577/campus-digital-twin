import type { Campus, Feature, Point } from "./types";

export type Endpoint = { point: Point; featureId?: string };
type Segment = { from: string; to: string; a: Point; b: Point; length: number; way: Feature };
type Edge = { to: string; length: number; segment: Segment };
type WalkingGraph = { segments: Segment[]; edges: Map<string, Edge[]>; points: Map<string, Point> };
type Snap = { segment: Segment; fraction: number; point: Point; offset: number };
type Match = { cost: number; end: Snap } & ({ start: Snap } | { last: string });
const endpointGapWeight = 2;
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

function snapCandidates(graph: WalkingGraph, point: Point) {
  const candidates: Snap[] = [];
  for (const segment of graph.segments) {
    const { a, b, length } = segment;
    const projection = length ? ((point[0] - a[0]) * (b[0] - a[0]) + (point[1] - a[1]) * (b[1] - a[1])) / length ** 2 : 0;
    const fraction = Math.max(0, Math.min(1, projection));
    const snap: Point = [a[0] + fraction * (b[0] - a[0]), a[1] + fraction * (b[1] - a[1])];
    const offset = distance(point, snap);
    if (offset <= 75) candidates.push({ segment, fraction, point: snap, offset });
  }
  return candidates;
}

function candidatesByNode(candidates: Snap[]) {
  const byNode = new Map<string, { snap: Snap; cost: number }>();
  for (const snap of candidates) {
    for (const [id, point] of [[snap.segment.from, snap.segment.a], [snap.segment.to, snap.segment.b]] as const) {
      const cost = endpointGapWeight * snap.offset + distance(snap.point, point);
      if (cost < (byNode.get(id)?.cost ?? Infinity)) byNode.set(id, { snap, cost });
    }
  }
  return byNode;
}

export function findWalkingRoute(graph: WalkingGraph, details: Campus["walkDetails"], start: Point, destination: Point): WalkingRoute | null {
  const starts = snapCandidates(graph, start);
  const destinations = snapCandidates(graph, destination);
  if (!starts.length || !destinations.length) return null;
  const startNodes = candidatesByNode(starts);
  const endNodes = candidatesByNode(destinations);
  const endSegments = new Map(destinations.map(snap => [snap.segment, snap]));
  const frontier = new Map([...startNodes].map(([node, candidate]) => [node, candidate.cost]));
  const visited = new Set<string>();
  const previous = new Map<string, { from: string; segment: Segment }>();
  let best: Match | null = null;
  for (const a of starts) {
    const b = endSegments.get(a.segment);
    if (!b) continue;
    const cost = distance(a.point, b.point) + endpointGapWeight * (a.offset + b.offset);
    if (cost < (best?.cost ?? Infinity)) best = { cost, start: a, end: b };
  }
  while (frontier.size) {
    let node = "";
    let length = Infinity;
    for (const [candidate, cost] of frontier) {
      if (cost < length) { node = candidate; length = cost; }
    }
    if (length >= (best?.cost ?? Infinity)) break;
    frontier.delete(node);
    visited.add(node);
    const end = endNodes.get(node);
    if (end && length + end.cost < (best?.cost ?? Infinity)) best = { cost: length + end.cost, end: end.snap, last: node };
    for (const edge of graph.edges.get(node) ?? []) {
      const next = length + edge.length;
      if (!visited.has(edge.to) && next < (frontier.get(edge.to) ?? Infinity)) {
        frontier.set(edge.to, next);
        previous.set(edge.to, { from: node, segment: edge.segment });
      }
    }
  }
  if (!best) return null;

  let a: Snap;
  const b = best.end;
  const nodes: string[] = [];
  const ways = new Map<string, Feature>();
  function include(segment: Segment) { ways.set(segment.way.id, segment.way); }
  if ("last" in best) {
    if ((best.last === b.segment.from ? b.fraction : 1 - b.fraction) > 0) include(b.segment);
    let node = best.last;
    nodes.push(node);
    let prior = previous.get(node);
    while (prior) {
      include(prior.segment);
      node = prior.from;
      nodes.push(node);
      prior = previous.get(node);
    }
    a = startNodes.get(node)!.snap;
    if ((node === a.segment.from ? a.fraction : 1 - a.fraction) > 0) include(a.segment);
    nodes.reverse();
  } else {
    a = best.start;
    if (distance(a.point, b.point) > 0) include(a.segment);
    if (Math.min(a.fraction, b.fraction) === 0) nodes.push(a.segment.from);
    if (Math.max(a.fraction, b.fraction) === 1) nodes.push(a.segment.to);
  }
  const tagged = [...ways.values(), ...nodes.map(node => details?.[node])];
  const points = [a.point, ...nodes.map(node => graph.points.get(node)!), b.point].filter((p, i, list) => !i || distance(p, list[i - 1]) > 0);
  return {
    points,
    length: points.reduce((length, point, i) => i ? length + distance(points[i - 1], point) : length, 0),
    offsets: [a.offset, b.offset],
    steps: [...ways.values()].filter(way => way.category === "steps").length,
    crossings: tagged.filter(item => item?.crossing).length,
    tactile: tagged.filter(item => item?.tactilePaving !== undefined && item.tactilePaving !== "no").length,
  };
}
