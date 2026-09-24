import test from "node:test";
import assert from "node:assert/strict";

import { parseDraftRef } from "../src/draft-ref.js";

const base = "https://abundant-cardinal-686.convex.site/d/gallery-qa7xeviy";

test("a bare draft id passes through", () => {
  assert.deepEqual(parseDraftRef("gallery-qa7xeviy"), { draftId: "gallery-qa7xeviy", version: null });
  assert.deepEqual(parseDraftRef("  k57abc_DEF  "), { draftId: "k57abc_DEF", version: null });
});

test("every URL form of a draft resolves to its id", () => {
  for (const url of [base, `${base}/`, `${base}/raw`, `${base}?x=1#top`]) {
    assert.deepEqual(parseDraftRef(url), { draftId: "gallery-qa7xeviy", version: null }, url);
  }
});

test("a version URL keeps the version", () => {
  assert.deepEqual(parseDraftRef(`${base}/v/3`), { draftId: "gallery-qa7xeviy", version: 3 });
  assert.deepEqual(parseDraftRef(`${base}/v/12/raw`), { draftId: "gallery-qa7xeviy", version: 12 });
});

test("anything else is rejected", () => {
  for (const input of [
    "",
    "not a/draft",
    "https://example.com/",
    "https://example.com/u/some-slug",
    `${base}/v/abc`,
    `${base}/extra/path`,
    "https://",
  ]) {
    assert.equal(parseDraftRef(input), null, input);
  }
});
