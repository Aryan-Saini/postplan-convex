import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parseMarkdown } from "../src/render/parse.js";
import {
  FORMATS, SERIES, TONE_INK, compact, formatter, inkOn, meter, renderChart, seriesColor, sparkline, ticks,
} from "../src/render/charts.js";
import { CSS } from "../src/render/shell.js";
import { renderFlow, renderSequence } from "../src/render/diagram.js";

const gallery = readFileSync(fileURLToPath(new URL("../examples/gallery.md", import.meta.url)), "utf8");
const { doc, errors } = parseMarkdown(gallery, { file: "gallery.md" });

test("the gallery parses cleanly, so the fixtures below are the real shapes", () => {
  assert.deepEqual(errors, []);
});

/** Every chart kind the spec lists, each with its gallery fixture. */
const CHART_KINDS = [
  "columns", "bars", "lines", "grouped", "stacked", "delta", "whisker", "heatmap",
  "waterfall", "scatter", "funnel", "schedule", "small-multiples", "share",
];

const chartsByKind = new Map();
for (const b of doc.blocks) if (b.type === "chart" && !chartsByKind.has(b.kind)) chartsByKind.set(b.kind, b);

test("ticks() covers the range with round steps", () => {
  assert.deepEqual(ticks(168), { top: 200, ticks: [0, 50, 100, 150, 200] });
  assert.deepEqual(ticks(1), { top: 1, ticks: [0, 0.25, 0.5, 0.75, 1] });
  // A non-positive max still yields a usable scale rather than NaN geometry.
  assert.deepEqual(ticks(0), { top: 1, ticks: [0, 1] });
  assert.deepEqual(ticks(-5), { top: 1, ticks: [0, 1] });
  const { top, ticks: tk } = ticks(1340);
  assert.equal(top, 1500);
  assert.equal(tk.at(-1), 1500);
  assert.ok(top >= 1340);
});

test("compact() shortens at each magnitude and keeps the sign", () => {
  assert.equal(compact(412), "412");
  assert.equal(compact(1284), "1.3k");
  assert.equal(compact(4200000), "4.2M");
  assert.equal(compact(2e9), "2B");
  assert.equal(compact(-41000), "-41k");
  assert.equal(compact(1000), "1k");
});

test("each format preset renders its documented shape", () => {
  assert.equal(FORMATS.int(1284), "1,284");
  assert.equal(FORMATS.compact(1284), "1.3k");
  assert.equal(FORMATS.usd(412000), "$412k");
  assert.equal(FORMATS.usd(-412000), "-$412k");
  assert.equal(FORMATS.pct(0.031), "3.1%");
  assert.equal(FORMATS.ms(412), "412 ms");
  assert.equal(FORMATS.ms(1340), "1,340 ms");
  // An unknown or missing format falls back to compact rather than throwing.
  assert.equal(formatter("nope")(1284), "1.3k");
  assert.equal(formatter(undefined)(1284), "1.3k");
});

test("the palette caps at eight series", () => {
  assert.equal(seriesColor(0), SERIES[0]);
  assert.equal(seriesColor(7), SERIES[7]);
  assert.throws(() => seriesColor(8), RangeError);
});

test("a sparkline needs two points", () => {
  assert.throws(() => sparkline([5]), RangeError);
  assert.throws(() => sparkline([]), RangeError);
  const svg = sparkline([1, 2, 3]);
  assert.match(svg, /^<svg /);
  assert.match(svg, /class="spark"/);
  // A flat series divides by a span of zero unless the guard holds.
  assert.doesNotMatch(sparkline([4, 4, 4]), /NaN/);
});

test("meter clamps to its track", () => {
  assert.match(meter(486, { max: 512, label: "Largest document" }), /width:94\.92%/);
  assert.match(meter(900, { max: 512 }), /width:100%/);
  assert.match(meter(-3, { max: 512 }), /width:0%/);
});

for (const kind of CHART_KINDS) {
  test(`chart ${kind} renders an svg from its gallery fixture`, () => {
    const block = chartsByKind.get(kind);
    assert.ok(block, `gallery.md has no "chart ${kind}" fixture`);
    const html = renderChart(block);
    assert.match(html, /<svg /);
    assert.match(html, /<figure class="fig">/);
    assert.doesNotMatch(html, /<script/);
    assert.doesNotMatch(html, /NaN|Infinity|undefined/);
  });
}

test("an unknown chart kind renders nothing rather than throwing", () => {
  assert.equal(renderChart({ type: "chart", kind: "pie", data: { labels: ["a"], values: [1] } }), "");
});

