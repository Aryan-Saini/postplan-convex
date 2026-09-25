import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { hasPython, makeIpa } from "./helpers/ipa.js";

/**
 * `postplan asset` end to end against a local stand-in for the API and S3: the
 * sign / PUT / record round trip, what the CLI sends, and what it prints.
 */

const CLI = path.resolve("bin/postplan.js");
const run = promisify(execFile);

/** A fake deployment: `/api/assets/*` plus `/s3/<key>` standing in for the bucket. */
async function fakeServer() {
  const log = { signs: [], puts: [], records: [] };
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    const base = `http://127.0.0.1:${server.address().port}`;
    const send = (value, status = 200) => res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(value));
    // The bucket never sees the API key; the API always does.
    if (req.url.startsWith("/s3/") === (req.headers.authorization !== undefined)) return send({ error: "Bad auth." }, 401);
    if (req.url.startsWith("/api/") && req.headers.authorization !== "Bearer test-key") return send({ error: "Unauthorized." }, 401);
    if (req.url === "/api/assets/sign") {
      const b = JSON.parse(body);
      log.signs.push(b);
      const key = `${b.visibility === "public" ? "public" : "protected"}/${b.project}/${b.name}`;
      const headers = b.tags?.autodelete ? { "x-amz-tagging": "autodelete=7d" } : {};
      return send({ key, url: `${base}/s3/${key}`, headers });
    }
    if (req.url.startsWith("/s3/")) {
      log.puts.push({ key: req.url.slice(4), headers: req.headers, body: body.toString("latin1") });
      return res.writeHead(200).end();
    }
    if (req.url === "/api/assets/record") {
      const b = JSON.parse(body);
      log.records.push(b);
      const isPublic = b.key.startsWith("public/");
      const slug = `${b.key.split("/").pop().replace(/\..*$/, "")}-slug`;
      return send({ url: isPublic ? `${base}/s3/${b.key}` : `${base}/a/${slug}`, slug, visibility: isPublic ? "public" : "private", expiresAt: b.expires ?? null, key: b.key });
    }
    send({ error: "Not found." }, 404);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { log, url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}

/** Run the CLI from a folder called `my-project` (not a git repo) with a throwaway HOME. */
async function cli(api, args) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "postplan-home-"));
  const cwd = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "postplan-cwd-")), "my-project");
  fs.mkdirSync(cwd);
  fs.writeFileSync(path.join(cwd, "Login Flow.png"), "PNGDATA");
  fs.writeFileSync(path.join(cwd, "app-release.apk"), "APKDATA");
  if (hasPython) makeIpa(path.join(cwd, "Demo.ipa"));
  const env = { ...process.env, HOME: home, POSTPLAN_API_URL: api.url, POSTPLAN_API_KEY: "test-key" };
  try {
    const { stdout } = await run(process.execPath, [CLI, ...args], { cwd, env });
    return { code: 0, stdout, stderr: "" };
  } catch (err) {
    return { code: err.code, stdout: err.stdout, stderr: err.stderr };
  }
}

test("a screenshot goes up public and permanent, named from the file and filed under the folder", async (t) => {
  const api = await fakeServer();
  t.after(api.close);
  const out = await cli(api, ["asset", "Login Flow.png"]);
  assert.equal(out.code, 0, out.stderr);

  const [sign] = api.log.signs;
  assert.match(sign.name, /^login-flow-[a-z0-9]{8}\.png$/);
  assert.equal(sign.project, "my-project");
  assert.equal(sign.visibility, "public");
  assert.equal(sign.contentType, "image/png");
  assert.equal(sign.size, 7);
  assert.equal(sign.expires, null);
  assert.deepEqual(sign.tags, {});

  const [put] = api.log.puts;
  assert.equal(put.body, "PNGDATA");
  assert.equal(put.headers["x-amz-tagging"], undefined);
  assert.match(out.stdout, /^Uploaded Login Flow\.png \(public\)\nURL: http:\/\/127\.0\.0\.1:\d+\/s3\/public\/my-project\/login-flow-[a-z0-9]{8}\.png\n$/);
});

