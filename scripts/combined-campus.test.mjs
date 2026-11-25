import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { combineCampuses, combinedBounds } from "../lib/combined-campus.ts";
import { projectPlace } from "../lib/campus-places.ts";

const load = id => JSON.parse(readFileSync(new URL(`../public/data/${id}.json`, import.meta.url)));
const hkstp = load("hkstp"), cuhk = load("cuhk");
const combined = combineCampuses([hkstp, cuhk]);

test("combined view keeps each OSM feature once", () => {
  const ids = new Set([...hkstp.features, ...cuhk.features].map(feature => feature.id));
  assert.equal(combined.features.length, ids.size);
  assert.equal(new Set(combined.features.map(feature => feature.id)).size, ids.size);
  assert.ok(combined.features.length < hkstp.features.length + cuhk.features.length);
});

test("combined view places features at their own coordinates", () => {
  for (const source of [hkstp, cuhk]) {
    for (const feature of source.features.filter(f => f.kind === "building").slice(0, 50)) {
      const moved = combined.features.find(f => f.id === feature.id);
      const centroid = moved.points.reduce(([x, y], [px, py]) => [x + px / moved.points.length, y + py / moved.points.length], [0, 0]);
      const expected = projectPlace(feature, combined.center);
      assert.ok(Math.hypot(centroid[0] - expected[0], centroid[1] - expected[1]) < 1, feature.id);
    }
  }
});

test("combined ground covers both campuses", () => {
  const [west, south, east, north] = combinedBounds;
  assert.deepEqual(combined.center, [(south + north) / 2, (west + east) / 2]);
  for (const feature of combined.features) {
    const [x, y] = projectPlace(feature, combined.center);
    assert.ok(Math.abs(x) <= combined.width / 2 + 1 && Math.abs(y) <= combined.depth / 2 + 1, feature.id);
  }
  assert.equal(combined.fetchedAt, [hkstp.fetchedAt, cuhk.fetchedAt].sort()[0]);
});
