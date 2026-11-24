import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { hongKongDateTime, meetingsByVenue } from "../lib/cuhk-timetable.ts";

const snapshot = JSON.parse(readFileSync(new URL("../public/data/cuhk-timetable.json", import.meta.url), "utf8"));

test("the timetable clock uses Hong Kong dates and 24-hour time across midnight", () => {
  assert.deepEqual(hongKongDateTime(new Date("2026-11-23T16:05:00Z")), { date: "2026-11-24", time: "00:05" });
});

test("the pinned snapshot matches exact dates and start-inclusive, end-exclusive times", () => {
  const venue = snapshot.venues.findIndex(([, id]) => id === "way/201907994");
  const section = (date, time) => meetingsByVenue(snapshot, date, time).get(venue)
    ?.find(meeting => meeting.code === "ACCT1111" && meeting.section === "A-LEC (9637)");
  assert.deepEqual(section("2026-11-24", "15:30"), {
    code: "ACCT1111", title: "Foundations in Financial Accounting", section: "A-LEC (9637)",
    term: "2026-27 Term 1", location: "Wu Ho Man Yuen Bldg 505", start: 930, end: 1095,
  });
  assert.equal(section("2026-11-24", "15:29"), undefined);
  assert.equal(section("2026-11-24", "18:15"), undefined);
  assert.equal(section("2026-12-08", null), undefined);
  assert.ok(section("2026-11-24", null));
});

test("mapped venue IDs resolve to CUHK buildings and unmapped venues remain in date results", () => {
  const campus = JSON.parse(readFileSync(new URL("../public/data/cuhk.json", import.meta.url), "utf8"));
  const buildings = new Set(campus.features.filter(f => f.kind === "building").map(f => f.id));
  assert.ok(snapshot.venues.every(([, id]) => id === null || buildings.has(id)));
  const venue = snapshot.venues.findIndex(([name, id]) => name === "Town Centre" && id === null);
  const meetings = meetingsByVenue(snapshot, "2026-11-23", null).get(venue);
  assert.ok(meetings?.some(meeting => meeting.location === "Town Centre Sapphire Room" && meeting.code === "DOTE5110"));
});
