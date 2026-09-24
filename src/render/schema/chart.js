/**
 * `chart <kind>` fences.
 *
 * One body shape per kind, each checked against what the drawing primitive in
 * `charts.mjs` actually needs: equal-length series, a rows x cols matrix, an
 * ordered whisker, month-resolvable dates. A chart that validates here is a
 * chart the renderer can draw without a guard.
 *
 * A body may instead be `{"src": "data/x.json"}`: the rows live in a side file
 * and WP4 loads them, so only the envelope is checked here.
 *
 * @module render/schema/chart
 */

import {
  Ctx, ptr, show, wantObject, wantArray, wantNonEmptyArray, wantNumber, wantText,
  optionalString, optionalBoolean, wantFormat, wantTone, numberArrayOfLength,
  labelArray, seriesCap, unknownKeys, wantIsoDate, isoMs,
} from "./common.js";

/** Every `chart` sub-kind, in the order the error message lists them. */
export const CHART_KINDS = /** @type {const} */ ([
  "columns", "bars", "lines", "grouped", "stacked", "delta", "whisker", "heatmap",
  "waterfall", "scatter", "funnel", "schedule", "small-multiples", "share",
]);

/** Scatter carries its own axis titles on top of the envelope. */
const SCATTER_KEYS = ["title", "note", "caption", "format", "src", "points", "xTitle", "yTitle"];

/** Keys every chart envelope carries regardless of kind. */
const BASE_KEYS = ["title", "note", "caption", "format", "src"];

const KIND_SET = new Set(CHART_KINDS);

/**
 * @param {Ctx} ctx
 * @param {Record<string, unknown>} body
 */
function envelope(ctx, body) {
  optionalString(ctx, body.title, "/title");
  optionalString(ctx, body.note, "/note");
  optionalString(ctx, body.caption, "/caption");
  wantFormat(ctx, body.format, "/format");
}

/**
 * `labels` + one `values` array of the same length. Shared by the single-series
 * kinds: columns, bars, delta, funnel, share, waterfall.
 *
 * @returns {number} the label count, or -1 when the labels themselves are bad
 */
function labelsAndValues(ctx, body) {
  if (!labelArray(ctx, body.labels, "/labels")) return -1;
  const labels = /** @type {string[]} */ (body.labels);
  numberArrayOfLength(ctx, body.values, "/values", labels.length, "labels");
  return labels.length;
}

/**
 * `labels` + `series: [{ name, values }]`, every series as long as `labels` and
 * at most eight of them.
 */
function labelsAndSeries(ctx, body) {
  if (!labelArray(ctx, body.labels, "/labels")) return;
  const labels = /** @type {string[]} */ (body.labels);
  if (!wantNonEmptyArray(ctx, body.series, "/series", "at least one series")) return;
  const series = /** @type {unknown[]} */ (body.series);
  seriesCap(ctx, series.length, "/series");
  series.forEach((s, i) => {
    const at = ptr("", "series", i);
    if (!wantObject(ctx, s, at, "a series { name, values }")) return;
    wantText(ctx, s.name, ptr(at, "name"), "a series name");
    numberArrayOfLength(ctx, s.values, ptr(at, "values"), labels.length, "labels");
    unknownKeys(ctx, s, at, ["name", "values", "tone"]);
    wantTone(ctx, s.tone, ptr(at, "tone"));
  });
}

