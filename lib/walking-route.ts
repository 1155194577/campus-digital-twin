import type { Campus, Feature, Point } from "./types";

export type Endpoint = { point: Point; featureId?: string };
type Segment = { from: string; to: string; a: Point; b: Point; length: number; way: Feature };
type Edge = { to: string; length: number; segment: Segment };
type WalkingGraph = { segments: Segment[]; edges: Map<string, Edge[]>; points: Map<string, Point> };
type Snap = { segment: Segment; fraction: number; point: Point; offset: number };
type SnapLink = { snap: Snap; cost: number };
type Arrival = SnapLink & { node: string; previous?: Arrival; segment?: Segment };
type Match = { cost: number; start: Snap; end: Snap; arrival?: Arrival };
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
    const snap: Point = fraction === 0 ? a : fraction === 1 ? b : [a[0] + fraction * (b[0] - a[0]), a[1] + fraction * (b[1] - a[1])];
    const offset = distance(point, snap);
    if (offset <= 75) candidates.push({ segment, fraction, point: snap, offset });
  }
  return candidates;
}

function linksByNode(candidates: Snap[]) {
  const byNode = new Map<string, SnapLink[]>();
  for (const snap of candidates) {
    for (const [id, point] of [[snap.segment.from, snap.segment.a], [snap.segment.to, snap.segment.b]] as const) {
      const cost = endpointGapWeight * snap.offset + distance(snap.point, point);
      const links = byNode.get(id) ?? [];
      links.push({ snap, cost });
      byNode.set(id, links);
    }
  }
  return byNode;
}

export function findWalkingRoute(graph: WalkingGraph, details: Campus["walkDetails"], start: Point, destination: Point): WalkingRoute | null {
  const starts = snapCandidates(graph, start);
  const destinations = snapCandidates(graph, destination);
  if (!starts.length || !destinations.length) return null;
  const allowSharedSnap = distance(start, destination) === 0;
  const usable = (a: Snap, b: Snap) => allowSharedSnap || distance(a.point, b.point) > 0;
  const endNodes = linksByNode(destinations);
  const endSegments = new Map(destinations.map(snap => [snap.segment, snap]));
  const frontier = new Map<string, Arrival[]>();
  const settled = new Map<string, Snap[]>();
  const labelsPerNode = allowSharedSnap ? 1 : 2;

  function offer(arrival: Arrival) {
    const visited = settled.get(arrival.node) ?? [];
    if (visited.length === labelsPerNode || visited.some(snap => distance(snap.point, arrival.snap.point) === 0)) return;
    const queue = frontier.get(arrival.node) ?? [];
    const sameOrigin = queue.findIndex(item => distance(item.snap.point, arrival.snap.point) === 0);
    if (sameOrigin >= 0) {
      if (queue[sameOrigin].cost <= arrival.cost) return;
      queue.splice(sameOrigin, 1);
    }
    queue.push(arrival);
    queue.sort((a, b) => a.cost - b.cost);
    // Any destination snap can exclude at most one origin position.
    queue.length = Math.min(queue.length, labelsPerNode - visited.length);
    frontier.set(arrival.node, queue);
  }

  for (const [node, links] of linksByNode(starts)) {
    for (const link of links) offer({ ...link, node });
  }
  let best: Match | null = null;
  for (const a of starts) {
    const b = endSegments.get(a.segment);
    if (!b || !usable(a, b)) continue;
    const cost = distance(a.point, b.point) + endpointGapWeight * (a.offset + b.offset);
    if (cost < (best?.cost ?? Infinity)) best = { cost, start: a, end: b };
  }
  while (frontier.size) {
    let current: Arrival | undefined;
    for (const [candidate] of frontier.values()) {
      if (!current || candidate.cost < current.cost) current = candidate;
    }
    if (!current || current.cost >= (best?.cost ?? Infinity)) break;
    const { node, cost, snap } = current;
    const queue = frontier.get(node)!;
    queue.shift();
    if (!queue.length) frontier.delete(node);
    settled.set(node, [...(settled.get(node) ?? []), snap]);
    for (const end of endNodes.get(node) ?? []) {
      if (usable(snap, end.snap) && cost + end.cost < (best?.cost ?? Infinity)) {
        best = { cost: cost + end.cost, start: snap, end: end.snap, arrival: current };
      }
    }
    for (const edge of graph.edges.get(node) ?? []) {
      offer({ node: edge.to, cost: cost + edge.length, snap, previous: current, segment: edge.segment });
    }
  }
  if (!best) return null;

  const { start: a, end: b, arrival } = best;
  const nodes: string[] = [];
  const ways = new Map<string, Feature>();
  function include(segment: Segment) { ways.set(segment.way.id, segment.way); }
  if (arrival) {
    if ((arrival.node === b.segment.from ? b.fraction : 1 - b.fraction) > 0) include(b.segment);
    let current = arrival;
    while (current.previous && current.segment) {
      nodes.push(current.node);
      include(current.segment);
      current = current.previous;
    }
    nodes.push(current.node);
    if ((current.node === a.segment.from ? a.fraction : 1 - a.fraction) > 0) include(a.segment);
    nodes.reverse();
  } else {
    if (distance(a.point, b.point) > 0) include(a.segment);
    for (const snap of [a, b]) {
      const node = snap.fraction === 0 ? snap.segment.from : snap.fraction === 1 ? snap.segment.to : undefined;
      if (node !== undefined && node !== nodes[0]) nodes.push(node);
    }
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
