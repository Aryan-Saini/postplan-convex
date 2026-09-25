import test from "node:test";
import assert from "node:assert/strict";

import { parseMarkdown, render } from "../src/render/index.js";
import { validateDoc, formatError } from "../src/render/schema/index.js";
import { expiryLabel, fileType } from "../src/render/filetypes.js";
import { FILE_ICONS } from "../src/render/file-icons.js";
import { validateHtml } from "../src/html-policy.js";
import { kindOf, kindLabel, iconOf } from "../convex/lib/pageShell.ts";

const fence = (body) => `---\ntitle: T\n---\n\nLead.\n\n\`\`\`file\n${body}\n\`\`\`\n`;
const errors = (body) => {
  const { doc, errors: parse } = parseMarkdown(fence(body), { file: "f.md" });
  assert.deepEqual(parse, []);
  return validateDoc(doc, { file: "f.md" }).map(formatError);
};

test("a file fence validates one file or a list", () => {
  assert.deepEqual(errors('{"src":"https://e.test/a.apk","name":"a.apk","size":10,"expires":"2026-09-26T21:00:00Z","note":"n"}'), []);
  assert.deepEqual(errors('[{"src":"https://e.test/a.zip","name":"a.zip","size":1},{"src":"https://e.test/b","name":"b","size":2,"kind":"ipa","expires":"2026-09-26"}]'), []);
});

test("a file fence rejects an http src, a bad expires, an unknown kind and a missing size", () => {
  assert.deepEqual(errors('{"src":"http://e.test/a.apk","name":"a.apk","size":1}'), [
    'f.md:7 file: file src "http://e.test/a.apk" must be https: or data: (publish it with file-upload first)',
  ]);
  assert.deepEqual(errors('{"src":"https://e.test/a","name":"a","size":1,"expires":"next week"}'), [
    'f.md:7 file: /expires expected an ISO 8601 time like 2026-09-26T21:00:00Z, got "next week"',
  ]);
  // A time without a zone means a different moment for every reader.
  assert.equal(errors('{"src":"https://e.test/a","name":"a","size":1,"expires":"2026-09-26T21:00"}').length, 1);
  assert.equal(errors('{"src":"https://e.test/a","name":"a","size":1,"expires":"2026-02-31"}').length, 1);
  assert.deepEqual(errors('[{"src":"https://e.test/a","name":"a","kind":"nope"}]'), [
    "f.md:7 file: /0/size expected number, got nothing",
    'f.md:7 file: /0/kind expected a file extension like apk, ipa, zip or pdf, got "nope"',
  ]);
  assert.deepEqual(errors("[]"), ["f.md:7 file: expected at least one file, got an empty array"]);
});

test("kind is inferred from the extension, and `kind` overrides it", () => {
  const cases = {
    "syncafy-1.4.2.apk": ["ft-android", "Android package"],
    "Syncafy.ipa": ["ft-ipa", "iOS app"],
    "Installer.dmg": ["ft-apple", "macOS disk image"],
    "setup.exe": ["ft-window", "Windows installer"],
    "photos.tar.gz": ["ft-archive", "Archive"],
    "report.PDF": ["ft-pdf", "PDF document"],
    "rows.csv": ["ft-sheet", "Comma-separated values"],
    "deck.pptx": ["ft-slides", "Presentation"],
    "brief.docx": ["ft-word", "Word document"],
    "clip.mov": ["ft-video", "Video"],
    "Inter.woff2": ["ft-font", "Font"],
    "upload.ts": ["ts", "TypeScript source"],
    "notes.md": ["md", "Markdown"],
    "LICENSE": ["ft-file", "File"],
  };
  for (const [name, [icon, label]] of Object.entries(cases)) {
    const t = fileType(name);
    assert.deepEqual([t.icon, t.label], [icon, label], name);
  }
  assert.equal(fileType("download", "apk").label, "Android package");
});

test("expiryLabel: a date when far, a countdown inside 48 hours, toned near the end", () => {
  const now = Date.UTC(2026, 8, 24, 12, 0);
  const h = 3600000;
  assert.deepEqual(expiryLabel(now + 3 * 24 * h, now, { utc: true }), { text: "Expires Sep 27, 12:00 PM UTC", tone: "", state: "far" });
  assert.deepEqual(expiryLabel(now + 30 * h, now), { text: "30h 0m left", tone: "", state: "soon" });
  assert.deepEqual(expiryLabel(now + 5 * h + 12 * 60000 + 30000, now), { text: "5h 12m left", tone: "warn", state: "soon" });
  assert.deepEqual(expiryLabel(now + 30 * 60000, now), { text: "30m left", tone: "critical", state: "soon" });
  assert.deepEqual(expiryLabel(now - 1, now), { text: "Expired", tone: "critical", state: "expired" });
});

