import assert from "node:assert/strict";
import test from "node:test";
import { buildWalkingGraph, findWalkingRoute, formatEndpoint, parseEndpoint } from "../lib/walking-route.ts";

const road = (id, points, walkNodes, category = "footway", extra = {}) =>
  ({ id, points, walkNodes, category, kind: "road", ...extra });
const main = road("main", [[0, 0], [10, 0]], ["a", "b"]);
const steps = road("steps", [[10, 0], [10, 10]], ["b", "c"], "steps");
const crossing = road("crossing", [[10, 10], [20, 10]], ["c", "d"], "footway", { crossing: true });
const unwalkable = road("unwalkable", [[0, 0], [20, 10]], undefined, "motorway");

test("snaps to segments and counts encountered features without adding endpoint gaps", () => {
  const graph = buildWalkingGraph({ features: [main, steps, crossing, unwalkable] });
  const result = findWalkingRoute(graph, { c: { tactilePaving: "yes" } }, [4, -2], [18, 10]);
  assert.deepEqual(result, {
    points: [[4, 0], [10, 0], [10, 10], [18, 10]], length: 24, offsets: [2, 0], steps: 1, crossings: 1, tactile: 1,
  });
});

test("uses the direct portion of a shared segment and refuses unmapped connections", () => {
  const disconnected = road("disconnected", [[10, 0], [20, -10]], ["separate", "e"]);
  const graph = buildWalkingGraph({ features: [main, disconnected] });
  assert.equal(findWalkingRoute(graph, {}, [2, 0], [8, 0]).length, 6);
  assert.equal(findWalkingRoute(graph, {}, [2, 0], [20, -10]), null);
  assert.equal(findWalkingRoute(graph, {}, [2, 0], [0, 90]), null);
});

test("round-trips named features and bounded map points for share links", () => {
  const campus = { width: 100, depth: 100, features: [main] };
  assert.deepEqual(parseEndpoint(campus, formatEndpoint({ point: [5.126, -3] })), { point: [5.13, -3] });
  assert.deepEqual(parseEndpoint(campus, formatEndpoint({ featureId: "main", point: [5, 0] })), { point: [5, 0], featureId: "main" });
  assert.equal(parseEndpoint(campus, "Infinity,0"), null);
  assert.equal(parseEndpoint(campus, "0,100"), null);
});
