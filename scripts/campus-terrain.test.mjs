import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { decodeCampusTerrain, terrainHeight, terrainSegment } from "../lib/campus-terrain.ts";

test("terrain heights follow the ground triangles and clamp to the map boundary", () => {
  const data = new ArrayBuffer(8);
  const view = new DataView(data);
  [-15, 0, 0, 100].forEach((height, index) => view.setInt16(index * 2, height, true));
  const terrain = decodeCampusTerrain(5, 5, data);
  assert.equal(terrainHeight(terrain, -3, -3), -1.5);
  assert.equal(terrainHeight(terrain, 0, 0), 0);
  assert.equal(terrainHeight(terrain, 1.25, 1.25), 5);
  assert.deepEqual(terrainSegment(terrain, [-2.5, -2.5], [2.5, 2.5]), [[-2.5, -2.5], [0, 0], [2.5, 2.5]]);
  assert.throws(() => decodeCampusTerrain(5, 5, new ArrayBuffer(6)), /Invalid campus terrain grid/);
});

for (const [campus, columns, rows] of [["hkstp", 228, 224], ["cuhk", 354, 412]]) {
  test(`${campus} distributes a terrain grid aligned with its campus snapshot`, () => {
    const { width, depth } = JSON.parse(readFileSync(new URL(`../public/data/${campus}.json`, import.meta.url)));
    const bytes = readFileSync(new URL(`../public/data/${campus}-terrain.bin`, import.meta.url));
    const grid = decodeCampusTerrain(width, depth, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    assert.equal(grid.columns, columns);
    assert.equal(grid.rows, rows);
    assert.ok(grid.heights.some(height => height < 5));
    assert.ok(grid.heights.some(height => height > 100));
    assert.ok(grid.heights.every(height => height > -10 && height < 300));
  });
}
