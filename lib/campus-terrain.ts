import type { Object3D, Plane, Raycaster } from "three";
import type { Point } from "./types";

const cellSize = 5;

export function decodeCampusTerrain(width: number, depth: number, data: ArrayBuffer) {
  const columns = Math.ceil(width / cellSize) + 1, rows = Math.ceil(depth / cellSize) + 1;
  if (data.byteLength !== columns * rows * 2) throw new Error("Invalid campus terrain grid");
  const source = new DataView(data);
  const heights = Float32Array.from({ length: columns * rows }, (_, i) => source.getInt16(i * 2, true) / 10);
  return { width, depth, columns, rows, heights };
}

export type CampusTerrain = ReturnType<typeof decodeCampusTerrain>;

export function pickCampusSurface(ray: Raycaster, buildings: Object3D[], planes: Plane[], ground?: Object3D, requireGround = false) {
  const hits = ray.intersectObjects(ground ? [ground, ...buildings] : buildings, false);
  if (requireGround && !hits.some(({ object }) => object === ground)) return undefined;
  return hits.find(({ object, point }) => object === ground || planes.every(plane => plane.distanceToPoint(point) >= 0));
}

function gridCoordinates(grid: CampusTerrain, x: number, z: number): Point {
  return [(x / grid.width + .5) * (grid.columns - 1), (z / grid.depth + .5) * (grid.rows - 1)];
}

export function terrainHeight(grid: CampusTerrain, x: number, z: number) {
  const { columns, rows, heights } = grid;
  const [u, v] = gridCoordinates(grid, x, z);
  const gx = Math.min(columns - 1, Math.max(0, u)), gz = Math.min(rows - 1, Math.max(0, v));
  const i = Math.min(columns - 2, Math.floor(gx)), j = Math.min(rows - 2, Math.floor(gz));
  const dx = gx - i, dz = gz - j;
  const offset = j * columns + i;
  const nw = heights[offset], ne = heights[offset + 1], sw = heights[offset + columns], se = heights[offset + columns + 1];
  // Match PlaneGeometry's NE–SW diagonal, not a bilinear surface.
  return dx + dz <= 1 ? nw + dx * (ne - nw) + dz * (sw - nw)
    : se + (1 - dx) * (sw - se) + (1 - dz) * (ne - se);
}

export function terrainCameraHeight(grid: CampusTerrain, x: number, y: number, z: number) {
  if (Math.abs(x) > grid.width / 2 || Math.abs(z) > grid.depth / 2) return y;
  return Math.max(y, terrainHeight(grid, x, z) + 3);
}

export type TerrainRoof = { minX: number; maxX: number; minZ: number; maxZ: number; height: number };

export function terrainTopLevels(grid: CampusTerrain, roofs: TerrainRoof[], x: number, z: number, minDistance: number) {
  const radius = 20;
  const clearance = 4;
  const height = terrainHeight(grid, x, z);
  let localTerrain = height;
  for (const dx of [-radius, -radius / 2, 0, radius / 2, radius]) {
    for (const dz of [-radius, -radius / 2, 0, radius / 2, radius]) {
      localTerrain = Math.max(localTerrain, terrainHeight(grid, x + dx, z + dz));
    }
  }
  let target = localTerrain, floor = height + clearance;
  for (const roof of roofs) {
    const dx = Math.max(roof.minX - x, x - roof.maxX, 0);
    const dz = Math.max(roof.minZ - z, z - roof.maxZ, 0);
    if (dx >= radius || dz >= radius) continue;
    const distance = Math.hypot(dx, dz);
    const safeHeight = roof.height + clearance;
    if (distance <= .05) floor = Math.max(floor, safeHeight);
    const weight = Math.max(0, 1 - distance / radius);
    target = Math.max(target, localTerrain + Math.max(0, safeHeight - minDistance - localTerrain) * weight);
  }
  return { target, floor };
}

export function terrainTopStep({ target, floor }: ReturnType<typeof terrainTopLevels>, targetY: number, cameraY: number) {
  const difference = target - targetY;
  const eased = Math.abs(difference) < .02 ? difference : difference * .18;
  return Math.max(eased, floor - cameraY);
}

export function terrainSegment(grid: CampusTerrain, start: Point, end: Point): Point[] {
  const [x0, z0] = gridCoordinates(grid, ...start), [x1, z1] = gridCoordinates(grid, ...end);
  const breaks = [0, 1];
  const cross = (a: number, b: number) => {
    for (let i = Math.floor(Math.min(a, b)) + 1; i < Math.max(a, b); i++) breaks.push((i - a) / (b - a));
  };
  cross(x0, x1);
  cross(z0, z1);
  cross(x0 + z0, x1 + z1);
  breaks.sort((a, b) => a - b);
  return breaks.filter((t, i) => i === 0 || t - breaks[i - 1] > 1e-9)
    .map(t => [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t]);
}
