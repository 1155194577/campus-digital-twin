import assert from "node:assert/strict";
import test from "node:test";
import { legacyExplorerHref } from "../lib/legacy-explorer-link.ts";

test("plain and campaign-only links stay on the homepage", () => {
  assert.equal(legacyExplorerHref("", ""), null);
  assert.equal(legacyExplorerHref("?utm_source=campus&campaign=plan", "#work"), null);
});

test("old place links retain encoded query and fragment", () => {
  const search = "?campus=cuhk&selected=way%2F105&ref=shared";
  assert.equal(legacyExplorerHref(search, "#map-view"), `/explore${search}#map-view`);
});

test("old walking links work even when only one endpoint is set", () => {
  assert.equal(legacyExplorerHref("?start=point%3A1%2C2", ""), "/explore?start=point%3A1%2C2");
  assert.equal(legacyExplorerHref("?destination=way%2F42", ""), "/explore?destination=way%2F42");
  assert.equal(legacyExplorerHref("?plan=1", ""), "/explore?plan=1");
});

test("old links cannot choose the redirect origin", () => {
  const search = "?campus=cuhk&redirect=https%3A%2F%2Fexample.com";
  const target = new URL(legacyExplorerHref(search, ""), "https://meshpotato.example");
  assert.equal(target.origin, "https://meshpotato.example");
  assert.equal(target.pathname, "/explore");
});
