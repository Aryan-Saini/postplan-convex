/**
 * Temporary stand-ins for WP2 (`./schema/`) and WP4 (`./charts.js`, `./code.js`,
 * `./diagram.js`, `./math.js`) so WP3 can render and test the whole document
 * while those packages are still in flight.
 *
 * DELETE THIS FILE once both have merged, and collapse `deps.js` into plain
 * `import` statements; nothing else imports it.
 *
 * @module render/_stubs
 */

import { escapeHtml } from "./parse.js";

/* ---------------------------------------------------------------- WP2 */

/** @returns {import("./ir.js").RenderError[]} */
export function validateDoc() {
  return [];
}

/** @template T @param {T} doc @returns {T} */
export function normalize(doc) {
  return doc;
}

/* ---------------------------------------------------------------- WP4 */

/** A labelled frame where the real figure will go, so layout can still be judged. */
function placeholder(label, { title, note } = {}) {
  const head = title ? `<div class="fig-title">${escapeHtml(title)}</div>` : "";
  const foot = note ? `<div class="fig-note">${escapeHtml(note)}</div>` : "";
  return `<figure class="fig">${head}<div class="mock"><div class="mock-head">${escapeHtml(label)}</div>` +
    `<div class="mock-body small">Rendered by WP4.</div></div>${foot}</figure>`;
}

export function renderChart(block) {
  const data = /** @type {{ title?: string, note?: string }} */ (block?.data ?? {});
  return placeholder(`chart ${block?.kind ?? ""}`.trim(), data);
}

export function renderCode(block) {
  const head = block?.file || block?.title
    ? `<div class="code-head"><span class="code-file">${escapeHtml(block.file ?? block.title)}</span>` +
      `<span class="code-lang">${escapeHtml(block.lang ?? "")}</span></div>`
    : "";
  return `<div class="code">${head}<pre><code>${escapeHtml(block?.source ?? "")}</code></pre></div>`;
}

export function renderDiff(block) {
  return renderCode({ ...block, lang: "diff", file: block?.title });
}

export function renderFlow(block) {
  return placeholder("flow", /** @type {object} */ (block?.data ?? {}));
}

export function renderSequence(block) {
  return placeholder("sequence", /** @type {object} */ (block?.data ?? {}));
}

export function renderMathBlock(tex) {
  return `<div class="math-block"><code>${escapeHtml(tex)}</code></div>`;
}

/** Real version replaces `.math-inline` spans with MathML; this shows the TeX. */
export function renderInlineMath(html) {
  return String(html).replace(
    /<span class="math-inline" data-tex="([^"]*)"><\/span>/g,
    (_, tex) => `<code class="math-inline">${tex}</code>`,
  );
}

export function sparkline() {
  return "";
}

export function meter() {
  return "";
}
