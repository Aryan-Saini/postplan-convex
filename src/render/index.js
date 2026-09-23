/**
 * Entry point for `postplan render`: Markdown (or an IR) in, one self-contained
 * HTML document out.
 *
 * The pipeline is parse -> resolve `data.src` files -> validate -> normalise ->
 * render blocks -> wrap in the shell -> re-run the server's own HTML policy on
 * the assembled document. Side files are substituted before validation so their
 * rows are held to the same rules as rows written inline. Every stage appends to one error list and nothing is
 * written when that list is non-empty, so an author sees all of their mistakes
 * at once rather than one per run.
 *
 * @module render
 */

import { readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { validateHtml } from "../html-policy.js";
import { renderBody } from "./blocks.js";
import { normalize, validateDoc } from "./schema/index.js";
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
 * @returns {{ html: string | null, errors: RenderError[], doc: Doc, ir: Doc }}
 *   `html` is null whenever `errors` is non-empty. `ir` is the document exactly
 *   as authored, which is what `--emit-ir` writes and what this function
 *   accepts back; `doc` is the normalised copy the renderers were handed, and
 *   its filled-in defaults are not valid input.
 */
export function render(input, opts = {}) {
  const file = opts.file ?? "<input>";
  const baseDir = opts.baseDir ?? (opts.file ? dirname(opts.file) : process.cwd());

  const parsed = typeof input === "string" ? parseMarkdown(input, { file }) : parseIr(input, { file });
  /** @type {RenderError[]} */
  const errors = [...parsed.errors];

  // Side files are substituted first so the rows they bring are validated like
  // rows written inline; the authored document is left untouched for `ir`.
  const resolved = resolveSources(parsed.doc, { file, baseDir });
  errors.push(...resolved.errors);
  errors.push(...validateDoc(resolved.doc, { file }));
  const doc = normalize(resolved.doc);

  const ir = parsed.doc;
  if (errors.length) return { html: null, errors, doc, ir };

  const html = page({ title: doc.meta.title, body: renderBody(doc), generator: GENERATOR });

  const policy = validateHtml(html, {});
  for (const message of policy.errors) {
    errors.push({ file, line: 1, block: "document", message });
  }
  if (errors.length) return { html: null, errors, doc, ir };

  return { html, errors, doc, ir };
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
 * `src` is resolved inside `baseDir` and never outside it: a document can only
 * read its own directory, so rendering one never turns into a file-read
 * primitive. A fence whose file could not be read is marked `broken`, which is
 * how the parser marks unparseable JSON, so validation does not pile a shape
 * complaint on top of the error already reported.
 *
 * The document is not mutated: blocks that gained data come back as copies.
 *
 * @param {Doc} doc
 * @param {{ file: string, baseDir: string }} opts
 * @returns {{ doc: Doc, errors: RenderError[] }}
 */
function resolveSources(doc, { file, baseDir }) {
  /** @type {RenderError[]} */
  const errors = [];
  if (!Array.isArray(doc.blocks)) return { doc, errors };
  const root = resolve(baseDir) + sep;

  const blocks = doc.blocks.map((block) => {
    if (!block || !SRC_FENCES.has(block.type)) return block;
    const data = /** @type {Record<string, unknown> | undefined} */ (
      /** @type {{ data?: unknown }} */ (block).data
    );
    if (!data || typeof data !== "object" || Array.isArray(data)) return block;
    if (typeof data.src !== "string") return block;

    const label = block.type === "chart" ? `chart ${block.kind}`.trim() : block.type;
    /** @param {string} message */
    const fail = (message) => {
      errors.push({ file, line: block.line, block: label, message });
      return { ...block, broken: /** @type {true} */ (true) };
    };

    const src = data.src;
    const path = resolve(baseDir, src);
    if (isAbsolute(src) || !path.startsWith(root)) {
      return fail(`src ${JSON.stringify(src)} escapes the document directory`);
    }

    let text;
    try {
      text = readFileSync(path, "utf8");
    } catch (err) {
      return fail(`src ${JSON.stringify(src)}: ${err instanceof Error ? err.message : String(err)}`);
    }

    let loaded;
    try {
      loaded = JSON.parse(text);
    } catch (err) {
      return fail(`src ${JSON.stringify(src)}: invalid JSON: ${jsonReason(err)}`);
    }

    const { src: _src, ...rest } = data;
    if (Array.isArray(loaded)) {
      return { ...block, data: Object.keys(rest).length ? { ...rest, values: loaded } : loaded };
    }
    if (loaded && typeof loaded === "object") return { ...block, data: { ...rest, ...loaded } };
    return fail(`src ${JSON.stringify(src)}: expected a JSON object or array`);
  });

  return { doc: { ...doc, blocks }, errors };
}

/**
 * The reason from a `JSON.parse` failure, with the window of source text the
 * message quotes cut out: a diagnostic names the file, never its contents.
 *
 *     Unexpected token 'a', "{"values": nan}" is not valid JSON  ->  Unexpected token 'a'
 *
 * @param {unknown} err
 * @returns {string}
 */
function jsonReason(err) {
  const message = err instanceof Error ? err.message : String(err);
  return message.replace(/,?\s*(?:\.\.\.)?"[\s\S]*"(?:\.\.\.)?\s*is not valid JSON/, "").trim() ||
    "not valid JSON";
}
