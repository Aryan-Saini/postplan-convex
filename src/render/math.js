/**
 * TeX to MathML, at render time.
 *
 * MathML renders natively in every current browser, so a formula needs no KaTeX
 * bundle, no webfont and no image — which is what lets a Postplan document stay
 * one self-contained file. Temml does the conversion; this module is the thin
 * wrapper that guarantees a bad formula degrades to visible red text instead of
 * taking the whole render down.
 *
 * @module render/math
 */

import temml from "temml";

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

/** Reverse of the parser's `escapeHtml`, for reading a `data-tex` attribute back. */
export function unescapeHtml(s) {
  return String(s).replace(/&(?:amp|lt|gt|quot|apos|#39|#x27|#34);/gi, (m) => ({
    "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'",
    "&#39;": "'", "&#x27;": "'", "&#34;": '"',
  }[m.toLowerCase()] ?? m));
}

/**
 * Convert one TeX string to MathML.
 *
 * Never throws: a TeX error comes back as `<span class="math-error">` carrying
 * Temml's message, so the reader sees which formula is broken and the rest of
 * the document still renders.
 *
 * @param {string} tex
 * @param {{ display?: boolean }} [opts] `display` picks block style over inline.
 * @returns {string} MathML, or the error span.
 */
export function renderMath(tex, { display = false } = {}) {
  const src = String(tex ?? "").trim();
  if (!src) return "";
  try {
    return temml.renderToString(src, {
      displayMode: display,
      throwOnError: true,
      // No <annotation> copy of the TeX source: it doubles the markup and the
      // document has a byte cap.
      annotate: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return `<span class="math-error">${esc(message)}</span>`;
  }
}

/**
 * Render a display (`$$…$$` or `math` fence) formula, wrapped in the shell's
 * centred `.math-block`.
 *
 * @param {string} tex
 * @returns {string}
 */
export function renderMathBlock(tex) {
  return `<div class="math-block">${renderMath(tex, { display: true })}</div>`;
}

/**
 * Render a single inline formula, without the block wrapper.
 * @param {string} tex
 */
export function renderInlineTex(tex) {
  return renderMath(tex, { display: false });
}

// The parser leaves inline math as an empty placeholder carrying the escaped
// source, so prose can be assembled before Temml is involved.
const INLINE_PLACEHOLDER = /<span class="math-inline" data-tex="([^"]*)"><\/span>/g;

/**
 * Replace every inline-math placeholder in a fragment of prose HTML with its
 * MathML. Anything that is not a placeholder is passed through untouched.
 *
 * @param {string} html prose HTML from the parser
 * @returns {string}
 */
export function renderInlineMath(html) {
  return String(html ?? "").replace(INLINE_PLACEHOLDER, (_m, attr) =>
    renderMath(unescapeHtml(attr), { display: false }));
}

export { esc };
