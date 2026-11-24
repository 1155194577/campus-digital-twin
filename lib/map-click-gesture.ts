type PointerPosition = { pointerId: number; clientX: number; clientY: number };

export function createMapClickGesture() {
  const active = new Set<number>();
  let start: PointerPosition | null = null;
  return {
    down(pointer: PointerPosition) {
      start = active.size ? null : pointer;
      active.add(pointer.pointerId);
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
