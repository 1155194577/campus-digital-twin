import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { cuhkBuildingRegion, cuhkRegions } from "../lib/cuhk-regions.ts";

const { features } = JSON.parse(readFileSync(new URL("../public/data/cuhk.json", import.meta.url), "utf8"));
const buildings = features.filter(feature => feature.kind === "building");
const byId = id => buildings.find(building => building.id === id);

test("every CUHK snapshot building belongs to one of exactly ten populated regions", () => {
  const classified = Object.groupBy(buildings, cuhkBuildingRegion);
  assert.equal(Object.keys(cuhkRegions).length, 10);
  assert.deepEqual(Object.keys(classified).sort(), Object.keys(cuhkRegions).sort());
  assert.equal(Object.values(classified).flat().length, buildings.length);
});

test("college geography distinguishes similarly named buildings and central facilities", () => {
  assert.equal(cuhkBuildingRegion(byId("way/135018853")), "chung-chi"); // Madam S.H.Ho Hall
  assert.equal(cuhkBuildingRegion(byId("way/174133698")), "sh-ho"); // Ho Tim Hall
  assert.equal(cuhkBuildingRegion(byId("way/135156235")), "chung-chi"); // Ho Tim Building
  assert.equal(cuhkBuildingRegion(byId("way/135193165")), "united"); // Chan Chun Ha Hostel
  assert.equal(cuhkBuildingRegion(byId("way/421850856")), "sh-ho"); // Chan Chun Ha Hall
  assert.equal(cuhkBuildingRegion(byId("way/107139044")), "non-college"); // Run Run Shaw Science Building
  assert.equal(cuhkBuildingRegion(byId("way/134410449")), "non-college"); // University Library
  assert.equal(cuhkBuildingRegion(byId("way/667717925")), "non-college"); // Postgraduate hall beside CW Chu
});

test("unnamed buildings are assigned by footprint location only within college areas", () => {
  const unnamed = byId("way/696387721");
  assert.equal(unnamed.name, "");
  assert.equal(cuhkBuildingRegion(unnamed), "lee-woo-sing");
  assert.equal(cuhkBuildingRegion(byId("way/519120430")), "non-college"); // University Station
});
