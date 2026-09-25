import test from "node:test";
import assert from "node:assert/strict";

import {
  assetKey, assetSlug, inferProject, isBuild, isoInstant, objectName, parseAssetKey, parseAssetRef,
  parseExpires, planExpiry, randomId, taggingHeader, validateSignRequest
} from "../src/assets.js";

const NOW = Date.parse("2026-09-25T12:00:00Z");
const DAY = 86_400_000;

test("object names are lowercased, hyphenated, with the suffix before the extension", () => {
  assert.equal(objectName("Login Flow.MP4", "k3f9x2m8"), "login-flow-k3f9x2m8.mp4");
  assert.equal(objectName("Screen Shot 2026-09-25 at 10.14.03.png", "aaaaaaaa"), "screen-shot-2026-09-25-at-10-14-03-aaaaaaaa.png");
  assert.equal(objectName("Makefile", "aaaaaaaa"), "makefile-aaaaaaaa");
  assert.equal(objectName(".env", "aaaaaaaa"), "env-aaaaaaaa");
  assert.equal(objectName("日本.png", "aaaaaaaa"), "file-aaaaaaaa.png");
  assert.match(objectName("a.png"), /^a-[a-z0-9]{8}\.png$/);
  assert.notEqual(randomId(), randomId());
});

test("project is the repo, else the folder, else random", () => {
  assert.equal(inferProject({ repoName: "Laborhutt-Monorepo", cwd: "/x/y" }), "laborhutt-monorepo");
  assert.equal(inferProject({ repoName: null, cwd: "/Users/aryan/Desktop/laborhutt" }), "laborhutt");
  assert.equal(inferProject({ cwd: "/Users/aryan/Desktop", home: "/Users/aryan" }), "random");
  assert.equal(inferProject({ cwd: "/Users/aryan", home: "/Users/aryan" }), "random");
  assert.equal(inferProject({ cwd: "/home/aryan/Downloads/" }), "random");
  assert.equal(inferProject({ cwd: "/tmp" }), "random");
  assert.equal(inferProject({ cwd: "/" }), "random");
});

test("--expires takes 7d, 24h, never and ISO dates", () => {
  assert.equal(parseExpires("7d", NOW), NOW + 7 * DAY);
  assert.equal(parseExpires("24h", NOW), NOW + DAY);
  assert.equal(parseExpires("2026-10-01T00:00:00Z", NOW), Date.parse("2026-10-01T00:00:00Z"));
  assert.equal(parseExpires("2026-10-01", NOW), Date.parse("2026-10-01"));
  assert.equal(parseExpires("never", NOW), null);
  assert.throws(() => parseExpires("3w", NOW), /expected 7d, 24h/);
  assert.throws(() => parseExpires("0d", NOW), /future/);
  assert.throws(() => parseExpires("2026-01-01", NOW), /future/);
  assert.throws(() => parseExpires("2026-13-45", NOW), /not a valid date/);
  assert.equal(isoInstant(NOW + 7 * DAY), "2026-10-02T12:00:00Z");
});

test("installable builds are detected by extension, zips only by name", () => {
  for (const name of ["app.ipa", "App.APK", "x.aab", "Foo.app", "a.dmg", "a.pkg", "setup.exe", "a.msi", "ios-build-42.zip"]) {
    assert.ok(isBuild(name), name);
  }
  for (const name of ["export.zip", "shot.png", "build.log", "ipa", "notes.md"]) assert.ok(!isBuild(name), name);
});

test("builds expire in 7 days and are tagged; anything within 7 days is tagged, longer is not", () => {
  assert.deepEqual(planExpiry({ name: "app.apk", now: NOW }), { expiresAt: NOW + 7 * DAY, tags: { autodelete: "7d" } });
  assert.deepEqual(planExpiry({ name: "shot.png", now: NOW }), { expiresAt: null, tags: {} });
  assert.deepEqual(planExpiry({ name: "shot.png", expires: "24h", now: NOW }), { expiresAt: NOW + DAY, tags: { autodelete: "7d" } });
  assert.deepEqual(planExpiry({ name: "shot.png", expires: "30d", now: NOW }), { expiresAt: NOW + 30 * DAY, tags: {} });
  assert.deepEqual(planExpiry({ name: "app.ipa", expires: "never", now: NOW }), { expiresAt: null, tags: {} });
  assert.equal(taggingHeader({ autodelete: "7d" }), "autodelete=7d");
  assert.equal(taggingHeader({}), undefined);
});

test("keys live under public/ or protected/ and round-trip", () => {
  assert.equal(assetKey("public", "laborhutt", "a-k3f9x2m8.png"), "public/laborhutt/a-k3f9x2m8.png");
  assert.equal(assetKey("private", "laborhutt", "a-k3f9x2m8.png"), "protected/laborhutt/a-k3f9x2m8.png");
  assert.deepEqual(parseAssetKey("protected/laborhutt/a-k3f9x2m8.png"), { visibility: "private", project: "laborhutt", name: "a-k3f9x2m8.png" });
  for (const key of ["private/x/a.png", "public/../a.png", "public/x/../a.png", "public/x/y/a.png", "public/X/a.png", "drafts/x/a.png"]) {
    assert.equal(parseAssetKey(key), null, key);
  }
});

test("the sign request is validated and the server builds the key", () => {
  const good = { name: "a-k3f9x2m8.png", project: "laborhutt", contentType: "image/png", size: 10, visibility: "private", expires: NOW + DAY, tags: { autodelete: "7d" } };
  const result = validateSignRequest(good, NOW);
  assert.ok(result.ok);
  assert.equal(result.value.key, "protected/laborhutt/a-k3f9x2m8.png");
  assert.deepEqual(result.value.tags, { autodelete: "7d" });

  const bad = (patch) => validateSignRequest({ ...good, ...patch }, NOW);
  assert.match(bad({ name: "../etc/passwd" }).error, /name/);
  assert.match(bad({ project: "a/b" }).error, /project/);
  assert.match(bad({ visibility: "world" }).error, /visibility/);
  assert.match(bad({ tags: { autodelete: "30d" } }).error, /autodelete=7d/);
  assert.match(bad({ expires: NOW - 1 }).error, /expires/);
  assert.ok(validateSignRequest({ ...good, expires: null, tags: undefined }, NOW).ok);
});

test("an asset slug is the readable stem plus a fresh id", () => {
  assert.equal(assetSlug("login-flow-k3f9x2m8.mp4", "zzzzzzzz"), "login-flow-zzzzzzzz");
  assert.equal(assetSlug("makefile-k3f9x2m8", "zzzzzzzz"), "makefile-zzzzzzzz");
  assert.match(assetSlug("a-k3f9x2m8.png"), /^a-[a-z0-9]{8}$/);
});

test("rm accepts a slug, an /a/ link or a bucket URL", () => {
  assert.deepEqual(parseAssetRef("login-flow-zzzzzzzz"), { slug: "login-flow-zzzzzzzz" });
  assert.deepEqual(parseAssetRef("https://example.convex.site/a/login-flow-zzzzzzzz"), { slug: "login-flow-zzzzzzzz" });
  assert.deepEqual(parseAssetRef("https://example-bucket.s3.us-east-1.amazonaws.com/public/p/a-k3f9x2m8.png"), { key: "public/p/a-k3f9x2m8.png" });
  assert.equal(parseAssetRef("https://example.com/d/some-draft"), null);
  assert.equal(parseAssetRef("not a slug"), null);
});
