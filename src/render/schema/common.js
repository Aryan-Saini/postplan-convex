/**
 * Shared machinery for the block validators.
 *
 * Every validator is hand-rolled (no zod, no new dependencies) so the exact
 * error text stays under our control: the CLI prints these strings, an agent
 * reads them, and a fixture test pins them byte-for-byte.
 *
 * A diagnostic is `{ file, line, block, message }`, the same `RenderError` the
 * parser emits. `message` opens with a JSON pointer into the fence body when the
 * fault has a location inside it (`/series/0/values expected 8 numbers …`).
 *
 * @module render/schema/common
 */

/** @typedef {import("../ir.js").RenderError} RenderError */

/** The `format` enum. Never a template string; presets only. */
export const FORMATS = /** @type {const} */ (["int", "compact", "usd", "pct", "ms"]);

/** Tone names a tile, a schedule bar or a flow node may carry. */
export const TONES = /** @type {const} */ (["good", "warn", "bad", "flat"]);

/** Colour slots in the categorical palette; also the hard cap on series. */
export const MAX_SERIES = 8;

const FORMAT_SET = new Set(FORMATS);
const TONE_SET = new Set(TONES);

/**
 * Render a value for an error message. Primitives quote as JSON so `"n/a"`
 * reads back exactly as authored; containers summarise rather than dump.
 *
 * @param {unknown} v
 * @returns {string}
 */
export function show(v) {
  if (v === undefined) return "nothing";
  if (typeof v === "number" && !Number.isFinite(v)) return String(v);
  if (Array.isArray(v)) return `an array of ${v.length}`;
  if (typeof v === "object" && v !== null) return "an object";
  return JSON.stringify(v);
}

