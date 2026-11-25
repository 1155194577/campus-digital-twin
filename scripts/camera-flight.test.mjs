import assert from "node:assert/strict";
import test from "node:test";
import { Vector3 } from "three";
import { easeInOutCubic, fitDistance, interpolatePose, viewDirection } from "../lib/camera-flight.ts";

const pose = (position, target) => ({ position: new Vector3(...position), target: new Vector3(...target) });
const close = (a, b) => assert.ok(a.distanceTo(b) < 1e-6, `${a.toArray()} != ${b.toArray()}`);

test("eases from rest to rest", () => {
  assert.equal(easeInOutCubic(0), 0);
  assert.equal(easeInOutCubic(.5), .5);
  assert.equal(easeInOutCubic(1), 1);
});

test("starts and ends on the given poses", () => {
  const start = pose([100, 200, 300], [0, 0, 0]), end = pose([510, 60, -20], [500, 0, 0]);
  const out = pose([0, 0, 0], [0, 0, 0]);
  interpolatePose(start, end, 0, out); close(out.position, start.position); close(out.target, start.target);
  interpolatePose(start, end, 1, out); close(out.position, end.position); close(out.target, end.target);
});

test("turns the short way round and lifts during long hops", () => {
  const start = pose([Math.sin(3) * 100, 50, Math.cos(3) * 100], [0, 0, 0]);
  const end = pose([2000 + Math.sin(-3) * 100, 50, Math.cos(-3) * 100], [2000, 0, 0]);
  const out = interpolatePose(start, end, .5, pose([0, 0, 0], [0, 0, 0]));
  const offset = out.position.clone().sub(out.target);
  assert.ok(Math.abs(Math.abs(Math.atan2(offset.x, offset.z)) - Math.PI) < 1e-6);
  assert.ok(offset.length() > start.position.length() * 1.2);
});

test("fits a bigger footprint from further away and in narrow viewports", () => {
  assert.ok(fitDistance(100, 38, 1.5) > fitDistance(50, 38, 1.5));
  assert.ok(fitDistance(100, 38, .5) > fitDistance(100, 38, 1.5));
});

test("keeps the heading while limiting tilt", () => {
  const direction = viewDirection(new Vector3(1, 0, 1), .5, 1.1);
  assert.ok(Math.abs(direction.length() - 1) < 1e-9);
  assert.ok(Math.abs(Math.acos(direction.y) - 1.1) < 1e-9);
  assert.ok(Math.abs(direction.x - direction.z) < 1e-9);
});