test("a build defaults to 7 days, is tagged, and --json prints the record", async (t) => {
  const api = await fakeServer();
  t.after(api.close);
  const before = Date.now();
  const out = await cli(api, ["asset", "app-release.apk", "--private", "--project", "Syncafy App", "--json"]);
  assert.equal(out.code, 0, out.stderr);

  const [sign] = api.log.signs;
  assert.equal(sign.project, "syncafy-app");
  assert.deepEqual(sign.tags, { autodelete: "7d" });
  assert.ok(Math.abs(sign.expires - (before + 7 * 86_400_000)) < 60_000);
  assert.equal(api.log.puts[0].headers["x-amz-tagging"], "autodelete=7d");
  assert.equal(api.log.puts[0].headers["content-type"], "application/vnd.android.package-archive");

  const printed = JSON.parse(out.stdout);
  assert.deepEqual(Object.keys(printed).sort(), ["expiresAt", "key", "slug", "url", "visibility"]);
  assert.equal(printed.visibility, "private");
  assert.match(printed.url, /\/a\/app-release-[a-z0-9]{8}-slug$/);
});

test("an ipa also gets a manifest pointing at it and an install page pointing at the manifest", { skip: !hasPython && "needs python3" }, async (t) => {
  const api = await fakeServer();
  t.after(api.close);
  const out = await cli(api, ["asset", "Demo.ipa", "--private"]);
  assert.equal(out.code, 0, out.stderr);

  const names = api.log.signs.map((s) => s.name);
  assert.equal(names.length, 3);
  const suffix = names[0].match(/^demo-([a-z0-9]{8})\.ipa$/)[1];
  assert.deepEqual(names.slice(1), [`demo-${suffix}.plist`, `demo-${suffix}.html`]);
  assert.ok(api.log.signs.every((s) => s.visibility === "private" && s.tags.autodelete === "7d"));

  const [ipa, manifest, page] = api.log.puts;
  assert.equal(ipa.headers["x-amz-tagging"], "autodelete=7d");
  assert.match(manifest.body, new RegExp(`<string>${api.url}/a/demo-${suffix}-slug</string>`));
  assert.match(manifest.body, /<string>com\.example\.demo<\/string>/);
  const link = `itms-services://?action=download-manifest&url=${encodeURIComponent(`${api.url}/a/demo-${suffix}-slug`)}`;
  assert.ok(page.body.includes(link.replace("&", "&amp;")));
  assert.match(out.stdout, /Expires: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\n/);
  assert.ok(out.stdout.includes(`Install: ${link}\n`));
  assert.ok(out.stdout.includes(`Install page: ${api.url}/a/demo-${suffix}-slug\n`));
});

test("several files at once, with an explicit expiry", async (t) => {
  const api = await fakeServer();
  t.after(api.close);
  const out = await cli(api, ["asset", "app-release.apk", "Login Flow.png", "--no-manifest", "--expires", "24h"]);
  assert.equal(out.code, 0, out.stderr);
  assert.equal(api.log.signs.length, 2);
  assert.ok(api.log.signs.every((s) => s.tags.autodelete === "7d"));
  assert.equal((out.stdout.match(/^Expires: /gm) ?? []).length, 2);
});

test("--no-manifest uploads an ipa alone", { skip: !hasPython && "needs python3" }, async (t) => {
  const api = await fakeServer();
  t.after(api.close);
  const out = await cli(api, ["asset", "Demo.ipa", "--no-manifest"]);
  assert.equal(out.code, 0, out.stderr);
  assert.equal(api.log.signs.length, 1);
  assert.doesNotMatch(out.stdout, /Install/);
});

test("bad input fails before anything is uploaded", async (t) => {
  const api = await fakeServer();
  t.after(api.close);
  for (const [args, message] of [
    [["asset", "Login Flow.png", "--expires", "3w"], /--expires: expected 7d, 24h/],
    [["asset", "Login Flow.png", "missing.png"], /Not a file: .*missing\.png/],
    [["asset"], /Give at least one file/],
    [["asset", "Login Flow.png", "--project", "!!!"], /--project needs letters or digits/],
    [["asset", "rm", "not a slug"], /Not an asset slug or URL/]
  ]) {
    const out = await cli(api, args);
    assert.equal(out.code, 1, args.join(" "));
    assert.match(out.stderr, message);
  }
  assert.equal(api.log.signs.length + api.log.puts.length, 0);
});
