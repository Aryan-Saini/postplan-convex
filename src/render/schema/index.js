/**
 * Document validation: every block body checked, every error collected.
 *
 * `validateDoc` never throws and never mutates the doc. It returns the full list
 * of diagnostics so the CLI can print all of them and exit once, which is the
 * behaviour the plan asks for: an agent fixing a document should see every
 * problem in one pass, not one per run.
 *
 * `normalize` fills the defaults the renderers would otherwise have to branch
 * on. It is only meaningful once validation passes, so it assumes the shapes the
 * validators guarantee.
 *
 * @module render/schema
 */

import { CONTAINER_KINDS } from "../ir.js";
import { FORMATS, TONES, MAX_SERIES } from "./common.js";
import { CHART_KINDS, validateChart } from "./chart.js";
import { validateTiles } from "./tiles.js";
import { validateFlow, validateSequence, NODE_SHAPES } from "./diagram.js";
import {
  validateTimeline, validateSlides, validateVideo, validateFile, validateInlineMedia, TIMELINE_STATES,
} from "./media.js";
import { validateHtmlBlock } from "./html.js";
import { FAVICONS } from "../shell.js";

/** @typedef {import("../ir.js").Block} Block */
/** @typedef {import("../ir.js").Doc} Doc */
/** @typedef {import("../ir.js").RenderError} RenderError */

export { CHART_KINDS, FORMATS, TONES, MAX_SERIES, NODE_SHAPES, TIMELINE_STATES };

/** Validators for the blocks that carry a body worth checking. */
const VALIDATORS = {
  chart: validateChart,
  stats: validateTiles,
  hero: validateTiles,
  flow: validateFlow,
  sequence: validateSequence,
  timeline: validateTimeline,
  slides: validateSlides,
  video: validateVideo,
  file: validateFile,
  html: validateHtmlBlock,
};

const CONTAINER_SET = new Set(CONTAINER_KINDS);

/**
 * Validate a parsed document.
 *
 * @param {Doc} doc
 * @param {{ file?: string }} [opts]
 * @returns {RenderError[]} in document order; empty when the doc is renderable
 */
export function validateDoc(doc, opts = {}) {
  const file = opts.file ?? "<input>";
  /** @type {RenderError[]} */
  const errors = [];
  if (!doc || !Array.isArray(doc.blocks)) return errors;
  if (doc.meta) validateMeta(errors, doc.meta, file);

  /** @type {Map<string, number>} first line each id was claimed on */
  const ids = new Map();

  for (const block of doc.blocks) {
    if (!block || typeof block !== "object") continue;

    // A data fence whose JSON failed to parse is marked `broken` by parse.js,
    // which has already reported the syntax error at the offending byte;
    // re-reporting the shape here would double every typo. A body that is a
    // literal `null` is not broken, and is still the author's mistake to hear.
    const skipBody = block.broken === true;

    if (typeof block.id === "string" && block.id) {
      if (ids.has(block.id)) {
        errors.push({
          file, line: block.line, block: block.type,
          message: `duplicate block id ${JSON.stringify(block.id)}; first used on line ${ids.get(block.id)}`,
        });
      } else {
        ids.set(block.id, block.line);
      }
    }

    if (block.type === "container" && !CONTAINER_SET.has(block.kind)) {
      errors.push({
        file, line: block.line, block: "",
        message: `unknown block "::: ${block.kind}"; kinds: ${CONTAINER_KINDS.join(" ")}`,
      });
      continue;
    }

    const validate = VALIDATORS[block.type];
    if (validate && !skipBody) validate(errors, block, file);
    // Prose, callouts, containers and html fences carry their images as HTML.
    if (typeof block.html === "string") validateInlineMedia(errors, block, file);
  }

  return errors;
}

const ICONS = Object.keys(FAVICONS);
const MAX_TAB = 80;

/**
 * Frontmatter values with a shape: `icon` is an enum, `tab` a short string.
 * Reported on line 1, where the frontmatter starts; the key names the field.
 * @param {RenderError[]} errors
 * @param {Doc["meta"]} meta
 * @param {string} file
 */
function validateMeta(errors, meta, file) {
  const at = (message) => errors.push({ file, line: 1, block: "frontmatter", message });
  if (meta.icon !== undefined && !ICONS.includes(meta.icon)) {
    at(`icon: expected one of ${ICONS.join(" ")}, got ${JSON.stringify(meta.icon)}`);
  }
  if (meta.tab !== undefined && (meta.tab === "" || meta.tab.length > MAX_TAB)) {
    at(`tab: expected 1 to ${MAX_TAB} characters, got ${meta.tab.length}`);
  }
}

