/**
 * Inline-SVG chart primitives.
 *
 * Every function returns a self-contained `<svg>` string: no script, no external
 * fetch, no CSS beyond the custom properties the shell already defines. Charts
 * are sized by viewBox and scale to their container, so they stay readable on a
 * phone. Hover text rides `<title>` elements, which browsers surface as native
 * tooltips without JavaScript.
 *
 * Geometry is computed here rather than eyeballed so bars, ticks and labels
 * always line up. Mark specs follow the dataviz skill: bars <= 24px with a 4px
 * rounded cap, 2px lines, >= 8px markers, 2px surface gaps, hairline gridlines.
 *
 * The class names below (`fig`, `fig-title`, `chart`, `tick`, `legend`, …) are
 * the contract with the shell's stylesheet; do not rename them here alone.
 *
 * @module render/charts
 */

/** @typedef {import("./ir.js").ChartBlock} ChartBlock */

/** The eight validated categorical slots, in order. */
export const SERIES = [
  "#3987e5", // 1 blue
  "#d95926", // 2 orange
  "#199e70", // 3 aqua
  "#c98500", // 4 yellow
  "#d55181", // 5 magenta
  "#008300", // 6 green
  "#9085e9", // 7 violet
  "#e66767", // 8 red
];

/** Semantic ink, shared with the shell's `--good` / `--critical`. */
const GOOD = "#0ca30c";
const BAD = "#d03b3b";

/**
 * The grammar's tone words (`good` `warn` `bad` `flat`) as ink. A document names
 * a tone, never a hex, so every renderer that paints one resolves it here.
 */
export const TONE_INK = { good: GOOD, warn: "#c98500", bad: BAD, flat: "#6f6f6a" };

/** Resolve a tone word to ink, falling back to `otherwise` when none is set. */
export const toneInk = (tone, otherwise) => TONE_INK[tone] ?? (tone || otherwise);

/** Mix a hex colour toward the surface. `t` = 0 is the surface, 1 is the colour. */
export function mix(hex, t, surface = "#0b0b0b") {
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = rgb(surface), [r2, g2, b2] = rgb(hex);
  const c = (a, b) => Math.round(a + (b - a) * Math.max(0, Math.min(1, t)));
  return "#" + [c(r1, r2), c(g1, g2), c(b1, b2)].map((v) => v.toString(16).padStart(2, "0")).join("");
}

/**
 * Series colour by index, capped at the eight validated slots.
 * @throws {RangeError} past the eighth series.
 */
export function seriesColor(i) {
  if (i >= SERIES.length) throw new RangeError(`series ${i + 1} exceeds the 8-slot palette; fold the tail into "Other" or facet`);
  return SERIES[i];
}

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** Round to 2dp so the emitted SVG stays small and diff-able. */
const n = (v) => Math.round(v * 100) / 100;

/**
 * Nice axis ticks: at most `count` round values covering [0, max].
 * Returns { top, ticks } where `top` is the scale ceiling.
 */
export function ticks(max, count = 4) {
  if (!(max > 0)) return { top: 1, ticks: [0, 1] };
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const top = Math.ceil(max / step) * step;
  const out = [];
  for (let v = 0; v <= top + 1e-9; v += step) out.push(n(v));
  return { top, ticks: out };
}

/** Compact number formatting: 1284 -> 1.3k, 4200000 -> 4.2M. */
export function compact(v, { prefix = "", suffix = "", dp = 1 } = {}) {
  const abs = Math.abs(v);
  const unit = abs >= 1e9 ? ["B", 1e9] : abs >= 1e6 ? ["M", 1e6] : abs >= 1e3 ? ["k", 1e3] : ["", 1];
  const scaled = v / unit[1];
  const text = unit[1] === 1 ? String(n(scaled)) : scaled.toFixed(scaled % 1 === 0 ? 0 : dp);
  return `${prefix}${text}${unit[0]}${suffix}`;
}

const group = (v, dp = 0) =>
  Number(v).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

/**
 * The `format` enum from the spec. A preset replaces the prototype's per-chart
 * formatter function: a document declares `"format":"ms"`, not a callback.
 *
 * - `int`     1284        -> `1,284`
 * - `compact` 4200000     -> `4.2M`
 * - `usd`     412000      -> `$412k`
 * - `pct`     0.031       -> `3.1%` (a fraction of one, not percentage points)
 * - `ms`      412         -> `412 ms`
 */
export const FORMATS = {
  // A fraction keeps two decimals so a 0.4 tick does not collapse to 0.
  int: (v) => (v !== 0 && Math.abs(v) < 1 ? group(v, 2) : group(Math.round(v))),
  compact: (v) => compact(v),
  usd: (v) => (v < 0 ? "-" : "") + compact(Math.abs(v), { prefix: "$" }),
  pct: (v) => `${Number((v * 100).toFixed(1))}%`,
  ms: (v) => `${group(Math.round(v))} ms`,
};

/** Resolve a `format` enum value to a formatter; anything unknown falls back to `compact`. */
export function formatter(format) {
  return FORMATS[format] ?? FORMATS.compact;
}

// A small gutter on every side: end labels and dot rings sit right on the frame,
// and the scrolling wrapper clips anything painted outside the viewBox.
const svgOpen = (w, h, label) =>
  `<svg viewBox="-6 -4 ${w + 14} ${h + 8}" width="100%" role="img" aria-label="${esc(label)}" ` +
  `preserveAspectRatio="xMidYMid meet" class="chart">`;

