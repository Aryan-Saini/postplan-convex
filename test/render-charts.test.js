import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parseMarkdown } from "../src/render/parse.js";
import {
  FORMATS, SERIES, compact, formatter, meter, renderChart, seriesColor, sparkline, ticks,
} from "../src/render/charts.js";
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
