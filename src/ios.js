/**
 * The iOS install flow for `postplan asset <app>.ipa`.
 *
 * A bare `.ipa` URL does nothing on a device; iOS installs from an
 * `itms-services://` link pointing at a manifest plist served over HTTPS. The CLI
 * reads the bundle id and version out of the archive, uploads the manifest and a
 * one-link install page next to the ipa, and prints both.
 *
 * CLI only: `readIpaInfo` shells out, so the Convex server never imports this.
 *
 * @module ios
 */

import { execFileSync } from "node:child_process";

/** @typedef {{ bundleId: string, version: string, title: string }} IpaInfo */

// Python's zipfile + plistlib read both XML and binary plists on Linux and macOS.
// Only the app's own Info.plist counts, not a framework's deeper in the bundle.
const PY_READ = `
import json, plistlib, re, sys, zipfile
try:
    with zipfile.ZipFile(sys.argv[1]) as z:
        names = [n for n in z.namelist() if re.fullmatch(r"Payload/[^/]+\\.app/Info\\.plist", n)]
        if not names:
            sys.exit("postplan: no Payload/*.app/Info.plist in the archive")
        info = plistlib.loads(z.read(names[0]))
except (zipfile.BadZipFile, plistlib.InvalidFileException) as e:
    sys.exit("postplan: " + str(e))
print(json.dumps({k: info.get(k) for k in ("CFBundleIdentifier", "CFBundleShortVersionString", "CFBundleVersion", "CFBundleDisplayName", "CFBundleName")}))
`;

/**
 * Bundle id, marketing version and display name of an `.ipa`. Uses python3;
 * falls back to `unzip -p | plutil` on a Mac without it. Throws a printable
 * message when neither works or the archive is not an app.
 *
 * @param {string} file
 * @returns {IpaInfo}
 */
export function readIpaInfo(file) {
  /** @type {Record<string, unknown>} */
  let raw;
  try {
    raw = JSON.parse(execFileSync("python3", ["-c", PY_READ, file], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  } catch (err) {
    const stderr = String(/** @type {{ stderr?: unknown }} */ (err).stderr ?? "").trim();
    // A problem with the archive is final; a missing or broken python3 falls back.
    const ours = /postplan: (.*)/.exec(stderr);
    if (ours) throw new Error(`Could not read ${file}: ${ours[1]}`);
    raw = readWithPlutil(file);
  }
  const bundleId = typeof raw.CFBundleIdentifier === "string" ? raw.CFBundleIdentifier : "";
  const version = [raw.CFBundleShortVersionString, raw.CFBundleVersion].find((v) => typeof v === "string" && v) ?? "";
  if (!bundleId || typeof version !== "string" || !version) {
    throw new Error(`${file}: Info.plist has no CFBundleIdentifier or CFBundleShortVersionString`);
  }
  const title = [raw.CFBundleDisplayName, raw.CFBundleName].find((v) => typeof v === "string" && v) ?? bundleId;
  return { bundleId, version, title: String(title) };
}

function readWithPlutil(file) {
  try {
    const list = execFileSync("unzip", ["-Z1", file], { encoding: "utf8" }).split("\n");
    const entry = list.find((n) => /^Payload\/[^/]+\.app\/Info\.plist$/.test(n));
    if (!entry) throw new Error("no Payload/*.app/Info.plist in the archive");
    const plist = execFileSync("unzip", ["-p", file, entry]);
    return JSON.parse(execFileSync("plutil", ["-convert", "json", "-o", "-", "-"], { input: plist, encoding: "utf8" }));
  } catch (err) {
    throw new Error(`Could not read ${file}: needs python3, or unzip and plutil (${err instanceof Error ? err.message : err})`);
  }
}

const xml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The manifest iOS downloads from the itms-services link; `url` is the ipa's https URL. */
export function manifestPlist({ url, bundleId, version, title }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>items</key>
  <array>
    <dict>
      <key>assets</key>
      <array>
        <dict>
          <key>kind</key><string>software-package</string>
          <key>url</key><string>${xml(url)}</string>
        </dict>
      </array>
      <key>metadata</key>
      <dict>
        <key>bundle-identifier</key><string>${xml(bundleId)}</string>
        <key>bundle-version</key><string>${xml(version)}</string>
        <key>kind</key><string>software</string>
        <key>title</key><string>${xml(title)}</string>
      </dict>
    </dict>
  </array>
</dict>
</plist>
`;
}

/** The `itms-services://` link for a manifest at `manifestUrl` (which must be https). */
export function itmsLink(manifestUrl) {
  return `itms-services://?action=download-manifest&url=${encodeURIComponent(manifestUrl)}`;
}

/** The page opened on the device: the app's name, its version, one Install link. */
export function installPage({ title, version, bundleId, link }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><meta name="referrer" content="no-referrer">
<title>Install ${xml(title)}</title></head>
<body style="margin:0;background:#000;color:#fff;font:17px/1.5 system-ui,-apple-system,sans-serif">
<main style="width:min(560px,calc(100% - 32px));margin:0 auto;padding:44px 0">
<h1 style="font-size:24px;margin:0 0 4px">${xml(title)}</h1>
<p style="margin:0 0 28px;color:#fff">${xml(version)} · ${xml(bundleId)}</p>
<p><a href="${xml(link)}" style="display:inline-block;background:#fff;color:#000;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">Install</a></p>
<p style="margin-top:28px;color:#fff">Open this page in Safari on the device. It must be in the build's provisioning profile.</p>
</main></body></html>
`;
}
