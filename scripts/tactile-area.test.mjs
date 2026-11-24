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