/** Escape a JSON pointer token per RFC 6901. */
const token = (key) => String(key).replace(/~/g, "~0").replace(/\//g, "~1");

/** Append segments to a JSON pointer. `ptr("", "series", 0)` -> `/series/0`. */
export function ptr(base, ...segments) {
  return base + segments.map((s) => `/${token(s)}`).join("");
}

/**
 * Collector for one block. Validators push through `ctx.at()` and never throw,
 * so a single bad fence cannot stop the rest of the document from being checked.
 */
export class Ctx {
  /**
   * @param {RenderError[]} errors shared sink for the whole document
   * @param {string} file
   * @param {number} line 1-based line of the block's opening fence
   * @param {string} block label used in the error prefix (`"chart lines"`)
   */
  constructor(errors, file, line, block) {
    this.errors = errors;
    this.file = file;
    this.line = line;
    this.block = block;
    this.start = errors.length;
  }

  /** Record a diagnostic at `pointer` inside the fence body. */
  at(pointer, message) {
    this.errors.push({
      file: this.file,
      line: this.line,
      block: this.block,
      message: pointer ? `${pointer} ${message}` : message,
    });
    return false;
  }

  /** True when this block has produced no diagnostics yet. */
  get ok() {
    return this.errors.length === this.start;
  }
}

/* ------------------------------------------------------------------ primitives */

/** A plain object, not an array and not null. */
export function isObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** @returns {v is Record<string, unknown>} */
export function wantObject(ctx, v, pointer, what = "an object") {
  if (isObject(v)) return true;
  return ctx.at(pointer, `expected ${what}, got ${show(v)}`);
}

/** @returns {v is unknown[]} */
export function wantArray(ctx, v, pointer, what = "an array") {
  if (Array.isArray(v)) return true;
  return ctx.at(pointer, `expected ${what}, got ${show(v)}`);
}

/** A non-empty array. `what` names the element, e.g. `"at least one slide"`. */
export function wantNonEmptyArray(ctx, v, pointer, what) {
  if (!wantArray(ctx, v, pointer, what)) return false;
  if (v.length === 0) return ctx.at(pointer, `expected ${what}, got an empty array`);
  return true;
}

/** @returns {v is number} finite only: NaN and Infinity break every scale. */
export function wantNumber(ctx, v, pointer) {
  if (typeof v === "number" && Number.isFinite(v)) return true;
  if (typeof v === "number") return ctx.at(pointer, `expected a finite number, got ${show(v)}`);
  return ctx.at(pointer, `expected number, got ${show(v)}`);
}

/** @returns {v is string} */
export function wantString(ctx, v, pointer, what = "string") {
  if (typeof v === "string") return true;
  return ctx.at(pointer, `expected ${what}, got ${show(v)}`);
}

/** A string with something in it; empty labels collapse a chart's axis. */
export function wantText(ctx, v, pointer, what = "a non-empty string") {
  if (typeof v === "string" && v.trim() !== "") return true;
  return ctx.at(pointer, `expected ${what}, got ${show(v)}`);
}

/** Optional string: absent is fine, present must be a string. */
export function optionalString(ctx, v, pointer) {
  if (v === undefined) return true;
  return wantString(ctx, v, pointer);
}

/** Optional boolean. */
export function optionalBoolean(ctx, v, pointer) {
  if (v === undefined) return true;
  if (typeof v === "boolean") return true;
  return ctx.at(pointer, `expected true or false, got ${show(v)}`);
}

/** Optional member of an enum, named in full when it misses. */
export function optionalEnum(ctx, v, pointer, allowed) {
  if (v === undefined) return true;
  if (allowed.includes(/** @type {never} */ (v))) return true;
  return ctx.at(pointer, `expected one of ${allowed.join(" ")}, got ${show(v)}`);
}

/** The `format` preset. Anything outside the enum names the whole enum back. */
export function wantFormat(ctx, v, pointer) {
  if (v === undefined) return true;
  if (typeof v === "string" && FORMAT_SET.has(/** @type {never} */ (v))) return true;
  return ctx.at(pointer, `expected one of ${FORMATS.join(" ")}, got ${show(v)}`);
}

/** Tile / bar tone. */
export function wantTone(ctx, v, pointer) {
  if (v === undefined) return true;
  if (typeof v === "string" && TONE_SET.has(/** @type {never} */ (v))) return true;
  return ctx.at(pointer, `expected one of ${TONES.join(" ")}, got ${show(v)}`);
}

/* ------------------------------------------------------------------ composites */

/**
 * An array of finite numbers, each element pointed at individually.
 * @returns {boolean} true when every element checked out
 */
export function numberArray(ctx, v, pointer, what = "an array of numbers") {
  if (!wantArray(ctx, v, pointer, what)) return false;
  let ok = true;
  v.forEach((n, i) => {
    if (!wantNumber(ctx, n, ptr(pointer, i))) ok = false;
  });
  return ok;
}

/**
 * An array of finite numbers that must be exactly `n` long to line up with
 * another axis. `against` names the thing it has to match (`"labels"`).
 */
export function numberArrayOfLength(ctx, v, pointer, n, against) {
  if (!wantArray(ctx, v, pointer, `${n} numbers to match ${against}`)) return false;
  if (v.length !== n) {
    return ctx.at(pointer, `expected ${n} numbers to match ${against}, got ${v.length}`);
  }
  return numberArray(ctx, v, pointer);
}

/**
 * An array of non-empty strings, e.g. a chart's category labels. `noun` is the
 * singular used in all three messages ("label", "row label", "column label").
 */
export function labelArray(ctx, v, pointer, noun = "label") {
  if (!wantArray(ctx, v, pointer, `an array of ${noun}s`)) return false;
  if (v.length === 0) return ctx.at(pointer, `expected at least one ${noun}, got an empty array`);
  let ok = true;
  v.forEach((s, i) => {
    if (!wantText(ctx, s, ptr(pointer, i), `a ${noun}`)) ok = false;
  });
  return ok;
}

/**
 * The eight-slot palette is the cap. Past it the chart stops being readable, so
 * the message tells the agent what to do rather than just what is wrong.
 */
export function seriesCap(ctx, count, pointer, noun = "series") {
  if (count <= MAX_SERIES) return true;
  return ctx.at(
    pointer,
    `expected at most ${MAX_SERIES} ${noun}, got ${count}; fold the tail into "Other" or facet with chart small-multiples`,
  );
}

/** Reject keys the block does not understand, so a typo is not silently dropped. */
export function unknownKeys(ctx, body, pointer, allowed) {
  for (const key of Object.keys(body)) {
    if (allowed.includes(key)) continue;
    ctx.at(ptr(pointer, key), `unknown key "${key}"; keys: ${allowed.join(" ")}`);
  }
}

/** `YYYY-MM-DD`, and a real day: `2026-02-31` parses but is not a date. */
export function wantIsoDate(ctx, v, pointer) {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    return ctx.at(pointer, `expected an ISO date YYYY-MM-DD, got ${show(v)}`);
  }
  const ms = Date.parse(`${v}T00:00:00Z`);
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== v) {
    return ctx.at(pointer, `expected an ISO date YYYY-MM-DD, got ${show(v)}`);
  }
  return true;
}

/** Milliseconds for an already-validated ISO date. */
export function isoMs(v) {
  return Date.parse(`${v}T00:00:00Z`);
}

/**
 * The only sources that draw once a document is published: the serving CSP is
 * `img-src https: data:`, and a relative path has nothing to resolve against.
 */
const PUBLISHABLE_SRC = /^(https:\/\/|data:)/i;

/**
 * The diagnostic for a media src that will not draw, or null when it will.
 * Shared by the fence validators and the prose scan so both read the same.
 *
 * @param {"image" | "video"} kind
 * @param {string} src
 */
export function srcError(kind, src) {
  if (PUBLISHABLE_SRC.test(src)) return null;
  return `${kind} src ${JSON.stringify(src)} must be https: or data: (publish it with file-upload first)`;
}

/** An https: or data: URL for an image, poster or clip. */
export function wantUrl(ctx, v, pointer, kind = /** @type {"image" | "video"} */ ("image")) {
  if (!wantText(ctx, v, pointer, "a URL")) return false;
  const message = srcError(kind, v);
  return message ? ctx.at("", message) : true;
}
