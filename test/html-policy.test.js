import test from "node:test";
import assert from "node:assert/strict";

import { validateHtml } from "../src/html-policy.js";

const doc = (head) => `<!doctype html><html><head><title>T</title>${head}</head><body></body></html>`;
const LINK_BLOCKED = "Blocked <link> tag found.";

test("an inline data: favicon link passes", () => {
  for (const href of ["data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=", "data:image/png;base64,iVBORw0KGgo="]) {
    const result = validateHtml(doc(`<link rel="icon" type="image/svg+xml" sizes="any" href="${href}">`));
    assert.deepEqual(result.errors, [], href);
  }
  assert.deepEqual(validateHtml(doc(`<link REL="Icon" href="data:image/svg+xml,x">`)).errors, []);
});

test("every other link stays blocked", () => {
  const blocked = [
    `<link rel="stylesheet" href="https://example.com/a.css">`,
    `<link rel="icon" href="https://example.com/favicon.svg">`,
    `<link rel="icon prefetch" href="data:image/svg+xml,x">`,
    `<link rel="icon" href="data:text/html,x">`,
    `<link rel="icon" href="data:image/svg+xml,x" crossorigin>`,
  ];
  for (const link of blocked) assert.ok(validateHtml(doc(link)).errors.includes(LINK_BLOCKED), link);
});
