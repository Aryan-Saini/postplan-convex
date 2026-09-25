/**
 * What a file is, from its name: the glyph, the plain-English label and the
 * group, plus the expiry arithmetic both file surfaces share.
 *
 * Two places draw files: a document's `file` fence (`files.js`) and the /s/
 * send page (`convex/lib/downloadPage.ts`). Both read this module so an .apk
 * gets the same icon and "Android package" label in either. It is pure and
 * has no dependencies beyond the icon tables, so the Convex bundle can import it.
 *
 * `expiryLabel` is embedded as source in both pages' scripts, so it must stay
 * self-contained: no references to anything outside its own body.
 *
 * @module render/filetypes
 */

import { FILE_ICONS } from "./file-icons.js";
import { ICONS as LANG_ICONS, iconKey } from "./code.js";

/**
 * The group a type belongs to. The send page previews by group (`image`,
 * `video`, `audio`, `pdf`, `text`); the rest only pick a glyph and a label.
 * @typedef {"image" | "video" | "audio" | "pdf" | "doc" | "sheet" | "text" | "archive"
 *   | "package" | "data" | "font" | "design" | "key" | "file"} FileGroup
 */

/** @typedef {{ ext: string, icon: string, label: string, group: FileGroup }} FileType */

/** `[icon, label, group]` per extension. A `null` icon means "the language icon from code.js". */
const T = (icon, label, group, exts) => exts.split(" ").map((e) => [e, /** @type {const} */ ([icon, label, group])]);

/** @type {Map<string, readonly [string | null, string, FileGroup]>} */
const TYPES = new Map([
  ...T("ft-image", "Image", "image", "png jpg jpeg gif webp svg heic heif avif bmp tif tiff ico"),
  ...T("ft-video", "Video", "video", "mp4 m4v mov webm mkv avi"),
  ...T("ft-audio", "Audio", "audio", "mp3 wav m4a aac flac ogg opus"),
  ...T("ft-pdf", "PDF document", "pdf", "pdf"),
  ...T("ft-word", "Word document", "doc", "doc docx"),
  ...T("ft-word", "Rich text", "doc", "rtf"),
  ...T("ft-slides", "Presentation", "doc", "ppt pptx"),
  ...T("ft-excel", "Spreadsheet", "sheet", "xls xlsx xlsm ods numbers"),
  ...T("ft-sheet", "Comma-separated values", "sheet", "csv"),
  ...T("ft-sheet", "Tab-separated values", "sheet", "tsv"),
  ...T("ft-epub", "E-book", "doc", "epub"),
  ...T("text", "Plain text", "text", "txt"),
  ...T("text", "Log file", "text", "log"),
  ...T("md", "Markdown", "text", "md mdx"),
  ...T("ft-archive", "Archive", "archive", "zip tar gz tgz 7z rar bz2 xz zst"),
  ...T("ft-android", "Android package", "package", "apk"),
  ...T("ft-android", "Android app bundle", "package", "aab"),
  ...T("ft-ipa", "iOS app", "package", "ipa"),
  ...T("ft-apple", "macOS disk image", "package", "dmg"),
  ...T("ft-apple", "macOS installer", "package", "pkg"),
  ...T("ft-window", "Windows installer", "package", "exe msi msix"),
  ...T("ft-package", "Debian package", "package", "deb"),
  ...T("ft-redhat", "RPM package", "package", "rpm"),
  ...T("ft-appimage", "Linux app", "package", "appimage"),
  ...T("ft-snap", "Snap package", "package", "snap"),
  ...T("ft-jar", "Java archive", "package", "jar"),
  ...T("ft-pypi", "Python wheel", "package", "whl"),
  ...T("ft-gem", "Ruby gem", "package", "gem"),
  ...T("ft-db", "SQLite database", "data", "sqlite sqlite3"),
  ...T("ft-db", "Database", "data", "db"),
  ...T("ft-parquet", "Parquet data", "data", "parquet"),
  ...T("ft-jupyter", "Jupyter notebook", "data", "ipynb"),
  ...T("ft-font", "Font", "font", "ttf otf woff woff2"),
  ...T("ft-figma", "Figma file", "design", "fig"),
  ...T("ft-sketch", "Sketch file", "design", "sketch"),
  ...T("ft-psd", "Photoshop file", "design", "psd"),
  ...T("ft-ai", "Illustrator file", "design", "ai"),
  ...T("ft-key", "PEM key or certificate", "key", "pem"),
  ...T("ft-key", "Private key", "key", "key"),
  ...T("ft-cert", "Certificate", "key", "crt cer"),
  // Code and config: the code-block icon for the language.
  ...T(null, "TypeScript source", "text", "ts tsx mts cts"),
  ...T(null, "JavaScript source", "text", "js jsx mjs cjs"),
  ...T(null, "Python source", "text", "py"),
  ...T(null, "Rust source", "text", "rs"),
  ...T(null, "Go source", "text", "go"),
  ...T(null, "Ruby source", "text", "rb"),
  ...T(null, "Java source", "text", "java"),
  ...T(null, "Kotlin source", "text", "kt kts"),
  ...T(null, "Swift source", "text", "swift"),
  ...T(null, "C source", "text", "c h"),
  ...T(null, "C++ source", "text", "cpp cc hpp"),
  ...T(null, "C# source", "text", "cs"),
  ...T(null, "PHP source", "text", "php"),
  ...T(null, "Erlang source", "text", "erl"),
  ...T(null, "Elixir source", "text", "ex exs"),
  ...T(null, "Shell script", "text", "sh bash zsh"),
  ...T(null, "SQL", "text", "sql"),
  ...T(null, "HTML", "text", "html htm"),
  ...T(null, "Stylesheet", "text", "css"),
  ...T(null, "GraphQL schema", "text", "graphql gql"),
  ...T(null, "Protocol Buffers", "text", "proto"),
  ...T(null, "Vue component", "text", "vue"),
  ...T(null, "Svelte component", "text", "svelte"),
  ...T(null, "JSON data", "text", "json"),
  ...T(null, "YAML config", "text", "yaml yml"),
  ...T(null, "TOML config", "text", "toml"),
  ...T(null, "XML", "text", "xml"),
  ...T(null, "Config file", "text", "ini cfg conf"),
  ...T(null, "Environment file", "text", "env"),
]);

