/**
 * Entry point for `postplan render`: Markdown (or an IR) in, one self-contained
 * HTML document out.
 *
 * The pipeline is parse -> validate -> normalise -> resolve `data.src` files ->
 * render blocks -> wrap in the shell -> re-run the server's own HTML policy on
 * the assembled document. Every stage appends to one error list and nothing is
 * written when that list is non-empty, so an author sees all of their mistakes
 * at once rather than one per run.
 *
 * @module render
 */

import { readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateHtml } from "../html-policy.js";
import { renderBody } from "./blocks.js";
import { normalize, validateDoc } from "./deps.js";
import { escapeHtml, parseInfo, parseIr, parseMarkdown, slugify, splitFrontmatter } from "./parse.js";
import { page } from "./shell.js";

export { parseMarkdown, parseIr, parseInfo, splitFrontmatter, slugify, escapeHtml };
export { BLOCK_TYPES, DATA_FENCES, ALERT_TONES, CONTAINER_KINDS, emptyDoc } from "./ir.js";
export { CSS, page } from "./shell.js";
export { byline, contents, renderBlock, renderBody, format } from "./blocks.js";

/** @typedef {import("./ir.js").Block} Block */
/** @typedef {import("./ir.js").Doc} Doc */
/** @typedef {import("./ir.js").RenderError} RenderError */

/** Stamped into every document as `<meta name="generator">`. */
export const GENERATOR = `postplan-render ${version()}`;

function version() {
  try {
    const pkg = fileURLToPath(new URL("../../package.json", import.meta.url));
    return JSON.parse(readFileSync(pkg, "utf8")).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * Render a document.
 *
 * @param {string | Doc} input Markdown source, or an already-built IR.
 * @param {{ file?: string, baseDir?: string }} [opts]
 *   `file` names the source in error messages; `baseDir` is what a block's
 *   `data.src` path is resolved against, defaulting to the source's directory.
 * @returns {{ html: string | null, errors: RenderError[], doc: Doc }}
 *   `html` is null whenever `errors` is non-empty.
 */
export function render(input, opts = {}) {
  const file = opts.file ?? "<input>";
  const baseDir = opts.baseDir ?? (opts.file ? dirname(opts.file) : process.cwd());

  const parsed = typeof input === "string" ? parseMarkdown(input, { file }) : parseIr(input, { file });
  /** @type {RenderError[]} */
  const errors = [...parsed.errors];

  errors.push(...validateDoc(parsed.doc, { file }));
  const doc = normalize(parsed.doc) ?? parsed.doc;
  errors.push(...resolveSources(doc, { file, baseDir }));

  if (errors.length) return { html: null, errors, doc };

  const html = page({ title: doc.meta.title, body: renderBody(doc), generator: GENERATOR });

  const policy = validateHtml(html, {});
  for (const message of policy.errors) {
    errors.push({ file, line: 1, block: "document", message });
  }
  if (errors.length) return { html: null, errors, doc };

  return { html, errors, doc };
}

/** Fences whose `data.src` names a JSON file on disk rather than a media URL. */
const SRC_FENCES = new Set(["chart", "stats", "hero", "flow", "sequence", "timeline"]);

/**
 * Replace `{"src": "data/rows.json"}` in a data fence with the file's contents,
 * so a chart with hundreds of rows does not have to live inline in the document.
 *
 * A JSON object is merged over the keys already in the fence (the fence keeps
 * its title and format, the file brings the data); a JSON array becomes the
 * fence body itself, or its `values` when the fence carries other keys.
 *
 * `video` and `slides` are excluded: their `src` is the media URL a reader
 * fetches, not a data file the renderer reads.
 *
 * @returns {RenderError[]}
 */
function resolveSources(doc, { file, baseDir }) {
  /** @type {RenderError[]} */
  const errors = [];
  for (const block of doc.blocks ?? []) {
    if (!SRC_FENCES.has(block.type)) continue;
    const data = /** @type {Record<string, unknown> | undefined} */ (
      /** @type {{ data?: unknown }} */ (block).data
    );
    if (!data || typeof data !== "object" || Array.isArray(data)) continue;
    if (typeof data.src !== "string") continue;

    const label = block.type === "chart" ? `chart ${block.kind}`.trim() : block.type;
    const path = isAbsolute(data.src) ? data.src : resolve(baseDir, data.src);
    let loaded;
    try {
      loaded = JSON.parse(readFileSync(path, "utf8"));
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      errors.push({ file, line: block.line, block: label, message: `data src "${data.src}": ${reason}` });
      continue;
    }

    const { src: _src, ...rest } = data;
    if (Array.isArray(loaded)) {
      /** @type {{ data: unknown }} */ (block).data =
        Object.keys(rest).length ? { ...rest, values: loaded } : loaded;
    } else if (loaded && typeof loaded === "object") {
      /** @type {{ data: unknown }} */ (block).data = { ...rest, ...loaded };
    } else {
      errors.push({ file, line: block.line, block: label, message: `data src "${data.src}": expected a JSON object or array` });
    }
  }
  return errors;
}
