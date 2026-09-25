import { execFileSync } from "node:child_process";

/** True when python3 is on PATH; the ipa tests need it to build fixtures and to read them. */
export const hasPython = (() => {
  try {
    execFileSync("python3", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

/**
 * Write a tiny `.ipa`: a zip with `Payload/<app>.app/Info.plist`, binary by
 * default, plus a framework plist that must be ignored.
 */
export function makeIpa(file, { bundleId = "com.example.demo", version = "1.4.2", name = "Demo", binary = true, app = "Demo" } = {}) {
  execFileSync("python3", ["-c", `
import plistlib, sys, zipfile
fmt = plistlib.FMT_BINARY if sys.argv[2] == "1" else plistlib.FMT_XML
info = {"CFBundleIdentifier": sys.argv[3], "CFBundleShortVersionString": sys.argv[4], "CFBundleName": sys.argv[5]}
with zipfile.ZipFile(sys.argv[1], "w") as z:
    if sys.argv[6]:
        z.writestr("Payload/" + sys.argv[6] + ".app/Frameworks/X.framework/Info.plist", plistlib.dumps({"CFBundleIdentifier": "wrong"}, fmt=fmt))
        z.writestr("Payload/" + sys.argv[6] + ".app/Info.plist", plistlib.dumps(info, fmt=fmt))
    z.writestr("Payload/readme.txt", "x")
`, file, binary ? "1" : "0", bundleId, version, name, app]);
}
