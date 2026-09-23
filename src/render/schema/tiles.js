/**
 * `stats` and `hero` fences: an array of stat tiles.
 *
 * Same body for both; `hero` renders them large and centred, `stats` as a dense
 * grid. A tile is a label, one number, and the optional furniture around it: an
 * as-of line, a signed change, a tone, a sparkline, a meter.
 *
 * @module render/schema/tiles
 */

import {
  Ctx, ptr, wantObject, wantNonEmptyArray, wantNumber, wantText, optionalString,
  wantFormat, wantTone, numberArray, unknownKeys,
} from "./common.js";

const TILE_KEYS = ["k", "v", "format", "as", "delta", "tone", "spark", "meter"];

/** Fewer than two points is a dot, not a line, and `sparkline()` divides by n-1. */
const MIN_SPARK = 2;

/**
 * @param {import("../ir.js").RenderError[]} errors
 * @param {{ type: string, data: unknown, line: number }} block
 * @param {string} file
 */
export function validateTiles(errors, block, file) {
  const ctx = new Ctx(errors, file, block.line, block.type);
  if (!wantNonEmptyArray(ctx, block.data, "", "at least one tile")) return;

  /** @type {unknown[]} */ (block.data).forEach((tile, i) => {
    const at = ptr("", i);
    if (!wantObject(ctx, tile, at, "a tile { k, v }")) return;

    wantText(ctx, tile.k, ptr(at, "k"), "a tile label");
    wantNumber(ctx, tile.v, ptr(at, "v"));
    wantFormat(ctx, tile.format, ptr(at, "format"));
    optionalString(ctx, tile.as, ptr(at, "as"));
    optionalString(ctx, tile.delta, ptr(at, "delta"));
    wantTone(ctx, tile.tone, ptr(at, "tone"));

    if (tile.spark !== undefined) {
      const sp = ptr(at, "spark");
      if (numberArray(ctx, tile.spark, sp, "an array of sparkline values")
        && /** @type {unknown[]} */ (tile.spark).length < MIN_SPARK) {
        ctx.at(sp, `expected at least ${MIN_SPARK} sparkline values, got ${/** @type {unknown[]} */ (tile.spark).length}`);
      }
    }

    if (tile.meter !== undefined) {
      const mp = ptr(at, "meter");
      if (wantObject(ctx, tile.meter, mp, "a meter { max }")) {
        const meter = /** @type {Record<string, unknown>} */ (tile.meter);
        if (wantNumber(ctx, meter.max, ptr(mp, "max")) && /** @type {number} */ (meter.max) <= 0) {
          ctx.at(ptr(mp, "max"), `expected a max above zero, got ${JSON.stringify(meter.max)}`);
        }
        optionalString(ctx, meter.tone, ptr(mp, "tone"));
        unknownKeys(ctx, meter, mp, ["max", "tone"]);
      }
    }

    unknownKeys(ctx, tile, at, TILE_KEYS);
  });
}
