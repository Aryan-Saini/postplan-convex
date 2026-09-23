/**
 * Entry point for `postplan render`.
 *
 * WP3 and WP4 replace the body of `render`; for now it proves the pipeline by
 * emitting the IR, so the CLI, the parser and the error path are wired end to end.
 *
 * @module render
 */

import { parseIr, parseMarkdown, parseInfo, splitFrontmatter, slugify, escapeHtml } from "./parse.js";

export { parseMarkdown, parseIr, parseInfo, splitFrontmatter, slugify, escapeHtml };
export { BLOCK_TYPES, DATA_FENCES, ALERT_TONES, CONTAINER_KINDS, emptyDoc } from "./ir.js";

/** @typedef {import("./ir.js").Block} Block */
/** @typedef {import("./ir.js").Doc} Doc */
/** @typedef {import("./ir.js").RenderError} RenderError */

/**
 * Render a document.
 *
 * @param {string | Doc} input Markdown source, or an already-built IR.
 * @param {{ file?: string }} [opts]
 * @returns {{ html: string, errors: RenderError[], doc: Doc }}
 */
export function render(input, opts = {}) {
  const { doc, errors } = typeof input === "string"
    ? parseMarkdown(input, opts)
    : parseIr(input, opts);

  const html = `<pre class="ir">${escapeHtml(JSON.stringify(doc, null, 2))}</pre>`;
  return { html, errors, doc };
}