/** A bar with a rounded cap at the data end and square corners at the baseline. */
function cappedBar(x, y, w, h, r = 4) {
  const rr = Math.min(r, w / 2, h);
  if (h <= 0.5) return "";
  return `M${n(x)},${n(y + h)} L${n(x)},${n(y + rr)} Q${n(x)},${n(y)} ${n(x + rr)},${n(y)} ` +
    `L${n(x + w - rr)},${n(y)} Q${n(x + w)},${n(y)} ${n(x + w)},${n(y + rr)} L${n(x + w)},${n(y + h)} Z`;
}

function hBar(x, y, w, h, r = 4) {
  const rr = Math.min(r, h / 2, w);
  if (w <= 0.5) return "";
  return `M${n(x)},${n(y)} L${n(x + w - rr)},${n(y)} Q${n(x + w)},${n(y)} ${n(x + w)},${n(y + rr)} ` +
    `L${n(x + w)},${n(y + h - rr)} Q${n(x + w)},${n(y + h)} ${n(x + w - rr)},${n(y + h)} L${n(x)},${n(y + h)} Z`;
}

function gridAndAxis(g, top, tk, fmt) {
  const { x0, x1, y0, y1 } = g;
  const yOf = (v) => y1 - (v / top) * (y1 - y0);
  let out = "";
  for (const t of tk) {
    const y = yOf(t);
    out += `<line x1="${n(x0)}" y1="${n(y)}" x2="${n(x1)}" y2="${n(y)}" class="grid"/>`;
    out += `<text x="${n(x0 - 8)}" y="${n(y + 4)}" class="tick tick-y">${esc(fmt(t))}</text>`;
  }
  return out;
}

function legend(names, mark = "bar") {
  const key = (i) => mark === "line"
    ? `<span class="stroke" style="background:${seriesColor(i)}"></span>`
    : `<span class="swatch" style="background:${seriesColor(i)}"></span>`;
  return `<div class="legend">` + names.map((nm, i) =>
    `<span class="key">${key(i)}${esc(nm)}</span>`).join("") + `</div>`;
}

/** Figure wrapper: title above, legend under the title, note and caption below. */
function frame(svg, title, note, legendHtml = "") {
  return `<figure class="fig">` +
    (title ? `<figcaption class="fig-title">${esc(title)}</figcaption>` : "") +
    legendHtml +
    `<div class="fig-scroll">${svg}</div>` +
    (note ? `<div class="fig-note">${esc(note)}</div>` : "") +
    `</figure>`;
}

/**
 * Vertical columns over a categorical band.
 * rows: [{ label, value, tone? }]
 */
export function columns(rows, {
  title = "",
  note = "",
  format = (v) => compact(v),
  height = 220,
  color = SERIES[0],
  labelBars = true,
} = {}) {
  const W = 720, H = height;
  const g = { x0: 52, x1: W - 12, y0: 16, y1: H - 34 };
  const max = Math.max(...rows.map((r) => r.value));
  const { top, ticks: tk } = ticks(max);
  const yOf = (v) => g.y1 - (v / top) * (g.y1 - g.y0);
  const band = (g.x1 - g.x0) / rows.length;
  const bw = Math.min(24, band * 0.55);

  let body = gridAndAxis(g, top, tk, format);
  rows.forEach((r, i) => {
    const cx = g.x0 + band * (i + 0.5);
    const y = yOf(r.value);
    const fill = toneInk(r.tone, color);
    body += `<path d="${cappedBar(cx - bw / 2, y, bw, g.y1 - y)}" fill="${fill}">` +
      `<title>${esc(r.label)}: ${esc(format(r.value))}</title></path>`;
    if (labelBars) {
      body += `<text x="${n(cx)}" y="${n(y - 7)}" class="val">${esc(format(r.value))}</text>`;
    }
    body += `<text x="${n(cx)}" y="${n(g.y1 + 18)}" class="tick tick-x">${esc(r.label)}</text>`;
  });
  body += `<line x1="${n(g.x0)}" y1="${n(g.y1)}" x2="${n(g.x1)}" y2="${n(g.y1)}" class="axis"/>`;
  return frame(svgOpen(W, H, title || "column chart") + body + "</svg>", title, note);
}

/** Horizontal ranking bars. rows: [{ label, value, tone? }] */
export function bars(rows, { title = "", note = "", format = (v) => compact(v), color = SERIES[0] } = {}) {
  const W = 720, rowH = 30, H = rows.length * rowH + 14;
  const labelW = 132;
  const g = { x0: labelW, x1: W - 58, y0: 6, y1: H - 8 };
  const max = Math.max(...rows.map((r) => r.value));
  const { top } = ticks(max);
  let body = "";
  rows.forEach((r, i) => {
    const y = g.y0 + i * rowH;
    const w = ((r.value / top) * (g.x1 - g.x0)) || 0;
    body += `<text x="${n(labelW - 12)}" y="${n(y + 18)}" class="tick tick-y">${esc(r.label)}</text>`;
    body += `<path d="${hBar(g.x0, y + 5, w, 18)}" fill="${toneInk(r.tone, color)}">` +
      `<title>${esc(r.label)}: ${esc(format(r.value))}</title></path>`;
    body += `<text x="${n(g.x0 + w + 8)}" y="${n(y + 18)}" class="val val-left">${esc(format(r.value))}</text>`;
  });
  return frame(svgOpen(W, H, title || "bar chart") + body + "</svg>", title, note);
}

