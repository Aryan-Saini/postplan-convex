/**
 * Assets: files published to Aryan's personal bucket by `postplan asset`.
 *
 * Shared by the CLI (which names the object and plans its expiry) and the Convex
 * server (which re-validates the request and builds the key), so the rules live
 * in one place and node tests cover both sides. Nothing here touches the network
 * or the filesystem.
 *
 * @module assets
 */

/** @typedef {"public" | "private"} Visibility */
/** @typedef {{ autodelete?: "7d" }} AssetTags */

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

/** The bucket prefix each visibility lives under. `protected/` has no anonymous access. */
export const PREFIXES = /** @type {const} */ ({ public: "public", private: "protected" });

/** The only lifecycle rule on the bucket: objects tagged `autodelete=7d` go 7 days after upload. */
export const AUTODELETE_MS = 7 * DAY;

/**
 * `length` random chars from [a-z0-9], unbiased (bytes >= 252 are redrawn so
 * every char is equally likely). Web Crypto, so it runs in Node and in Convex.
 */
export function randomId(length = 8) {
  let out = "";
  while (out.length < length) {
    for (const b of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (b < 252 && out.length < length) out += ALPHABET[b % 36];
    }
  }
  return out;
}

/** Lowercase, runs of anything but [a-z0-9] become one hyphen, no leading/trailing hyphen. */
export function slugify(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * The object name for an uploaded file: its basename lowercased and hyphenated,
 * with a random 8-char suffix before the extension, so names never collide and a
 * URL is never guessable. `Login Flow.MP4` becomes `login-flow-k3f9x2m8.mp4`.
 *
 * @param {string} basename
 * @param {string} [suffix] defaults to a fresh random id
 */
export function objectName(basename, suffix = randomId()) {
  const dot = basename.lastIndexOf(".");
  const hasExt = dot > 0 && dot < basename.length - 1;
  const stem = slugify(hasExt ? basename.slice(0, dot) : basename).slice(0, 80).replace(/-+$/, "") || "file";
  const ext = hasExt ? basename.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12) : "";
  return `${stem}-${suffix}${ext ? `.${ext}` : ""}`;
}

/** Folders that say nothing about the work, so a file uploaded from them goes under `random`. */
const GENERIC_FOLDERS = new Set([
  "", "desktop", "documents", "downloads", "tmp", "temp", "var", "private", "users", "home", "root",
  "pictures", "movies", "videos", "screenshots", "icloud-drive", "mobile-documents"
]);

/**
 * The project an asset is filed under, which keeps the bucket browsable: the git
 * repo's name if there is one, else the current folder's name, else `random` when
 * the folder is generic (`~`, Desktop, Downloads, tmp and the like).
 *
 * @param {{ repoName?: string | null, cwd: string, home?: string }} where
 */
export function inferProject({ repoName, cwd, home }) {
  const fromRepo = repoName ? slugify(repoName) : "";
  if (fromRepo) return fromRepo;
  const trimmed = cwd.replace(/\/+$/, "");
  if (home && trimmed === home.replace(/\/+$/, "")) return "random";
  const folder = slugify(trimmed.split("/").pop() ?? "");
  return GENERIC_FOLDERS.has(folder) ? "random" : folder;
}

const BUILD_EXTENSIONS = new Set(["ipa", "apk", "aab", "app", "dmg", "pkg", "exe", "msi"]);

/** An installable build: those extensions, or a `.zip` whose name mentions "build". */
export function isBuild(name) {
  const lower = name.toLowerCase();
  const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".") + 1) : "";
  return BUILD_EXTENSIONS.has(ext) || (ext === "zip" && lower.includes("build"));
}

/**
 * When `--expires` says the asset stops working, in epoch ms, or null for
 * permanent. Accepts `7d`, `24h`, `never`, or an ISO date/time in the future.
 * Throws with a message fit to print.
 *
 * @param {string} value
 * @param {number} [now]
 * @returns {number | null}
 */
export function parseExpires(value, now = Date.now()) {
  const text = String(value).trim().toLowerCase();
  if (text === "never") return null;
  const rel = /^(\d+)\s*([dh])$/.exec(text);
  if (rel) {
    const amount = Number(rel[1]);
    if (amount <= 0) throw new Error(`--expires must be in the future, got ${value}`);
    return now + amount * (rel[2] === "d" ? DAY : HOUR);
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(String(value).trim())) {
    const at = Date.parse(String(value).trim());
    if (Number.isNaN(at)) throw new Error(`--expires: not a valid date: ${value}`);
    if (at <= now) throw new Error(`--expires must be in the future, got ${value}`);
    return at;
  }
  throw new Error(`--expires: expected 7d, 24h, never, or an ISO date like 2026-10-01T12:00:00Z, got ${value}`);
}

/**
 * Expiry and tags for one upload. Builds default to 7 days. Anything that
 * expires within 7 days is tagged `autodelete=7d`, so the bucket's lifecycle rule
 * removes the bytes no earlier than the link stops working; a longer expiry is
 * enforced by `/a/` only and the bytes stay until removed.
 *
 * @param {{ name: string, expires?: string, now?: number }} input
 * @returns {{ expiresAt: number | null, tags: AssetTags }}
 */