/**
 * Render one diagnostic as the CLI prints it.
 *
 *     plan.md:41 chart lines: /series/0/values expected 8 numbers to match labels, got 7
 *     plan.md:80 unknown block "chart pie"; kinds: columns bars lines …
 *
 * The block label is dropped when the block has no name we can trust — an
 * unknown fence kind is exactly the case where naming it would be a lie.
 *
 * @param {RenderError} error
 * @returns {string}
 */
export function formatError(error) {
  const where = `${error.file}:${error.line}`;
  return error.block ? `${where} ${error.block}: ${error.message}` : `${where} ${error.message}`;
}

/* ------------------------------------------------------------------ normalize */

const CHART_DEFAULTS = { title: "", note: "", caption: "", format: "compact" };

/** Extra defaults a chart kind adds on top of the envelope. */
const CHART_EXTRAS = {
  lines: { area: false, zeroFloor: true },
  delta: { higherIsBetter: true },
  waterfall: { totals: [] },
  scatter: { xTitle: "", yTitle: "" },
};

const TILE_DEFAULTS = { format: "compact", as: "", delta: "", tone: "", spark: [], meter: null };

/** Fill `defaults` into a fresh copy of `body`; keys already present win. */
const withDefaults = (body, defaults) => ({ ...defaults, ...body });

/**
 * Fill every optional field a renderer would otherwise have to test for.
 *
 * Returns a new document; the input is left exactly as parsed, so the IR that
 * `--emit-ir` writes is still the authored shape. Run it only after
 * `validateDoc` returns no errors: it assumes the shapes the validators pin.
 *
 * @param {Doc} doc
 * @returns {Doc}
 */
export function normalize(doc) {
  return {
    version: 1,
    meta: { byline: "", date: "", status: "", ...doc.meta, title: doc.meta?.title ?? "" },
    blocks: doc.blocks.map(normalizeBlock),
  };
}

/** @param {Block} block */
function normalizeBlock(block) {
  switch (block.type) {
    case "chart": {
      if (!block.data || typeof block.data !== "object") return block;
      const body = withDefaults(block.data, { ...CHART_DEFAULTS, ...CHART_EXTRAS[block.kind] });
      if (block.kind === "schedule" && Array.isArray(body.tasks)) {
        body.tasks = body.tasks.map((t) => withDefaults(t, { done: false, tone: "" }));
      }
      if (Array.isArray(body.series)) {
        body.series = body.series.map((s) => withDefaults(s, { tone: "" }));
      }
      if (block.kind === "scatter" && Array.isArray(body.points)) {
        body.points = body.points.map((p) => withDefaults(p, { label: "", size: 0 }));
      }
      return { ...block, data: body };
    }

    case "stats":
    case "hero":
      if (!Array.isArray(block.data)) return block;
      return { ...block, data: block.data.map((tile) => withDefaults(tile, TILE_DEFAULTS)) };

    case "timeline":
      if (!Array.isArray(block.data)) return block;
      return { ...block, data: block.data.map((item) => withDefaults(item, { note: "", state: "" })) };

    case "slides":
      if (!Array.isArray(block.data)) return block;
      return { ...block, data: block.data.map((s) => withDefaults(s, { caption: "", alt: "" })) };

    case "video":
      if (!block.data || typeof block.data !== "object") return block;
      return { ...block, data: withDefaults(block.data, { poster: "", caption: "" }) };

    // One file or a list renders the same way, so the renderer only ever sees a list.
    case "file": {
      const items = Array.isArray(block.data) ? block.data : block.data ? [block.data] : [];
      return { ...block, data: items.map((f) => withDefaults(f, { kind: "", expires: "", note: "" })) };
    }

    case "flow": {
      if (!block.data || typeof block.data !== "object") return block;
      const body = withDefaults(block.data, { title: "", note: "" });
      if (Array.isArray(body.cols)) {
        body.cols = body.cols.map((col) =>
          Array.isArray(col) ? col.map((n) => withDefaults(n, { shape: "box", tone: "" })) : col);
      }
      if (Array.isArray(body.edges)) body.edges = body.edges.map((e) => withDefaults(e, { label: "" }));
      return { ...block, data: body };
    }

    case "sequence": {
      if (!block.data || typeof block.data !== "object") return block;
      const body = withDefaults(block.data, { title: "", note: "" });
      if (Array.isArray(body.msgs)) {
        body.msgs = body.msgs.map((m) => withDefaults(m, { dashed: false, note: "" }));
      }
      return { ...block, data: body };
    }

    case "code":
      return { file: "", title: "", range: "", lines: false, ...block };

    case "diff":
      return { file: "", title: "", ...block };

    default:
      return block;
  }
}