test("charts survive an empty data set without throwing", () => {
  for (const kind of CHART_KINDS) {
    assert.doesNotThrow(() => renderChart({ type: "chart", kind, data: {} }), kind);
  }
});

test("delta reads the higherIsBetter flag from the block", () => {
  const block = chartsByKind.get("delta");
  // Latency: the +44 ms bar must be red, not green.
  assert.match(renderChart(block), /fill="#d03b3b"><title>Total: \+44 ms/);
  const flipped = { ...block, data: { ...block.data, higherIsBetter: true } };
  assert.match(renderChart(flipped), /fill="#0ca30c"><title>Total: \+44 ms/);
});

test("waterfall draws the indices in totals as balances", () => {
  const html = renderChart(chartsByKind.get("waterfall"));
  // Aug total and Sep total are the blue balance bars; the steps are green or red.
  assert.equal(html.match(/fill="#3987e5"/g).length, 2);
});

test("two diagrams on one page get distinct marker ids", () => {
  const flowBlock = doc.blocks.find((b) => b.type === "flow");
  const seqBlock = doc.blocks.find((b) => b.type === "sequence");
  const a = renderFlow(flowBlock);
  const b = renderSequence(seqBlock);
  const idOf = (html) => html.match(/<marker id="(arw\d+)"/)[1];
  assert.notEqual(idOf(a), idOf(b));
  // A second render of the same block mints a fresh id too.
  assert.notEqual(idOf(a), idOf(renderFlow(flowBlock)));
  for (const html of [a, b]) assert.ok(html.includes(`marker-end="url(#${idOf(html)})"`));
  assert.match(a, /<svg /);
  assert.match(b, /<svg /);
});

test("labels are escaped, not interpolated", () => {
  const html = renderChart({
    type: "chart", kind: "columns",
    data: { format: "int", labels: ['<script>"x"'], values: [3] },
  });
  assert.doesNotMatch(html, /<script/);
  assert.match(html, /&lt;script&gt;/);
});

/* ------------------------------------------------ label clipping and tone */

const LONG = "A twenty-four char label"; // 24 characters
const BIG = 412000; // "412,000" under format int: 7 characters

/** Wide fixtures: a 24-character category and a 7-character value in every kind. */
const WIDE = {
  columns: { labels: [LONG, "b", "c", LONG], values: [BIG, 9, 12, BIG] },
  bars: { labels: [LONG, "b"], values: [BIG, 9000] },
  lines: {
    labels: ["W1", "W2", "W3", "W4"],
    series: [{ name: "a", values: [1, 2, 3, BIG] }, { name: "b", values: [3, 2, 1, BIG - 90000], tone: "bad" }],
  },
  grouped: { labels: [LONG, "b", LONG], series: [{ name: "a", values: [BIG, 2, 3] }, { name: "b", values: [1, 2, BIG] }] },
  stacked: { labels: [LONG, "b", LONG], series: [{ name: "a", values: [BIG, 2, 3] }, { name: "b", values: [1, 2, BIG] }] },
  delta: { labels: [LONG, "b", LONG], values: [-BIG, 12, BIG] },
  whisker: { labels: [LONG, "b"], mid: [BIG, 10], lo: [1000, 5], hi: [BIG + 1000, 20] },
  heatmap: { rows: [LONG, "b"], cols: ["00", "03", "06", "09", "12", "15", "18", "21"], values: [[1, 2, 3, 4, 5, 6, 7, BIG], [0, 0, 0, 0, 0, 0, 0, 1]] },
  waterfall: { labels: [LONG, "b", LONG], values: [BIG, -100000, 312000], totals: [0, 2] },
  scatter: { points: [{ x: BIG, y: BIG, label: LONG }, { x: 10, y: 10 }], xTitle: LONG, yTitle: LONG },
  funnel: { labels: [LONG, "b", LONG], values: [BIG, 333720, 226930] },
  schedule: {
    tasks: [{ label: LONG, start: "2026-08-30", end: "2026-09-20" }, { label: "b", start: "2026-09-02", end: "2026-10-31", tone: "bad" }],
  },
  "small-multiples": { labels: ["W1", "W2", "W3"], series: [{ name: LONG, values: [1, 2, BIG] }, { name: "b", values: [1, 2, 3] }, { name: LONG, values: [3, 2, BIG] }] },
  share: { labels: [LONG, "b"], values: [BIG, 9] },
};

const unescape = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

/**
 * Every `<text>` the svg draws, with its estimated horizontal extent. The
 * anchor follows the shell's CSS, where a class rule beats a presentation
 * attribute: tick-y and val-end end, val-left starts, tick-x / val / cell-val
 * centre; otherwise the attribute, else start.
 */