export function planExpiry({ name, expires, now = Date.now() }) {
  const expiresAt = parseExpires(expires ?? (isBuild(name) ? "7d" : "never"), now);
  const tags = expiresAt !== null && expiresAt - now <= AUTODELETE_MS + 60_000 ? { autodelete: /** @type {const} */ ("7d") } : {};
  return { expiresAt, tags };
}

/** `2026-10-02T14:03:11Z`: the form `Expires:` prints and the `file` fence's `expires` accepts. */
export function isoInstant(ms) {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

const NAME_RE = /^[a-z0-9][a-z0-9-]*(?:\.[a-z0-9]{1,12})?$/;
const PROJECT_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** The object key: `public/<project>/<name>` or `protected/<project>/<name>`. */
export function assetKey(visibility, project, name) {
  return `${PREFIXES[visibility]}/${project}/${name}`;
}

/**
 * The inverse of `assetKey`, or null for anything that is not one. The server
 * uses it to refuse a key outside the two prefixes.
 *
 * @returns {{ visibility: Visibility, project: string, name: string } | null}
 */
export function parseAssetKey(key) {
  const m = /^(public|protected)\/([^/]+)\/([^/]+)$/.exec(String(key));
  if (!m || !PROJECT_RE.test(m[2]) || !NAME_RE.test(m[3]) || m[3].length > 200) return null;
  return { visibility: m[1] === "public" ? "public" : "private", project: m[2], name: m[3] };
}

/**
 * Validate a `POST /api/assets/sign` body. Returns the request with its key, or
 * the first problem as a message.
 *
 * @param {unknown} body
 * @param {number} [now]
 * @returns {{ ok: true, value: { key: string, name: string, project: string, visibility: Visibility, contentType: string, size: number, expiresAt: number | null, tags: AssetTags } } | { ok: false, error: string }}
 */
export function validateSignRequest(body, now = Date.now()) {
  const fail = (error) => ({ ok: /** @type {const} */ (false), error });
  if (typeof body !== "object" || body === null) return fail("Invalid body.");
  const { name, project, contentType, size, visibility, expires, tags } = /** @type {Record<string, unknown>} */ (body);
  if (typeof name !== "string" || !NAME_RE.test(name) || name.length > 200) return fail("name must be a lowercased, hyphenated object name.");
  if (typeof project !== "string" || !PROJECT_RE.test(project)) return fail("project must be lowercase letters, digits and hyphens.");
  if (visibility !== "public" && visibility !== "private") return fail("visibility must be public or private.");
  if (typeof contentType !== "string" || !contentType || contentType.length > 200) return fail("contentType is required.");
  if (typeof size !== "number" || !Number.isFinite(size) || size < 0 || size > 5 * 1024 ** 3) return fail("size must be 0 to 5 GB.");
  if (expires !== undefined && expires !== null && (typeof expires !== "number" || expires <= now)) return fail("expires must be a future epoch-ms time.");
  /** @type {AssetTags} */
  const cleanTags = {};
  if (tags !== undefined && tags !== null) {
    if (typeof tags !== "object") return fail("tags must be an object.");
    for (const [k, v] of Object.entries(tags)) {
      if (k !== "autodelete" || v !== "7d") return fail("the only supported tag is autodelete=7d.");
      cleanTags.autodelete = "7d";
    }
  }
  return {
    ok: true,
    value: {
      key: assetKey(visibility, project, name),
      name, project, visibility, contentType, size,
      expiresAt: typeof expires === "number" ? expires : null,
      tags: cleanTags
    }
  };
}

/** The `x-amz-tagging` value for a set of tags, or undefined when there are none. */
export function taggingHeader(tags) {
  const pairs = Object.entries(tags ?? {});
  return pairs.length ? pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&") : undefined;
}

/** The asset slug: the readable stem of its object name plus 8 random chars. */
export function assetSlug(name, suffix = randomId()) {
  const stem = slugify(name.replace(/\.[a-z0-9]+$/, "").replace(/-[a-z0-9]{8}$/, "")).slice(0, 40).replace(/-+$/, "");
  return stem ? `${stem}-${suffix}` : suffix;
}

/**
 * What `postplan asset rm` was given: an `/a/<slug>` link, a bucket URL (by key),
 * or a bare slug.
 *
 * @returns {{ slug: string } | { key: string } | null}
 */
export function parseAssetRef(input) {
  const text = String(input).trim();
  if (!text) return null;
  if (/^https?:\/\//i.test(text)) {
    let url;
    try {
      url = new URL(text);
    } catch {
      return null;
    }
    const a = /^\/a\/([^/]+)\/?$/.exec(url.pathname);
    if (a) return { slug: decodeURIComponent(a[1]) };
    const key = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    return parseAssetKey(key) ? { key } : null;
  }
  return /^[a-z0-9][a-z0-9-]*$/.test(text) ? { slug: text } : null;
}