/** Per-kind body checks, keyed by sub-kind. Each returns the extra keys it allows. */
const KINDS = {
  columns(ctx, body) {
    labelsAndValues(ctx, body);
    return ["labels", "values"];
  },

  bars(ctx, body) {
    labelsAndValues(ctx, body);
    return ["labels", "values"];
  },

  delta(ctx, body) {
    labelsAndValues(ctx, body);
    optionalBoolean(ctx, body.higherIsBetter, "/higherIsBetter");
    return ["labels", "values", "higherIsBetter"];
  },

  funnel(ctx, body) {
    labelsAndValues(ctx, body);
    return ["labels", "values"];
  },

  share(ctx, body) {
    // One palette slot per part, so the eight-colour cap applies to the labels.
    const n = labelsAndValues(ctx, body);
    if (n > 0) seriesCap(ctx, n, "/labels", "parts");
    return ["labels", "values"];
  },

  lines(ctx, body) {
    labelsAndSeries(ctx, body);
    optionalBoolean(ctx, body.area, "/area");
    optionalBoolean(ctx, body.zeroFloor, "/zeroFloor");
    return ["labels", "series", "area", "zeroFloor"];
  },

  grouped(ctx, body) {
    labelsAndSeries(ctx, body);
    return ["labels", "series"];
  },

  stacked(ctx, body) {
    labelsAndSeries(ctx, body);
    return ["labels", "series"];
  },

  "small-multiples"(ctx, body) {
    labelsAndSeries(ctx, body);
    return ["labels", "series"];
  },

  whisker(ctx, body) {
    if (!labelArray(ctx, body.labels, "/labels")) return ["labels", "mid", "lo", "hi"];
    const labels = /** @type {string[]} */ (body.labels);
    const ok = ["mid", "lo", "hi"].map((key) =>
      numberArrayOfLength(ctx, body[key], `/${key}`, labels.length, "labels"));
    if (ok.every(Boolean)) {
      const { lo, mid, hi } = /** @type {{lo: number[], mid: number[], hi: number[]}} */ (body);
      labels.forEach((_, i) => {
        // The whisker is drawn lo -> hi with the dot at mid; out of order it
        // renders inside out rather than failing, so it has to be caught here.
        if (!(lo[i] <= mid[i])) ctx.at(ptr("", "lo", i), `expected lo <= mid, got ${show(lo[i])} > ${show(mid[i])}`);
        else if (!(mid[i] <= hi[i])) ctx.at(ptr("", "mid", i), `expected mid <= hi, got ${show(mid[i])} > ${show(hi[i])}`);
      });
    }
    return ["labels", "mid", "lo", "hi"];
  },

  heatmap(ctx, body) {
    const rowsOk = labelArray(ctx, body.rows, "/rows", "row label");
    const colsOk = labelArray(ctx, body.cols, "/cols", "column label");
    if (!rowsOk || !colsOk) return ["rows", "cols", "values"];
    const rows = /** @type {string[]} */ (body.rows);
    const cols = /** @type {string[]} */ (body.cols);
    if (!wantArray(ctx, body.values, "/values", `${rows.length} rows to match rows`)) {
      return ["rows", "cols", "values"];
    }
    const values = /** @type {unknown[]} */ (body.values);
    if (values.length !== rows.length) {
      ctx.at("/values", `expected ${rows.length} rows to match rows, got ${values.length}`);
      return ["rows", "cols", "values"];
    }
    values.forEach((row, y) => {
      numberArrayOfLength(ctx, row, ptr("", "values", y), cols.length, "cols");
    });
    return ["rows", "cols", "values"];
  },

  waterfall(ctx, body) {
    const n = labelsAndValues(ctx, body);
    if (body.totals !== undefined) {
      if (wantArray(ctx, body.totals, "/totals", "an array of label indices")) {
        const totals = /** @type {unknown[]} */ (body.totals);
        totals.forEach((t, i) => {
          const at = ptr("", "totals", i);
          if (!Number.isInteger(t)) {
            ctx.at(at, `expected an integer label index, got ${show(t)}`);
          } else if (n >= 0 && (/** @type {number} */ (t) < 0 || /** @type {number} */ (t) >= n)) {
            ctx.at(at, `expected a label index between 0 and ${n - 1}, got ${show(t)}`);
          }
        });
      }
    }
    optionalBoolean(ctx, body.higherIsBetter, "/higherIsBetter");
    return ["labels", "values", "totals", "higherIsBetter"];
  },

  scatter(ctx, body) {
    optionalString(ctx, body.xTitle, "/xTitle");
    optionalString(ctx, body.yTitle, "/yTitle");
    if (!wantNonEmptyArray(ctx, body.points, "/points", "at least one point")) return SCATTER_KEYS;
    /** @type {unknown[]} */ (body.points).forEach((p, i) => {
      const at = ptr("", "points", i);
      if (!wantObject(ctx, p, at, "a point { x, y }")) return;
      wantNumber(ctx, p.x, ptr(at, "x"));
      wantNumber(ctx, p.y, ptr(at, "y"));
      if (p.size !== undefined && wantNumber(ctx, p.size, ptr(at, "size"))) {
        // Bubble area is sqrt(size / max); a negative radius is not drawable.
        if (/** @type {number} */ (p.size) < 0) ctx.at(ptr(at, "size"), `expected a size of 0 or more, got ${show(p.size)}`);
      }
      optionalString(ctx, p.label, ptr(at, "label"));
      unknownKeys(ctx, p, at, ["x", "y", "size", "label"]);
    });
    return SCATTER_KEYS;
  },

  schedule(ctx, body) {
    if (!wantNonEmptyArray(ctx, body.tasks, "/tasks", "at least one task")) return ["tasks"];
    /** @type {unknown[]} */ (body.tasks).forEach((t, i) => {
      const at = ptr("", "tasks", i);
      if (!wantObject(ctx, t, at, "a task { label, start, end }")) return;
      wantText(ctx, t.label, ptr(at, "label"), "a task label");
      const startOk = wantIsoDate(ctx, t.start, ptr(at, "start"));
      const endOk = wantIsoDate(ctx, t.end, ptr(at, "end"));
      if (startOk && endOk && isoMs(/** @type {string} */ (t.start)) > isoMs(/** @type {string} */ (t.end))) {
        ctx.at(ptr(at, "end"), `expected end on or after start, got ${show(t.end)} before ${show(t.start)}`);
      }
      optionalBoolean(ctx, t.done, ptr(at, "done"));
      wantTone(ctx, t.tone, ptr(at, "tone"));
      unknownKeys(ctx, t, at, ["label", "start", "end", "done", "tone"]);
    });
    return ["tasks"];
  },
};

/**
 * Validate one `chart` block.
 *
 * @param {import("../ir.js").RenderError[]} errors shared sink
 * @param {{ kind: string, data: unknown, line: number }} block
 * @param {string} file
 */
export function validateChart(errors, block, file) {
  const kind = String(block.kind ?? "");
  const label = `chart ${kind}`.trim();

  if (!KIND_SET.has(/** @type {never} */ (kind))) {
    // No block label on the prefix: the block is not a kind we can name.
    errors.push({
      file, line: block.line, block: "",
      message: `unknown block "${label}"; kinds: ${CHART_KINDS.join(" ")}`,
    });
    return;
  }

  const ctx = new Ctx(errors, file, block.line, label);
  if (!wantObject(ctx, block.data, "", "an object")) return;
  const body = /** @type {Record<string, unknown>} */ (block.data);

  envelope(ctx, body);

  // `{"src": "data/x.json"}` defers the rows to a side file; WP4 loads and
  // re-validates them, so only the envelope is checked now.
  if (body.src !== undefined) {
    wantText(ctx, body.src, "/src", "a path to a JSON file");
    unknownKeys(ctx, body, "", BASE_KEYS);
    return;
  }

  const extra = KINDS[kind](ctx, body);
  unknownKeys(ctx, body, "", [...BASE_KEYS, ...extra]);
}
