import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { BoxGeometry, ConeGeometry, Mesh, PerspectiveCamera, Raycaster, Vector3 } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { decodeCampusTerrain, pickCampusSurface, terrainCameraHeight, terrainHeight, terrainSegment, topTerrainLift } from "../lib/campus-terrain.ts";

test("terrain occludes a building behind it but not a building in front of it", () => {
  const ray = new Raycaster(new Vector3(0, 8, 20), new Vector3(0, 0, -1));
  const hill = new Mesh(new ConeGeometry(7, 16, 24));
  hill.position.set(0, 8, 5);
  hill.updateMatrixWorld();
  const building = new Mesh(new BoxGeometry(4, 16, 4));
  building.position.set(0, 8, -5);
  building.updateMatrixWorld();

  assert.equal(pickCampusSurface(ray, [building], [])?.object, building);
  assert.equal(pickCampusSurface(ray, [building], [], hill)?.object, hill);
  building.position.z = 13;
  building.updateMatrixWorld();
  assert.equal(pickCampusSurface(ray, [building], [], hill)?.object, building);

  hill.position.x = 10;
  hill.updateMatrixWorld();
  assert.equal(pickCampusSurface(ray, [building], [], hill)?.object, building);
  assert.equal(pickCampusSurface(ray, [building], [], hill, true), undefined);
});

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

test("a close orbit on the CUHK hillside clears the terrain under the camera", () => {
  const bytes = readFileSync(new URL("../public/data/cuhk-terrain.bin", import.meta.url));
  const grid = decodeCampusTerrain(1765, 2054, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const camera = new PerspectiveCamera();
  const controls = new OrbitControls(camera);
  controls.target.set(-300, terrainHeight(grid, -300, -360), -360);
  controls.minDistance = 40;
  controls.maxPolarAngle = Math.PI / 2.15;
  camera.position.copy(controls.target).add(new Vector3(40, 5, 0));
  controls.update();
  const { x, y, z } = camera.position;
  assert.ok(y < terrainHeight(grid, x, z));
  const lifted = terrainCameraHeight(grid, x, y, z);
  assert.equal(lifted, terrainHeight(grid, x, z) + 3);
  assert.equal(terrainCameraHeight(grid, x, lifted + 5, z), lifted + 5);
  assert.equal(terrainCameraHeight(grid, 1000, 0, z), 0);
});

test("panning over high terrain in Top view does not change the zoom", () => {
  const bytes = readFileSync(new URL("../public/data/cuhk-terrain.bin", import.meta.url));
  const grid = decodeCampusTerrain(1765, 2054, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const camera = new PerspectiveCamera(), controls = new OrbitControls(camera);
  controls.minDistance = 40;
  controls.target.set(-300, 64, -360);
  camera.position.copy(controls.target).add(new Vector3(0, 40, .01));
  controls.update();
  const zoom = camera.position.distanceTo(controls.target);
  let lift = 0;
  const pan = dx => {
    camera.position.x += dx;
    controls.target.x += dx;
    controls.update();
    const { x, y, z } = camera.position;
    const nextLift = topTerrainLift(grid, x, y, z, lift);
    camera.position.y += nextLift - lift;
    controls.target.y += nextLift - lift;
    lift = nextLift;
    assert.ok(Math.abs(camera.position.distanceTo(controls.target) - zoom) < 1e-6);
  };
  pan(40);
  assert.ok(lift > 0);
  assert.ok(camera.position.y >= terrainHeight(grid, camera.position.x, camera.position.z) + 3);
  pan(-40);
  assert.equal(lift, 0);
  assert.ok(Math.abs(camera.position.y - 104) < 1e-6);
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
