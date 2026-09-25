import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { installPage, itmsLink, manifestPlist, readIpaInfo } from "../src/ios.js";
import { hasPython, makeIpa } from "./helpers/ipa.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "postplan-ios-"));

test("reads the app's Info.plist, binary or XML, and not a framework's", { skip: !hasPython && "needs python3" }, () => {
  const binary = path.join(tmp, "binary.ipa");
  makeIpa(binary);
  assert.deepEqual(readIpaInfo(binary), { bundleId: "com.example.demo", version: "1.4.2", title: "Demo" });

  const xml = path.join(tmp, "xml.ipa");
  makeIpa(xml, { binary: false, bundleId: "com.example.other", version: "2.0" });
  assert.deepEqual(readIpaInfo(xml), { bundleId: "com.example.other", version: "2.0", title: "Demo" });
});

test("an archive without an app says so", { skip: !hasPython && "needs python3" }, () => {
  const empty = path.join(tmp, "empty.ipa");
  makeIpa(empty, { app: "" });
  assert.throws(() => readIpaInfo(empty), /no Payload\/\*\.app\/Info\.plist/);
  const notZip = path.join(tmp, "not.ipa");
  fs.writeFileSync(notZip, "hello");
  assert.throws(() => readIpaInfo(notZip), /Could not read .*not a zip file/);
});

test("the manifest and install page carry escaped values and an encoded manifest URL", () => {
  const plist = manifestPlist({ url: "https://h/a/x?y=1&z=2", bundleId: "com.a", version: "1.0", title: "A & B" });
  assert.match(plist, /<string>https:\/\/h\/a\/x\?y=1&amp;z=2<\/string>/);
  assert.match(plist, /<key>bundle-identifier<\/key><string>com\.a<\/string>/);
  assert.match(plist, /<string>A &amp; B<\/string>/);

  const link = itmsLink("https://h/a/demo-plist-12345678");
  assert.equal(link, "itms-services://?action=download-manifest&url=https%3A%2F%2Fh%2Fa%2Fdemo-plist-12345678");
  const page = installPage({ title: "<Demo>", version: "1.0", bundleId: "com.a", link });
  assert.ok(page.includes(`href="${link.replace("&", "&amp;")}"`));
  assert.ok(page.includes("&lt;Demo&gt;") && !page.includes("<Demo>"));
});