/** Grouped columns: rows [{ label, values: [..] }], series names in `names`. */
export function grouped(rows, names, { title = "", note = "", format = (v) => compact(v), height = 230 } = {}) {
  const W = 720, H = height;
  const g = { x0: 52, x1: W - 12, y0: 16, y1: H - 34 };
  const max = Math.max(...rows.flatMap((r) => r.values));
  const { top, ticks: tk } = ticks(max);
  const yOf = (v) => g.y1 - (v / top) * (g.y1 - g.y0);
  const band = (g.x1 - g.x0) / rows.length;
  const inner = Math.min(band * 0.7, 24 * names.length + 2 * (names.length - 1));
  const bw = (inner - 2 * (names.length - 1)) / names.length;

  let body = gridAndAxis(g, top, tk, format);
  rows.forEach((r, i) => {
    const start = g.x0 + band * (i + 0.5) - inner / 2;
    r.values.forEach((v, s) => {
      const x = start + s * (bw + 2);
      const y = yOf(v);
      body += `<path d="${cappedBar(x, y, bw, g.y1 - y)}" fill="${seriesColor(s)}">` +
        `<title>${esc(r.label)} · ${esc(names[s])}: ${esc(format(v))}</title></path>`;
    });
    body += `<text x="${n(g.x0 + band * (i + 0.5))}" y="${n(g.y1 + 18)}" class="tick tick-x">${esc(r.label)}</text>`;
  });
  body += `<line x1="${n(g.x0)}" y1="${n(g.y1)}" x2="${n(g.x1)}" y2="${n(g.y1)}" class="axis"/>`;
  return frame(svgOpen(W, H, title || "grouped bars") + body + "</svg>", title, note, legend(names));
}

/**
 * Stacked columns, 2px surface gap between segments.
 * rows: [{ label, values: [..] }]
 */
export function stacked(rows, names, { title = "", note = "", format = (v) => compact(v), height = 230 } = {}) {
  const W = 720, H = height;
  const g = { x0: 52, x1: W - 12, y0: 16, y1: H - 34 };
  const max = Math.max(...rows.map((r) => r.values.reduce((a, b) => a + b, 0)));
  const { top, ticks: tk } = ticks(max);
  const scale = (v) => (v / top) * (g.y1 - g.y0);
  const band = (g.x1 - g.x0) / rows.length;
  const bw = Math.min(24, band * 0.55);

  let body = gridAndAxis(g, top, tk, format);
  rows.forEach((r, i) => {
    const cx = g.x0 + band * (i + 0.5);
    let cursor = g.y1;
    r.values.forEach((v, s) => {
      const h = Math.max(0, scale(v) - 2); // 2px surface gap between segments
      const y = cursor - h;
      const isTop = s === r.values.length - 1;
      body += `<path d="${isTop ? cappedBar(cx - bw / 2, y, bw, h) : `M${n(cx - bw / 2)},${n(y)} h${n(bw)} v${n(h)} h${n(-bw)} Z`}" fill="${seriesColor(s)}">` +
        `<title>${esc(r.label)} · ${esc(names[s])}: ${esc(format(v))}</title></path>`;
      cursor = y - 2;
    });
    body += `<text x="${n(cx)}" y="${n(g.y1 + 18)}" class="tick tick-x">${esc(r.label)}</text>`;
  });
  body += `<line x1="${n(g.x0)}" y1="${n(g.y1)}" x2="${n(g.x1)}" y2="${n(g.y1)}" class="axis"/>`;
  return frame(svgOpen(W, H, title || "stacked bars") + body + "</svg>", title, note, legend(names));
}

/**
 * Lines over a shared x. series: [{ name, values: [..] }], x labels in `labels`.
 * The last point of each line is dotted and end-labelled.
 */
