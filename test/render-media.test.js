import test from "node:test";
import assert from "node:assert/strict";

import { render } from "../src/render/index.js";
import { linkState } from "../src/render/media.js";
import { validateHtml } from "../src/html-policy.js";

const MEDIA_DOC = [
  "# Media", "",
  "![Plain](https://e.test/a.png)", "",
  '![Zoomed](https://e.test/b.png "zoom")', "",
  "```slides",
  '[{"src":"https://e.test/1.png","caption":"One"},{"src":"https://e.test/2.png","caption":"Two"}]',
  "```", "",
  "```video",
  '{"src":"https://e.test/c.mp4","poster":"https://e.test/p.png"}',
  "```", "",
  "```html",
  '<div class="pair"><figure class="img"><img src="https://e.test/l.png" alt="L" width="1200" height="800"></figure></div>',
  "```", "",
].join("\n");

test("every image and video carries a hidden failure panel of its kind", () => {
  const { html, errors } = render(MEDIA_DOC, { file: "m.md" });
  assert.deepEqual(errors, []);
  const panels = [...html.matchAll(/<span class="media-fail" data-kind="(\w+)"[^>]*>/g)];
  // plain, zoom thumbnail, two slides, the video, the html-fence image; never the lightbox copy
  assert.deepEqual(panels.map((m) => m[1]), ["image", "image", "image", "image", "video", "image"]);
  for (const [tag] of panels) assert.match(tag, /\shidden[\s>]/);
  // The zoom panel sits after the link, never inside it.
  assert.match(html, /<a class="zoom" href="#lb-1"><img [^>]*><\/a><span class="media-fail"/);
  assert.match(html, /<\/video><span class="media-fail" data-kind="video"/);
  // Width and height fix the panel's shape.
  assert.match(html, /alt="L" width="1200" height="800"><span class="media-fail" data-kind="image" role="status" hidden style="aspect-ratio:1200\/800">/);
});

test("the sprite draws both failure icons, and a media-only document gets the script", () => {
  const { html } = render("# Media\n\n![Plain](https://e.test/a.png)\n", { file: "m.md" });
  assert.ok(html.includes('<symbol id="icon-image-off"'));
  assert.ok(html.includes('<symbol id="icon-video-off"'));
  assert.equal((html.match(/<script>/g) ?? []).length, 1);
  assert.match(html, /addEventListener\("error"/);
  const policy = validateHtml(html);
  assert.equal(policy.ok, true, policy.errors.join("; "));
});

test("linkState reads an S3 presign's expiry", () => {
  const url = "https://b.s3.amazonaws.com/k.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=20260923T120000Z&X-Amz-Expires=300&X-Amz-Signature=ab";
  assert.equal(linkState(url, Date.UTC(2026, 8, 23, 12, 4, 59)), "signed");
  assert.equal(linkState(url, Date.UTC(2026, 8, 23, 12, 5, 1)), "expired");
  assert.equal(linkState(url, Date.UTC(2026, 8, 24)), "expired");
  assert.equal(linkState("https://e.test/a.png?X-Amz-Expires=300"), "signed");
  assert.equal(linkState("https://e.test/a.png"), "plain");
  assert.equal(linkState("data:image/png;base64,AAAA"), "data");
});

test("an empty or non-numeric X-Amz-Expires reads as signed, not expired", () => {
  const signedAt = "https://e.test/a.png?X-Amz-Date=20260923T120000Z&X-Amz-Expires=";
  assert.equal(linkState(signedAt, Date.UTC(2026, 8, 24)), "signed");
  assert.equal(linkState(`${signedAt}soon`, Date.UTC(2026, 8, 24)), "signed");
});
