import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildWalkingGraph, featureEndpoint, findWalkingRoute, formatEndpoint, parseEndpoint } from "../lib/walking-route.ts";

const road = (id, points, walkNodes, category = "footway", extra = {}) =>
  ({ id, points, walkNodes, category, kind: "road", ...extra });
const main = road("main", [[0, 0], [100, 0]], ["a", "b"]);
const steps = road("steps", [[100, 0], [100, 100]], ["b", "c"], "steps");
const crossing = road("crossing", [[100, 100], [200, 100]], ["c", "d"], "footway", { crossing: true });
const unwalkable = road("unwalkable", [[0, 0], [200, 100]], undefined, "motorway");

test("snaps to segments and counts encountered features without adding endpoint gaps", () => {
  const graph = buildWalkingGraph({ features: [main, steps, crossing, unwalkable] });
  const result = findWalkingRoute(graph, { c: { tactilePaving: "yes" } }, [20, -2], [180, 100]);
  assert.deepEqual(result, {
    points: [[20, 0], [100, 0], [100, 100], [180, 100]], length: 260, offsets: [2, 0], steps: 1, crossings: 1, tactile: 1,
  });
});

test("uses the direct portion of a shared segment and refuses unmapped connections", () => {
  const disconnected = road("disconnected", [[100, 0], [200, -100]], ["separate", "e"]);
  const graph = buildWalkingGraph({ features: [main, disconnected] });
  assert.equal(findWalkingRoute(graph, {}, [2, 0], [8, 0]).length, 6);
  assert.equal(findWalkingRoute(graph, {}, [2, 0], [200, -100]), null);
  assert.equal(findWalkingRoute(graph, {}, [2, 0], [0, 90]), null);
});

test("uses connected alternatives when the nearest segments are isolated", () => {
  const isolatedA = road("isolated-A", [[-5, -2], [-1, -2]], ["e", "f"]);
  const isolatedB = road("isolated-B", [[201, 102], [205, 102]], ["g", "h"]);
  const graph = buildWalkingGraph({ features: [main, steps, crossing, isolatedA, isolatedB] });
  const result = findWalkingRoute(graph, {}, [-3, -2], [203, 102]);
  assert.deepEqual(result.points, [[0, 0], [100, 0], [100, 100], [200, 100]]);
  assert.equal(result.length, 300);
  assert.ok(result.offsets.every(offset => offset > 0 && offset < 4));
});

test("prefers mapped walking to off-network shortcuts", () => {
  const isolatedA = road("isolated-A", [[-2, 0], [0, 0]], ["a", "b"]);
  const isolatedB = road("isolated-B", [[44, 0], [46, 0]], ["c", "d"]);
  const path = road("path", [[9, 0], [16.5, 8], [24, 0]], ["e", "f", "g"]);
  const graph = buildWalkingGraph({ features: [isolatedA, isolatedB, path] });
  const result = findWalkingRoute(graph, {}, [0, 0], [44, 0]);
  assert.ok(result.length > 15 && result.length < 30);
  assert.ok(result.offsets[0] + result.offsets[1] < 44);
});

test("minimizes mapped distance and weighted endpoint gaps with distinct snaps on CUHK routes", () => {
  const campus = JSON.parse(readFileSync(new URL("../public/data/cuhk.json", import.meta.url), "utf8"));
  const graph = buildWalkingGraph(campus);
  const point = id => featureEndpoint(campus.features.find(f => f.id === `way/${id}`)).point;
  for (const [startId, endId, meters, cost] of [
    ["751038710", "751038712", 12, 264],
    ["134410444", "134410449", 1, 134],
    ["421850856", "174133703", 22, 79],
  ]) {
    for (const [start, end] of [[startId, endId], [endId, startId]]) {
      const result = findWalkingRoute(graph, campus.walkDetails, point(start), point(end));
      assert.equal(Math.round(result.length), meters);
      assert.equal(Math.round(result.length + 2 * (result.offsets[0] + result.offsets[1])), cost);
      assert.notDeepEqual(result.points[0], result.points.at(-1));
    }
  }
});

test("finds distinct alternatives when the closest snaps coincide", () => {
  const short = road("short", [[0, 0], [0, -5]], ["s", "t"]);
  const result = findWalkingRoute(buildWalkingGraph({ features: [short] }), {}, [-10, 0], [10, 0]);
  assert.equal(result, null);

  const bend = road("bend", [[0, 0], [-15, -20], [15, -20]], ["s", "u", "v"]);
  const alternative = findWalkingRoute(buildWalkingGraph({ features: [short, bend] }), {}, [-10, 0], [10, 0]);
  assert.ok(alternative.length > 0);
});

test("counts mapped tactile paving variants but not no or missing tags", () => {
  const path = road("path", [[0, 0], [100, 0], [200, 0], [300, 0], [400, 0]], ["a", "b", "c", "d", "e"], "footway", { tactilePaving: "contrasted" });
  const details = { b: { tactilePaving: "primitive" }, c: { tactilePaving: "incorrect" }, d: { tactilePaving: "no" } };
  assert.equal(findWalkingRoute(buildWalkingGraph({ features: [path] }), details, [0, 0], [400, 0]).tactile, 3);
});

test("round-trips named features and bounded map points for share links", () => {
  const campus = { width: 100, depth: 100, features: [main] };
  assert.deepEqual(parseEndpoint(campus, formatEndpoint({ point: [5.126, -3] })), { point: [5.13, -3] });
  assert.deepEqual(parseEndpoint(campus, formatEndpoint({ featureId: "main", point: [50, 0] })), { point: [50, 0], featureId: "main" });
  assert.equal(parseEndpoint(campus, "Infinity,0"), null);
  assert.equal(parseEndpoint(campus, "0,100"), null);
});
