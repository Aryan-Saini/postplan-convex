/**
 * The seam between WP3 and the packages it renders through.
 *
 * `schema/` (WP2) and `charts.js` / `code.js` / `diagram.js` / `math.js` (WP4)
 * land on their own branches. Until they do, every name here resolves to the
 * placeholder in `_stubs.js`, so the shell, the blocks and their tests run
 * against the real document end to end.
 *
 * TO REMOVE after WP2 and WP4 merge: delete this file and `_stubs.js`, and let
 * `blocks.js` and `index.js` import the four modules by name directly. The
 * export names below are exactly the ones they are expected to provide.
 *
 * @module render/deps
 */

import * as stubs from "./_stubs.js";

/** Import a sibling module, or null when that work package has not landed. */
async function optional(specifier) {
  try {
    return await import(specifier);
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err)?.code === "ERR_MODULE_NOT_FOUND") return null;
    throw err;
  }
}

const [schema, charts, code, diagram, math] = await Promise.all([
  optional("./schema/index.js"),
  optional("./charts.js"),
  optional("./code.js"),
  optional("./diagram.js"),
  optional("./math.js"),
]);

/** True while any dependency is still a placeholder; the CLI can warn on it. */
export const STUBBED = [schema, charts, code, diagram, math].some((m) => m === null);

// WP2 · src/render/schema/index.js
export const validateDoc = schema?.validateDoc ?? stubs.validateDoc;
export const normalize = schema?.normalize ?? stubs.normalize;

// WP4 · charts.js
export const renderChart = charts?.renderChart ?? stubs.renderChart;
export const sparkline = charts?.sparkline ?? stubs.sparkline;
export const meter = charts?.meter ?? stubs.meter;

// WP4 · code.js
export const renderCode = code?.renderCode ?? stubs.renderCode;
export const renderDiff = code?.renderDiff ?? stubs.renderDiff;

// WP4 · diagram.js
export const renderFlow = diagram?.renderFlow ?? stubs.renderFlow;
export const renderSequence = diagram?.renderSequence ?? stubs.renderSequence;

// WP4 · math.js
export const renderMathBlock = math?.renderMathBlock ?? stubs.renderMathBlock;
export const renderInlineMath = math?.renderInlineMath ?? stubs.renderInlineMath;