export function lines(labels, series, {
  title = "",
  note = "",
  format = (v) => compact(v),
  height = 240,
  area = false,
  zeroFloor = true,
} = {}) {
  const W = 720, H = height;
  const g = { x0: 52, x1: W - 74, y0: 16, y1: H - 34 };
  const all = series.flatMap((s) => s.values);
  const max = Math.max(...all);
  // With no zero floor, drop the baseline to a round number below the low point
  // so the axis reads 250 / 300 / 350 rather than 284 / 334 / 384.
  const lo = Math.min(...all);
  const step0 = ticks(max - lo).ticks[1] || 1;
  const min = zeroFloor ? 0 : Math.floor(lo / step0) * step0;
  const { top, ticks: tk } = ticks(max - min);
  const yOf = (v) => g.y1 - ((v - min) / top) * (g.y1 - g.y0);
  const xOf = (i) => g.x0 + (i / Math.max(1, labels.length - 1)) * (g.x1 - g.x0);

  let body = "";
  for (const t of tk) {
    const y = yOf(t + min);
    body += `<line x1="${n(g.x0)}" y1="${n(y)}" x2="${n(g.x1)}" y2="${n(y)}" class="grid"/>`;
    body += `<text x="${n(g.x0 - 8)}" y="${n(y + 4)}" class="tick tick-y">${esc(format(t + min))}</text>`;
  }
  series.forEach((s, si) => {
    const color = seriesColor(si);
    const d = s.values.map((v, i) => `${i ? "L" : "M"}${n(xOf(i))},${n(yOf(v))}`).join(" ");
    if (area && series.length === 1) {
      body += `<path d="${d} L${n(xOf(s.values.length - 1))},${n(g.y1)} L${n(g.x0)},${n(g.y1)} Z" fill="${color}" opacity="0.10"/>`;
    }
    body += `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    s.values.forEach((v, i) => {
      body += `<circle cx="${n(xOf(i))}" cy="${n(yOf(v))}" r="9" fill="transparent">` +
        `<title>${esc(s.name)} · ${esc(labels[i])}: ${esc(format(v))}</title></circle>`;
    });
    const li = s.values.length - 1;
    body += `<circle cx="${n(xOf(li))}" cy="${n(yOf(s.values[li]))}" r="4" fill="${color}" stroke="#000" stroke-width="2"/>`;
    body += `<text x="${n(xOf(li) + 10)}" y="${n(yOf(s.values[li]) + 4)}" class="val val-left">${esc(format(s.values[li]))}</text>`;
  });
  labels.forEach((l, i) => {
    if (labels.length > 8 && i % 2) return;
    body += `<text x="${n(xOf(i))}" y="${n(g.y1 + 18)}" class="tick tick-x">${esc(l)}</text>`;
  });
  body += `<line x1="${n(g.x0)}" y1="${n(g.y1)}" x2="${n(g.x1)}" y2="${n(g.y1)}" class="axis"/>`;
  return frame(
    svgOpen(W, H, title || "line chart") + body + "</svg>",
    title,
    note,
    series.length > 1 ? legend(series.map((s) => s.name), "line") : "",
  );
}

/**
 * A 12-point sparkline sized for a table cell. Re-exported for WP3's stats and
 * hero tiles.
 * @throws {RangeError} on fewer than two points, which cannot make a line.
 */
export function sparkline(values, { color = SERIES[0], w = 108, h = 26 } = {}) {
  if (values.length < 2) throw new RangeError("a sparkline needs at least two points");
  const max = Math.max(...values), min = Math.min(...values);
  const span = max - min || 1;
  const xOf = (i) => 2 + (i / (values.length - 1)) * (w - 14);
  const yOf = (v) => h - 4 - ((v - min) / span) * (h - 10);
  const d = values.map((v, i) => `${i ? "L" : "M"}${n(xOf(i))},${n(yOf(v))}`).join(" ");
  const li = values.length - 1;
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" class="spark" aria-hidden="true">` +
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` +
    `<circle cx="${n(xOf(li))}" cy="${n(yOf(values[li]))}" r="3" fill="${color}"/></svg>`;
}

/** Signed change bars about a zero line. rows: [{ label, value }] */
export function delta(rows, {
  title = "", note = "", format = (v) => (v > 0 ? "+" : "") + compact(v), height = 190,
  // Up is not always good. Latency and error counts want higherIsBetter: false.
  higherIsBetter = true,
} = {}) {
  const W = 720, H = height;
  const g = { x0: 52, x1: W - 12, y0: 16, y1: H - 34 };
  const max = Math.max(...rows.map((r) => Math.abs(r.value)));
  const { top } = ticks(max, 2);
  const mid = (g.y0 + g.y1) / 2;
  const yOf = (v) => mid - (v / top) * ((g.y1 - g.y0) / 2);
  const band = (g.x1 - g.x0) / rows.length;
  const bw = Math.min(24, band * 0.55);

  let body = `<line x1="${n(g.x0)}" y1="${n(mid)}" x2="${n(g.x1)}" y2="${n(mid)}" class="axis"/>`;
  body += `<text x="${n(g.x0 - 8)}" y="${n(yOf(top) + 4)}" class="tick tick-y">${esc(format(top))}</text>`;
  body += `<text x="${n(g.x0 - 8)}" y="${n(yOf(-top) + 4)}" class="tick tick-y">${esc(format(-top))}</text>`;
  rows.forEach((r, i) => {
    const cx = g.x0 + band * (i + 0.5);
    const y = yOf(r.value);
    const h = Math.abs(mid - y);
    const up = r.value >= 0;
    const fill = up === higherIsBetter ? GOOD : BAD;
    const d = up
      ? cappedBar(cx - bw / 2, y, bw, h)
      : `M${n(cx - bw / 2)},${n(mid)} h${n(bw)} v${n(h - 4)} q0,4 -4,4 h${n(-(bw - 8))} q-4,0 -4,-4 Z`;
    body += `<path d="${d}" fill="${fill}"><title>${esc(r.label)}: ${esc(format(r.value))}</title></path>`;
    body += `<text x="${n(cx)}" y="${n(up ? y - 7 : y + 15)}" class="val">${esc(format(r.value))}</text>`;
    body += `<text x="${n(cx)}" y="${n(g.y1 + 18)}" class="tick tick-x">${esc(r.label)}</text>`;
  });
  return frame(svgOpen(W, H, title || "change chart") + body + "</svg>", title, note);
}

/**
 * Dot + whisker: a middle value with a low/high range per item.
 * rows: [{ label, mid, lo, hi }]
 */
export function whisker(rows, { title = "", note = "", format = (v) => compact(v) } = {}) {
  const W = 720, rowH = 32, H = rows.length * rowH + 30;
  const g = { x0: 132, x1: W - 58, y0: 8, y1: H - 24 };
  const max = Math.max(...rows.map((r) => r.hi));
  const { top, ticks: tk } = ticks(max);
  const xOf = (v) => g.x0 + (v / top) * (g.x1 - g.x0);
  let body = "";
  for (const t of tk) {
    body += `<line x1="${n(xOf(t))}" y1="${n(g.y0)}" x2="${n(xOf(t))}" y2="${n(g.y1)}" class="grid"/>`;
    body += `<text x="${n(xOf(t))}" y="${n(H - 6)}" class="tick tick-x">${esc(format(t))}</text>`;
  }
  rows.forEach((r, i) => {
    const y = g.y0 + i * rowH + rowH / 2;
    body += `<text x="${n(g.x0 - 12)}" y="${n(y + 4)}" class="tick tick-y">${esc(r.label)}</text>`;
    body += `<line x1="${n(xOf(r.lo))}" y1="${n(y)}" x2="${n(xOf(r.hi))}" y2="${n(y)}" stroke="${SERIES[0]}" stroke-width="2" opacity="0.45"/>`;
    for (const edge of [r.lo, r.hi]) {
      body += `<line x1="${n(xOf(edge))}" y1="${n(y - 5)}" x2="${n(xOf(edge))}" y2="${n(y + 5)}" stroke="${SERIES[0]}" stroke-width="2" opacity="0.45"/>`;
    }
    body += `<circle cx="${n(xOf(r.mid))}" cy="${n(y)}" r="5" fill="${SERIES[0]}" stroke="#000" stroke-width="2">` +
      `<title>${esc(r.label)}: ${esc(format(r.mid))} (${esc(format(r.lo))}–${esc(format(r.hi))})</title></circle>`;
    body += `<text x="${n(g.x1 + 8)}" y="${n(y + 4)}" class="val val-left">${esc(format(r.mid))}</text>`;
  });
  return frame(svgOpen(W, H, title || "range chart") + body + "</svg>", title, note);
}

/** Heat map. rowLabels: y categories, colLabels: x categories, values[y][x]. */
export function heatmap(rowLabels, colLabels, values, { title = "", note = "", format = (v) => String(v) } = {}) {
  const cell = 34, gap = 2, labelW = 96;
  const W = 720;
  const cw = Math.min(cell, (W - labelW - 12) / colLabels.length - gap);
  const H = rowLabels.length * (cell + gap) + 34;
  const max = Math.max(...values.flat());
  let body = "";
  colLabels.forEach((c, x) => {
    body += `<text x="${n(labelW + x * (cw + gap) + cw / 2)}" y="14" class="tick tick-x">${esc(c)}</text>`;
  });
  rowLabels.forEach((r, y) => {
    const ty = 24 + y * (cell + gap);
    body += `<text x="${n(labelW - 12)}" y="${n(ty + cell / 2 + 4)}" class="tick tick-y">${esc(r)}</text>`;
    colLabels.forEach((c, x) => {
      const v = values[y]?.[x] ?? 0;
      const t = max ? v / max : 0;
      // One hue, light -> dark, stepped for a black surface.
      const fill = mix(SERIES[0], 0.12 + t * 0.88);
      body += `<rect x="${n(labelW + x * (cw + gap))}" y="${n(ty)}" width="${n(cw)}" height="${cell}" rx="3" fill="${fill}">` +
        `<title>${esc(r)} · ${esc(c)}: ${esc(format(v))}</title></rect>`;
      body += `<text x="${n(labelW + x * (cw + gap) + cw / 2)}" y="${n(ty + cell / 2 + 4)}" class="cell-val" ` +
        `fill="#fff">${esc(format(v))}</text>`;
    });
  });
  return frame(svgOpen(W, H, title || "heat map") + body + "</svg>", title, note);
}

/**
 * A horizontal progress meter, severity carried by the fill. Re-exported for
 * WP3's stat tiles.
 */
export function meter(value, { max = 1, tone = SERIES[0], label = "", right = "" } = {}) {
  const pct = Math.max(0, Math.min(1, value / max));
  return `<div class="meter">` +
    (label ? `<div class="meter-head"><span>${esc(label)}</span><span class="num">${esc(right)}</span></div>` : "") +
    `<div class="meter-track"><div class="meter-fill" style="width:${n(pct * 100)}%;background:${tone}"></div></div></div>`;
}

/**
 * Waterfall / bridge: signed steps between a start and an end total.
 * rows: [{ label, value, total? }]; a `total` row is drawn from zero.
 */
export function waterfall(rows, { title = "", note = "", format = (v) => compact(v), height = 230 } = {}) {
  const W = 720, H = height;
  const g = { x0: 58, x1: W - 12, y0: 16, y1: H - 34 };
  let run = 0;
  const spans = rows.map((r) => {
    if (r.total) { const s = { from: 0, to: r.value, ...r }; run = r.value; return s; }
    const from = run; run += r.value;
    return { from, to: run, ...r };
  });
  const max = Math.max(...spans.flatMap((s) => [s.from, s.to]));
  const { top, ticks: tk } = ticks(max);
  const yOf = (v) => g.y1 - (v / top) * (g.y1 - g.y0);
  const band = (g.x1 - g.x0) / rows.length;
  const bw = Math.min(24, band * 0.6);

  let body = gridAndAxis(g, top, tk, format);
  spans.forEach((s, i) => {
    const cx = g.x0 + band * (i + 0.5);
    const yTop = yOf(Math.max(s.from, s.to));
    const h = Math.abs(yOf(s.from) - yOf(s.to));
    const fill = s.total ? SERIES[0] : s.value >= 0 ? GOOD : BAD;
    body += `<path d="${cappedBar(cx - bw / 2, yTop, bw, h)}" fill="${fill}">` +
      `<title>${esc(s.label)}: ${esc(format(s.value))}</title></path>`;
    if (i < spans.length - 1) {
      const y = yOf(s.to);
      body += `<line x1="${n(cx + bw / 2)}" y1="${n(y)}" x2="${n(cx + band - bw / 2)}" y2="${n(y)}" stroke="#3a3a37" stroke-width="1" stroke-dasharray="3 3"/>`;
    }
    body += `<text x="${n(cx)}" y="${n(yTop - 7)}" class="val">${esc(format(s.value))}</text>`;
    body += `<text x="${n(cx)}" y="${n(g.y1 + 18)}" class="tick tick-x">${esc(s.label)}</text>`;
  });
  body += `<line x1="${n(g.x0)}" y1="${n(g.y1)}" x2="${n(g.x1)}" y2="${n(g.y1)}" class="axis"/>`;
  return frame(svgOpen(W, H, title || "waterfall") + body + "</svg>", title, note);
}

/**
 * Scatter, optionally sized. points: [{ x, y, size?, label? }].
 * Two numeric axes; the size channel is the bubble area.
 */
export function scatter(points, {
  title = "", note = "", height = 280, xTitle = "", yTitle = "",
  fx = (v) => compact(v), fy = (v) => compact(v), color = SERIES[0],
} = {}) {
  const W = 720, H = height;
  const g = { x0: 58, x1: W - 16, y0: 16, y1: H - 42 };
  const { top: xTop, ticks: xtk } = ticks(Math.max(...points.map((p) => p.x)));
  const { top: yTop, ticks: ytk } = ticks(Math.max(...points.map((p) => p.y)));
  const maxSize = Math.max(...points.map((p) => p.size ?? 1));
  const xOf = (v) => g.x0 + (v / xTop) * (g.x1 - g.x0);
  const yOf = (v) => g.y1 - (v / yTop) * (g.y1 - g.y0);

  let body = "";
  for (const t of ytk) {
    body += `<line x1="${n(g.x0)}" y1="${n(yOf(t))}" x2="${n(g.x1)}" y2="${n(yOf(t))}" class="grid"/>`;
    body += `<text x="${n(g.x0 - 8)}" y="${n(yOf(t) + 4)}" class="tick tick-y">${esc(fy(t))}</text>`;
  }
  for (const t of xtk) {
    body += `<text x="${n(xOf(t))}" y="${n(g.y1 + 18)}" class="tick tick-x">${esc(fx(t))}</text>`;
  }
  for (const p of points) {
    const r = p.size ? 5 + Math.sqrt(p.size / maxSize) * 13 : 5;
    body += `<circle cx="${n(xOf(p.x))}" cy="${n(yOf(p.y))}" r="${n(r)}" fill="${color}" fill-opacity="0.55" ` +
      `stroke="${color}" stroke-width="1.5">` +
      `<title>${esc(p.label ?? "")}${p.label ? " · " : ""}${esc(fx(p.x))}, ${esc(fy(p.y))}</title></circle>`;
  }
  body += `<line x1="${n(g.x0)}" y1="${n(g.y1)}" x2="${n(g.x1)}" y2="${n(g.y1)}" class="axis"/>`;
  if (xTitle) body += `<text x="${n((g.x0 + g.x1) / 2)}" y="${n(H - 6)}" class="tick tick-x">${esc(xTitle)}</text>`;
  if (yTitle) body += `<text transform="translate(14,${n((g.y0 + g.y1) / 2)}) rotate(-90)" class="tick" text-anchor="middle">${esc(yTitle)}</text>`;
  return frame(svgOpen(W, H, title || "scatter") + body + "</svg>", title, note);
}

/**
 * Funnel: ordered stages with a drop-off between each.
 * rows: [{ label, value }] in descending order.
 */
export function funnel(rows, { title = "", note = "", format = (v) => compact(v) } = {}) {
  const W = 720, rowH = 40, H = rows.length * rowH + 8;
  const labelW = 150;
  const g = { x0: labelW, x1: W - 118 };
  const first = rows[0]?.value ?? 0;
  let body = "";
  rows.forEach((r, i) => {
    const y = 4 + i * rowH;
    const w = first ? (r.value / first) * (g.x1 - g.x0) : 0;
    // One hue, stepping darker down the funnel: an ordinal ramp, not eight hues.
    const fill = mix(SERIES[0], 1 - i * 0.13);
    body += `<text x="${n(labelW - 12)}" y="${n(y + 22)}" class="tick tick-y">${esc(r.label)}</text>`;
    body += `<rect x="${n(g.x0)}" y="${n(y + 4)}" width="${n(Math.max(0, w))}" height="26" rx="4" fill="${fill}">` +
      `<title>${esc(r.label)}: ${esc(format(r.value))}</title></rect>`;
    body += `<text x="${n(g.x0 + w + 9)}" y="${n(y + 22)}" class="val val-left">${esc(format(r.value))}</text>`;
    if (i) {
      const drop = rows[i - 1].value ? r.value / rows[i - 1].value - 1 : 0;
      body += `<text x="${n(W - 4)}" y="${n(y + 22)}" class="val" text-anchor="end">` +
        `${(drop * 100).toFixed(0)}%</text>`;
    }
  });
  return frame(svgOpen(W, H, title || "funnel") + body + "</svg>", title, note);
}

/**
 * Schedule bars over a date range. tasks: [{ label, start, end, tone?, done? }]
 * with ISO date strings. Ticks fall on month boundaries.
 */
export function schedule(tasks, { title = "", note = "" } = {}) {
  const W = 720, rowH = 30, H = tasks.length * rowH + 34;
  const labelW = 150;
  const g = { x0: labelW, x1: W - 14 };
  const t0 = Math.min(...tasks.map((t) => Date.parse(t.start)));
  const t1 = Math.max(...tasks.map((t) => Date.parse(t.end)));
  const xOf = (ms) => g.x0 + ((ms - t0) / (t1 - t0 || 1)) * (g.x1 - g.x0);

  // Month boundaries inside the window.
  const marks = [];
  if (Number.isFinite(t0) && Number.isFinite(t1)) {
    const cur = new Date(t0);
    cur.setUTCDate(1);
    cur.setUTCHours(0, 0, 0, 0);
    while (cur.getTime() <= t1) {
      if (cur.getTime() >= t0) marks.push(new Date(cur));
      cur.setUTCMonth(cur.getUTCMonth() + 1);
    }
  }
  const opening = new Date(Number.isFinite(t0) ? t0 : 0);
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  let body = `<text x="${n(g.x0)}" y="12" class="tick" text-anchor="start">${MON[opening.getUTCMonth()]}</text>`;
  for (const m of marks) {
    const x = xOf(m.getTime());
    body += `<line x1="${n(x)}" y1="18" x2="${n(x)}" y2="${n(H - 22)}" class="grid"/>`;
    body += `<text x="${n(x)}" y="12" class="tick tick-x">${MON[m.getUTCMonth()]}</text>`;
  }
  tasks.forEach((t, i) => {
    const y = 22 + i * rowH;
    const x = xOf(Date.parse(t.start));
    const w = Math.max(4, xOf(Date.parse(t.end)) - x);
    body += `<text x="${n(labelW - 12)}" y="${n(y + 17)}" class="tick tick-y">${esc(t.label)}</text>`;
    body += `<rect x="${n(x)}" y="${n(y + 5)}" width="${n(w)}" height="16" rx="4" ` +
      `fill="${toneInk(t.tone, t.done ? GOOD : SERIES[0])}" fill-opacity="${t.done ? 0.9 : 0.75}">` +
      `<title>${esc(t.label)}: ${esc(t.start)} to ${esc(t.end)}</title></rect>`;
  });
  return frame(svgOpen(W, H, title || "schedule") + body + "</svg>", title, note);
}

/**
 * Small multiples: one panel per item, shared y scale, so panels compare.
 * items: [{ label, values: [..] }]
 */
export function smallMultiples(labels, items, {
  title = "", note = "", format = (v) => compact(v), cols = 3, panelH = 96,
} = {}) {
  const W = 720;
  const rows = Math.ceil(items.length / cols);
  const gap = 16;
  const pw = (W - gap * (cols - 1)) / cols;
  const H = rows * (panelH + 26);
  const max = Math.max(...items.flatMap((i) => i.values));
  const { top } = ticks(max);

  let body = "";
  items.forEach((item, idx) => {
    const cx = (idx % cols) * (pw + gap);
    const cy = Math.floor(idx / cols) * (panelH + 26);
    const y0 = cy + 18, y1 = cy + 18 + panelH - 22;
    const xOf = (i) => cx + 2 + (i / Math.max(1, item.values.length - 1)) * (pw - 4);
    const yOf = (v) => y1 - (v / top) * (y1 - y0);
    body += `<text x="${n(cx)}" y="${n(cy + 11)}" class="tick" text-anchor="start">${esc(item.label)}</text>`;
    body += `<line x1="${n(cx)}" y1="${n(y1)}" x2="${n(cx + pw)}" y2="${n(y1)}" class="grid"/>`;
    const d = item.values.map((v, i) => `${i ? "L" : "M"}${n(xOf(i))},${n(yOf(v))}`).join(" ");
    body += `<path d="${d}" fill="none" stroke="${SERIES[0]}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    const li = item.values.length - 1;
    body += `<circle cx="${n(xOf(li))}" cy="${n(yOf(item.values[li]))}" r="3.5" fill="${SERIES[0]}" stroke="#000" stroke-width="2"/>`;
    body += `<text x="${n(cx + pw)}" y="${n(cy + 11)}" class="val" text-anchor="end">${esc(format(item.values[li]))}</text>`;
  });
  return frame(
    svgOpen(W, H, title || "small multiples") + body + "</svg>",
    title,
    note + (note ? " " : "") + `All panels share one scale, 0 to ${format(top)}.`,
  );
}

