import assert from "node:assert/strict";
import test from "node:test";
import { Plane, Vector3 } from "three";
import { campusFramePlanes, projectCampusFramePlane } from "../lib/campus-frame.ts";

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

test("top view clips elevated geometry to the projection of each ground edge when panned or zoomed", () => {
  const groundTop = -1;
  for (const camera of [new Vector3(0, 100, 0), new Vector3(3, 70, -2)]) {
    for (const edge of campusFramePlanes(20, 30)) {
      const projected = projectCampusFramePlane(edge, groundTop, camera, new Plane());
      const edgePoint = edge.coplanarPoint(new Vector3()).setY(groundTop);
      const roofAtEdge = edgePoint.clone().lerp(camera, .2);
      assert.ok(Math.abs(projected.distanceToPoint(roofAtEdge)) < 1e-9);

      const overhang = roofAtEdge.clone().addScaledVector(edge.normal, -.1);
      assert.ok(edge.distanceToPoint(overhang) > 0);
      assert.ok(projected.distanceToPoint(overhang) < 0);
      assert.ok(projected.distanceToPoint(roofAtEdge.addScaledVector(edge.normal, .1)) > 0);
    }
  }
});