function textExtents(svg) {
  const [vx, , vw] = svg.match(/viewBox="([^"]+)"/)[1].split(" ").map(Number);
  const out = [];
  for (const m of svg.matchAll(/<text ([^>]*)>([^<]*)<\/text>/g)) {
    const attrs = m[1];
    if (/transform=/.test(attrs)) continue; // the rotated y title stands on the left edge
    const cls = (attrs.match(/class="([^"]*)"/)?.[1] ?? "").split(" ");
    const x = Number(attrs.match(/\bx="([^"]+)"/)[1]);
    const px = cls.includes("cell-val") ? 11 : 12;
    const w = unescape(m[2]).length * 6.5 * (px / 12);
    const anchor = cls.includes("tick-y") || cls.includes("val-end") ? "end"
      : cls.includes("val-left") ? "start"
      : cls.some((c) => ["tick-x", "val", "cell-val"].includes(c)) ? "middle"
      : attrs.match(/text-anchor="([^"]+)"/)?.[1] ?? "start";
    const lo = anchor === "end" ? x - w : anchor === "middle" ? x - w / 2 : x;
    out.push({ text: unescape(m[2]), lo, hi: lo + w, min: vx, max: vx + vw, attrs });
  }
  return out;
}

const svgsOf = (html) => [...html.matchAll(/<svg [\s\S]*?<\/svg>/g)].map((m) => m[0]);

for (const kind of CHART_KINDS) {
  test(`chart ${kind}: no label leaves the viewBox, gallery or widest fixture`, () => {
    for (const block of [chartsByKind.get(kind), { type: "chart", kind, data: { format: "int", ...WIDE[kind] } }]) {
      for (const svg of svgsOf(renderChart(block))) {
        for (const t of textExtents(svg)) {
          assert.ok(t.lo >= t.min && t.hi <= t.max,
            `${kind}: "${t.text}" spans ${t.lo.toFixed(1)}..${t.hi.toFixed(1)}, viewBox ${t.min}..${t.max}`);
        }
      }
    }
  });
}

test("delta value labels carry their bar's tone", () => {
  const html = renderChart(chartsByKind.get("delta"));
  // Latency, lower is better: +44 ms is red, -11 ms is green.
  assert.match(html, /class="val" style="fill:#d03b3b">\+44 ms</);
  assert.match(html, /class="val" style="fill:#0ca30c">-11 ms</);
});

test("waterfall step labels are toned, balances stay white", () => {
  const html = renderChart(chartsByKind.get("waterfall"));
  assert.match(html, /style="fill:#0ca30c">34</);
  assert.match(html, /style="fill:#d03b3b">-41</);
  assert.match(html, /class="val">168</);
});

test("funnel step drops are red and right-aligned", () => {
  const drops = [...renderChart(chartsByKind.get("funnel")).matchAll(/class="val val-end"([^>]*)>([^<]+)</g)];
  assert.equal(drops.length, 4);
  for (const [, attrs, text] of drops) {
    assert.match(text, /^-\d+%$/);
    assert.equal(attrs, ' style="fill:#d03b3b"');
  }
});

test("a series tone colours its line, key and end label; others stay white", () => {
  const html = renderChart({ type: "chart", kind: "lines", data: { format: "int", ...WIDE.lines } });
  assert.match(html, /stroke="#d03b3b" stroke-width="2"/);
  assert.match(html, /class="stroke" style="background:#d03b3b"/);
  assert.match(html, /class="val val-left" style="fill:#d03b3b">322,000</);
  assert.match(html, /class="val val-left">412,000</);
  // Ticks never take a colour.
  assert.doesNotMatch(html, /class="tick[^"]*" style=/);
});

test("heatmap cell ink follows the fill's luminance", () => {
  const html = renderChart({ type: "chart", kind: "heatmap", data: { rows: ["a"], cols: ["x", "y"], values: [[0, 10]] } });
  assert.match(html, /class="cell-val" fill="#fff">0</);
  assert.equal(inkOn("#ffffff"), "#000");
  assert.equal(inkOn("#0b0b0b"), "#fff");
});

test("every tone ink clears 3:1 on true black", () => {
  const lum = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
  for (const [tone, hex] of Object.entries(TONE_INK)) {
    assert.ok((lum(hex) + 0.05) / 0.05 >= 3, `${tone} ${hex}`);
  }
});

test("chart text gets a true-black halo from the stylesheet", () => {
  assert.match(CSS, /\.chart text\{[^}]*paint-order:stroke fill;stroke:#000;stroke-width:3px;stroke-linejoin:round/);
});
