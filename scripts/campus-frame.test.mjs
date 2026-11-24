import assert from "node:assert/strict";
import test from "node:test";
import { Vector3 } from "three";
import { campusFramePlanes } from "../lib/campus-frame.ts";

test("campus frame keeps all four edges at the ground dimensions without clipping height", () => {
  const planes = campusFramePlanes(20, 30);
  const inFrame = (x, y, z) => planes.every(plane => plane.distanceToPoint(new Vector3(x, y, z)) >= 0);

  for (const x of [-10, 10]) {
    for (const z of [-15, 15]) {
      assert.equal(inFrame(x, 0, z), true);
      assert.equal(inFrame(x, 180, z), true);
    }
  }
  for (const [x, z] of [[-10.01, 0], [10.01, 0], [0, -15.01], [0, 15.01]]) {
    assert.equal(inFrame(x, 0, z), false);
  }
});