/** Every extension this module knows, for the fence's `kind` check. */
export const FILE_KINDS = [...TYPES.keys()];

/** The lower-cased extension of a file name, or "" (a dotfile like `.env` is its own extension). */
export function extOf(name) {
  return /\.([a-z0-9]+)$/i.exec(String(name))?.[1]?.toLowerCase() ?? "";
}

/**
 * What a file is. `kind` (an extension like `"apk"`) wins over the name's own
 * extension; an unknown one falls back to the generic page glyph and "File".
 *
 * @param {string} name
 * @param {string} [kind]
 * @returns {FileType}
 */
export function fileType(name, kind) {
  const ext = (kind || extOf(name)).toLowerCase();
  const hit = TYPES.get(ext);
  if (!hit) return { ext, icon: "ft-file", label: "File", group: "file" };
  const [icon, label, group] = hit;
  return { ext, icon: icon ?? iconKey(ext), label, group };
}

/**
 * The `<symbol>` for a file icon key, from the file set or the language set,
 * or "" for a key neither has. `id` is the element id the page's `<use>` points at.
 *
 * @param {string} key
 * @param {string} id
 */
export function fileSymbol(key, id) {
  const file = FILE_ICONS[key];
  if (file) return `<symbol id="${id}" viewBox="${file[0]}">${file[1]}</symbol>`;
  const lang = LANG_ICONS[/** @type {keyof typeof LANG_ICONS} */ (key)];
  return lang ? `<symbol id="${id}" viewBox="0 0 16 16">${lang}</symbol>` : "";
}

/** Does this key name a file-type glyph (as opposed to an interface icon)? */
export const isFileIcon = (key) => key in FILE_ICONS;

/** Decimal file size, the way a download dialog shows it: `48.2 MB`, `812 KB`, `90 B`. */
export function fmtBytes(n) {
  if (!(n >= 1000)) return `${Math.max(0, Math.round(n || 0))} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n, i = -1;
  while (v >= 1000 && i < units.length - 1) v /= 1000, i++;
  return `${v >= 100 ? Math.round(v) : Number(v.toFixed(1))} ${units[i]}`;
}

/** "Sep 26, 2:00 PM" in the reader's zone, or "Sep 26, 9:00 PM UTC". */
export function fmtWhen(ms, utc = false) {
  const opts = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
  const s = new Date(ms).toLocaleString("en-US", utc ? { ...opts, timeZone: "UTC" } : opts).replace(/ /g, " ");
  return utc ? `${s} UTC` : s;
}

/**
 * The expiry pill for a link. More than 48 hours out it reads as a date
 * ("Expires Sep 26, 2:00 PM"); inside 48 hours as a countdown ("23h 12m left"),
 * `warn` under 6 hours and `critical` under 1; past it, "Expired". Minutes
 * round down, so a pill ticked once a minute never overstates what is left.
 *
 * Self-contained on purpose: the page scripts embed its source.
 *
 * @param {number} expiresMs
 * @param {number} nowMs
 * @param {{ utc?: boolean }} [opts] `utc` formats the date in UTC and says so, for server-rendered text
 * @returns {{ text: string, tone: "" | "warn" | "critical", state: "far" | "soon" | "expired" }}
 */
export function expiryLabel(expiresMs, nowMs, opts = {}) {
  const left = expiresMs - nowMs;
  if (!(left > 0)) return { text: "Expired", tone: "critical", state: "expired" };
  const hour = 3600000;
  if (left > 48 * hour) {
    const fmt = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
    const when = new Date(expiresMs).toLocaleString("en-US", opts.utc ? { ...fmt, timeZone: "UTC" } : fmt)
      .replace(/ /g, " ");
    return { text: `Expires ${when}${opts.utc ? " UTC" : ""}`, tone: "", state: "far" };
  }
  const mins = Math.max(1, Math.floor(left / 60000));
  const h = Math.floor(mins / 60);
  const text = h ? `${h}h ${mins % 60}m left` : `${mins}m left`;
  return { text, tone: left < hour ? "critical" : left < 6 * hour ? "warn" : "", state: "soon" };
}

/**
 * When an S3 presign stops working: `X-Amz-Date` plus `X-Amz-Expires`
 * seconds, in epoch ms. `undefined` when the URL is not a presign, `NaN` when
 * it is one whose params do not parse.
 *
 * @param {string} src
 * @returns {number | undefined}
 */
export function signedExpiry(src) {
  let params;
  try {
    params = new URL(src, "https://base.invalid/").searchParams;
  } catch {
    return undefined;
  }
  const date = params.get("X-Amz-Date");
  const expires = params.get("X-Amz-Expires");
  if (date === null && expires === null) return undefined;
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(date || "");
  if (!m || !/^\d+$/.test(expires || "")) return NaN;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) + Number(expires) * 1000;
}