/**
 * Share of a whole, as one stacked strip rather than a pie.
 * parts: [{ label, value }]
 */
export function shareBar(parts, { title = "", note = "", format = (v) => compact(v) } = {}) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  const W = 720, H = 30;
  let x = 0, body = "";
  parts.forEach((p, i) => {
    const w = (p.value / total) * W - (i < parts.length - 1 ? 2 : 0);
    body += `<rect x="${n(x)}" y="0" width="${n(Math.max(0, w))}" height="22" rx="3" fill="${seriesColor(i)}">` +
      `<title>${esc(p.label)}: ${esc(format(p.value))} (${((p.value / total) * 100).toFixed(1)}%)</title></rect>`;
    x += w + 2;
  });
  const keys = parts.map((p, i) =>
    `<span class="key"><span class="swatch" style="background:${seriesColor(i)}"></span>${esc(p.label)} ` +
    `<span class="pctn">${((p.value / total) * 100).toFixed(0)}%</span></span>`).join("");
  return `<figure class="fig">` +
    (title ? `<figcaption class="fig-title">${esc(title)}</figcaption>` : "") +
    `<div class="fig-scroll">` + svgOpen(W, H, title || "share") + body + `</svg></div>` +
    `<div class="legend">${keys}</div>` +
    (note ? `<div class="fig-note">${esc(note)}</div>` : "") + `</figure>`;
}

