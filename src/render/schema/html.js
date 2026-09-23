/**
 * `html` fences: the one escape hatch, emitted verbatim.
 *
 * The fragment is wrapped in a minimal document and run through the same
 * `validateHtml` the upload endpoint runs, so a fence that would be rejected at
 * publish time is rejected here instead, with the fence's line on it.
 *
 * @module render/schema/html
 */

import { validateHtml } from "../../html-policy.js";

/**
 * Compact names for the constructs the policy rejects. The policy's own
 * sentences describe the rule; an author needs the culprit, so the recognised
 * ones are rewritten and anything new falls through verbatim.
 */
const CULPRITS = [
  [/^External script sources are not allowed\.$/, () => "<script src=…>"],
  [/^Unsupported script type "(.*)" found\.$/, (m) => `<script type="${m[1]}">`],
  [/^Blocked <(.+)> tag found\.$/, (m) => `<${m[1]}>`],
  [/^Blocked inline event handler attribute "(.+)" found\.$/, (m) => `${m[1]}=…`],
  [/^Blocked "srcdoc" attribute found\.$/, () => "srcdoc=…"],
  [/^Blocked unsafe URL in "(.+)" attribute\.$/, (m) => `${m[1]}="javascript:…"`],
  [/^Blocked unsafe inline CSS\.$/, () => "style=\"expression(…)\""],
  [/^Blocked meta refresh tag found\.$/, () => '<meta http-equiv="refresh">'],
];

/** @param {string} policyError */
function message(policyError) {
  for (const [re, name] of CULPRITS) {
    const m = re.exec(policyError);
    if (m) return `${name(m)} rejected by upload policy`;
  }
  return policyError;
}

/** Wrap a fragment so parse5 sees a document and the title warning stays quiet. */
function asDocument(fragment) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>fragment</title></head>` +
    `<body>${fragment}</body></html>`;
}

/**
 * @param {import("../ir.js").RenderError[]} errors
 * @param {{ html: string, line: number }} block
 * @param {string} file
 */
export function validateHtmlBlock(errors, block, file) {
  const fragment = typeof block.html === "string" ? block.html : "";
  if (fragment.trim() === "") {
    errors.push({ file, line: block.line, block: "html", message: "html fence is empty" });
    return;
  }
  const result = validateHtml(asDocument(fragment), {});
  for (const err of result.errors) {
    errors.push({ file, line: block.line, block: "html", message: message(err) });
  }
}
