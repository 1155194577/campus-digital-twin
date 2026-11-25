type PointerPosition = { pointerId: number; clientX: number; clientY: number };

export function createMapClickGesture() {
  const active = new Set<number>();
  let start: PointerPosition | null = null;
  return {
    down(pointer: PointerPosition & { button: number }) {
      start = active.size || pointer.button !== 0 ? null : pointer;
      active.add(pointer.pointerId);
    },
    move(pointer: PointerPosition) {
      if (start?.pointerId === pointer.pointerId && Math.hypot(pointer.clientX - start.clientX, pointer.clientY - start.clientY) > 5) start = null;
    },
    cancel(pointer: { pointerId: number }) {
      if (active.delete(pointer.pointerId)) start = null;
    },
    up(pointer: PointerPosition) {
      if (!active.delete(pointer.pointerId)) return false;
      const click = active.size === 0 && start?.pointerId === pointer.pointerId &&
        Math.hypot(pointer.clientX - start.clientX, pointer.clientY - start.clientY) <= 5;
      start = null;
      return click;
    },
  };
}

export function createDoubleTapDetector(maxDelay = 320, maxDistance = 24) {
  let last: { time: number; x: number; y: number } | null = null;
  return {
    tap(pointer: { clientX: number; clientY: number; timeStamp: number }) {
      const double = last !== null && pointer.timeStamp - last.time <= maxDelay &&
        Math.hypot(pointer.clientX - last.x, pointer.clientY - last.y) <= maxDistance;
      last = double ? null : { time: pointer.timeStamp, x: pointer.clientX, y: pointer.clientY };
      return double;
    },
  };
}
