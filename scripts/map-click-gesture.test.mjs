import assert from "node:assert/strict";
import test from "node:test";
import { createMapClickGesture } from "../lib/map-click-gesture.ts";

const pointer = (pointerId, clientX = 0, clientY = 0, button = 0) => ({ pointerId, clientX, clientY, button });

test("accepts a single short click but not a pan or cancelled pointer", () => {
  const gesture = createMapClickGesture();
  gesture.down(pointer(1));
  assert.equal(gesture.up(pointer(1, 2)), true);
  gesture.down(pointer(1));
  assert.equal(gesture.up(pointer(1, 8)), false);
  gesture.down(pointer(1));
  gesture.cancel(pointer(1));
  assert.equal(gesture.up(pointer(1)), false);
});

test("neither finger release after a pinch selects a point, but the next tap can", () => {
  const gesture = createMapClickGesture();
  gesture.down(pointer(1));
  gesture.down(pointer(2, 20));
  assert.equal(gesture.up(pointer(1)), false);
  assert.equal(gesture.up(pointer(2, 20)), false);
  gesture.down(pointer(2, 20));
  assert.equal(gesture.up(pointer(2, 20)), true);
});

test("rejects a drag that returns to its starting point and non-primary clicks", () => {
  const gesture = createMapClickGesture();
  gesture.down(pointer(1));
  gesture.move(pointer(1, 8));
  assert.equal(gesture.up(pointer(1)), false);
  gesture.down(pointer(1, 0, 0, 2));
  assert.equal(gesture.up(pointer(1)), false);
});