/** Zip parallel `labels` / `values` arrays into the row shape the primitives take. */
const rowsOf = (labels = [], values = [], tones = []) =>
  labels.map((label, i) => (tones[i] ? { label, value: values[i], tone: tones[i] } : { label, value: values[i] }));

/** `[{ name, values }]` -> per-label rows, for grouped and stacked columns. */
const seriesRows = (labels = [], series = []) =>
  labels.map((label, i) => ({ label, values: series.map((s) => s.values?.[i] ?? 0) }));

/**
 * Render one `chart` block.
 *
 * Dispatches on `block.kind` and maps the document's data shape onto the
 * primitive above it. `data.format` picks a preset from {@link FORMATS};
 * `data.src` has already been resolved to inline data by the caller.
 *
 * @param {ChartBlock} block a normalized, validated chart block
 * @returns {string} HTML; an empty string for a kind this module does not draw
 */
export function renderChart(block) {
  const d = /** @type {any} */ (block?.data ?? {});
  const kind = block?.kind ?? "";
  const fmt = formatter(d.format);
  const base = { title: d.title ?? "", note: d.note ?? "", format: fmt };
  const labels = d.labels ?? [];
  const values = d.values ?? [];
  const series = d.series ?? [];
  const names = series.map((s, i) => s.name ?? s.label ?? `Series ${i + 1}`);

  switch (kind) {
    case "columns":
      return columns(rowsOf(labels, values, d.tones ?? []), { ...base, height: d.height ?? 220, labelBars: d.labelBars !== false });
    case "bars":
      return bars(rowsOf(labels, values, d.tones ?? []), base);
    case "lines":
      return lines(labels, series, { ...base, height: d.height ?? 240, area: d.area === true, zeroFloor: d.zeroFloor !== false });
    case "grouped":
      return grouped(seriesRows(labels, series), names, { ...base, height: d.height ?? 230 });
    case "stacked":
      return stacked(seriesRows(labels, series), names, { ...base, height: d.height ?? 230 });
    case "delta":
      return delta(rowsOf(labels, values), {
        ...base,
        format: (v) => (v > 0 ? "+" : "") + fmt(v),
        height: d.height ?? 190,
        higherIsBetter: d.higherIsBetter !== false,
      });
    case "whisker":
      return whisker(labels.map((label, i) => ({ label, mid: d.mid?.[i] ?? 0, lo: d.lo?.[i] ?? 0, hi: d.hi?.[i] ?? 0 })), base);
    case "heatmap":
      return heatmap(d.rows ?? [], d.cols ?? [], d.values ?? [], base);
    case "waterfall": {
      const totals = new Set(d.totals ?? []);
      return waterfall(labels.map((label, i) => ({ label, value: values[i], total: totals.has(i) || undefined })), { ...base, height: d.height ?? 230 });
    }
    case "scatter":
      return scatter(d.points ?? [], {
        title: base.title, note: base.note, height: d.height ?? 280,
        xTitle: d.xTitle ?? "", yTitle: d.yTitle ?? "", fx: fmt, fy: fmt,
      });
    case "funnel":
      return funnel(rowsOf(labels, values), base);
    case "schedule":
      return schedule(d.tasks ?? [], { title: base.title, note: base.note });
    case "small-multiples": {
      // Accepts either `items: [{ label, values }]` or the `series: [{ name, values }]`
      // spelling the other multi-series charts use.
      const items = (d.items ?? series).map((s, i) => ({ label: s.label ?? s.name ?? `Panel ${i + 1}`, values: s.values ?? [] }));
      return smallMultiples(labels, items, { ...base, cols: d.cols ?? 3, panelH: d.panelH ?? 96 });
    }
    case "share": {
      const parts = d.parts ?? rowsOf(labels, values);
      return shareBar(parts, base);
    }
    default:
      return "";
  }
}

export { esc };
