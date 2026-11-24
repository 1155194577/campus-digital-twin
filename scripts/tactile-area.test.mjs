import assert from "node:assert/strict";
import test from "node:test";
import { formatBounds, tactileArea, tactileCommand, tactileGeoJson } from "../lib/tactile-area.ts";

const center = [22.42, 114.21];
const feature = (id, kind, points) => ({ id, kind, name: id, points });
const start = { point: [0, 0] };
const destination = { point: [10, 0], featureId: "local" };
const route = { points: [[0, 0], [0, 30], [10, 0]], length: 62, steps: 1, crossings: 2 };

test("valid Touch Mapper bounds contain the route bend and use west south east north order", () => {
  const area = tactileArea(center, route.points);
  assert.deepEqual(area.local, [-35, -35, 45, 65]);
  const [west, south, east, north] = area.bbox;
  assert.ok(west < center[1] && east > center[1] && south < center[0] && north > center[0]);
  assert.equal(tactileCommand(area), `touch-mapper generate --bbox ${formatBounds(area.bbox)} --scale 1000 --hk-tactile-paving --out-dir campus-tactile-map`);
  assert.equal(tactileArea(center, []), null);
});

test("pads narrow plans so the rounded Touch Mapper print dimensions are valid", () => {
  for (const end of [[2000, 0], [0, 2000]]) {
    const area = tactileArea(center, [[0, 0], end]);
    const [west, south, east, north] = area.bbox;
    const radians = degrees => degrees * Math.PI / 180;
    const mercatorY = latitude => Math.asinh(Math.tan(radians(latitude))) / (2 * Math.PI);
    const meters = 40075016.686 * Math.cos(radians((south + north) / 2));
    for (const span of [(east - west) * meters / 360, (mercatorY(north) - mercatorY(south)) * meters]) {
      const cm = Number((span * 100 / area.scale).toFixed(2));
      assert.ok(cm >= 1 && cm <= 99.9, "print dimension: " + cm);
    }
  }
});

test("exports only bounded geography and includes endpoints and the mapped path", () => {
  const campus = { center, features: [
    feature("crosses", "road", [[-90, 0], [90, 0], [90, 10], [-90, 10]]),
    feature("outside", "road", [[-90, -90], [-70, -70]]),
    feature("local", "building", [[8, 0], [10, 0], [10, 2], [8, 0]]),
    feature("boundary", "building", [[40, 0], [50, 0], [50, 10], [40, 0]]),
  ] };
  const area = tactileArea(center, route.points);
  const data = tactileGeoJson(campus, area, [start, destination], route);
  assert.deepEqual(data.features.map(f => f.id ?? f.properties.kind), ["crosses", "local", "route_start", "route_destination", "mapped_route"]);
  assert.equal(data.features[0].geometry.type, "MultiLineString");
  assert.equal(data.features[0].geometry.coordinates.length, 2);
  for (const item of data.features) {
    const vertices = item.geometry.type === "Point" ? [item.geometry.coordinates]
      : item.geometry.type === "LineString" ? item.geometry.coordinates : item.geometry.coordinates.flat();
    for (const [lon, lat] of vertices) {
      assert.ok(lon >= data.bbox[0] && lon <= data.bbox[2] && lat >= data.bbox[1] && lat <= data.bbox[3]);
    }
  }
});

test("clips coastline ways to the area and omits those outside it", () => {
  const area = tactileArea(center, route.points);
  const data = tactileGeoJson({ center, features: [], coastline: [
    [[-90, 0], [90, 0], [90, 10], [-90, 10]],
    [[-90, -90], [-70, -70]],
  ] }, area, [null, null], null);
  assert.equal(data.features.length, 1);
  const [coast] = data.features;
  assert.equal(coast.properties.kind, "coastline");
  assert.equal(coast.geometry.type, "MultiLineString");
  assert.equal(coast.geometry.coordinates.length, 2);
  for (const line of coast.geometry.coordinates) {
    assert.equal(line.length, 2);
    for (const [lon, lat] of line) {
      assert.ok(lon >= data.bbox[0] && lon <= data.bbox[2] && lat >= data.bbox[1] && lat <= data.bbox[3]);
    }
  }
});

test("exports polygon exteriors counterclockwise without changing source rings", () => {
  const clockwise = [[0, 0], [10, 0], [10, 10], [0, 0]];
  const counterclockwise = [...clockwise].reverse();
  const campus = { center, features: [
    feature("clockwise", "building", clockwise),
    feature("counterclockwise", "building", counterclockwise),
  ] };
  const data = tactileGeoJson(campus, tactileArea(center, route.points), [null, null], null);
  assert.equal(data.features.length, 2);
  for (const { geometry } of data.features) {
    assert.equal(geometry.type, "Polygon");
    const [ring] = geometry.coordinates;
    assert.deepEqual(ring[0], ring.at(-1));
    const [a, b, c] = ring;
    assert.ok((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 0);
  }
  assert.deepEqual(clockwise, [[0, 0], [10, 0], [10, 10], [0, 0]]);
});