test("a card renders the type glyph, the meta line, the actions and the UTC fallback", () => {
  const { html, errors: e } = render(fence(
    '[{"src":"https://e.test/a.apk","name":"syncafy-1.4.2.apk","size":48213333,"expires":"2099-09-26T21:00:00Z"},' +
    '{"src":"https://e.test/q.pdf","name":"q.pdf","size":1,"expires":"2026-09-01"}]'), { file: "f.md" });
  assert.deepEqual(e, []);
  assert.match(html, /<use href="#icon-ft-android"\/>/);
  assert.match(html, /48\.2 MB · APK · Android package/);
  assert.match(html, /<span class="fc-pill">Expires Sep 26, 9:00 PM UTC<\/span>/);
  assert.match(html, /<a class="copy primary" data-live href="https:\/\/e\.test\/a\.apk" download="syncafy-1\.4\.2\.apk">/);
  assert.match(html, /data-copy="https:\/\/e\.test\/a\.apk"/);
  // Already expired: Download and Open hidden, the line shown, Copy link kept.
  assert.match(html, /<span class="fc-pill critical">Expired<\/span><\/div><div class="fc-gone">This link expired Sep 1, 12:00 AM UTC\./);
  assert.match(html, /href="https:\/\/e\.test\/q\.pdf" download="q\.pdf" hidden>/);
  assert.match(html, /setInterval\(tick, 60000\)/);
  assert.equal(validateHtml(html).ok, true);
});

test("a signed S3 URL expires on its own", () => {
  const src = "https://b.s3.amazonaws.com/k.csv?X-Amz-Date=20240101T000000Z&X-Amz-Expires=300&X-Amz-Signature=ab";
  const { html } = render(fence(JSON.stringify({ src, name: "k.csv", size: 5 })), { file: "f.md" });
  assert.match(html, /data-expires="1704067500000"/);
  assert.match(html, /fc-pill critical">Expired/);
});

test("the sprite carries only the file glyphs a document uses", () => {
  for (const key of ["ft-android", "ft-ipa", "ft-apple", "ft-window", "ft-archive", "ft-pdf", "ft-excel",
    "ft-word", "ft-slides", "ft-video", "ft-audio", "ft-image", "ft-font", "ft-db", "ft-jupyter", "ft-file"]) {
    assert.ok(FILE_ICONS[key], key);
    assert.match(FILE_ICONS[key][0], /^0 0 \d+ \d+$/);
  }
  const { html } = render(fence('{"src":"https://e.test/a.ipa","name":"a.ipa","size":1}'), { file: "f.md" });
  assert.match(html, /<symbol id="icon-ft-ipa" viewBox="0 0 24 24">/);
  assert.doesNotMatch(html, /icon-ft-android"/);
  assert.match(html, /<symbol id="icon-download"/);
});

test("the /s/ page knows installers by extension", () => {
  const octet = "application/octet-stream";
  assert.equal(kindOf(octet, "test.apk"), "package");
  assert.equal(kindOf("application/vnd.android.package-archive", "test.apk"), "package");
  assert.equal(kindOf(octet, "test.ipa"), "package");
  assert.equal(kindOf(octet, "Build.dmg"), "package");
  assert.equal(kindLabel("package", octet, "test.apk"), "APK · Android package");
  assert.equal(kindLabel("package", octet, "test.ipa"), "IPA · iOS app");
  assert.equal(kindLabel("package", octet, "Build.dmg"), "DMG · macOS disk image");
  assert.deepEqual(["test.apk", "test.ipa", "Build.dmg"].map((n) => iconOf("package", n)), ["ft-android", "ft-ipa", "ft-apple"]);
  // Content type still decides what previews.
  assert.equal(kindOf("image/png", "shot.png"), "image");
  assert.equal(kindOf("text/plain", "notes"), "text");
  assert.equal(iconOf("image", "IMG_0001"), "ft-image");
});
