/**
 * Block IR -> HTML.
 *
 * One function per block kind, all of them pure string builders over the classes
 * `shell.js` defines. Charts, code, diagrams and math are not rendered here: they
 * come in through `deps.js`, which resolves to WP4's modules (or, until those
 * land, to `_stubs.js`).
 *
 * The markdown blocks WP1 hands over are already HTML, so prose needs three
 * rewrites on the way out: inline math spans become MathML, tables gain their
 * scroll wrapper, and an image titled `zoom` becomes a lightbox figure.
 *
 * @module render/blocks
 */

import { escapeHtml } from "./parse.js";
import {
  meter, renderChart, renderCode, renderDiff, renderFlow, renderInlineMath,
  renderMathBlock, renderSequence, sparkline,
} from "./deps.js";

/** @typedef {import("./ir.js").Block} Block */
/** @typedef {import("./ir.js").Doc} Doc */
/** @typedef {import("./ir.js").Meta} Meta */

/** Per-document render state: lightbox ids are document-wide, and a `sources`
 * heading changes how the list under it is styled.
 * @typedef {{ lightboxes: string[], zoomCount: number, heading: string }} Ctx */

/** @returns {Ctx} */
const newCtx = () => ({ lightboxes: [], zoomCount: 0, heading: "" });

/* ------------------------------------------------------------------ document */

/**
 * Render a whole document body: title, byline, contents strip, then every block
 * in order, with any lightbox overlays collected at the end.
 *
 * @param {Doc} doc
 * @returns {string}
 */
export function renderBody(doc) {
  const ctx = newCtx();
  const parts = [];
  if (doc.meta.title) parts.push(`<h1>${escapeHtml(doc.meta.title)}</h1>`);
  const line = byline(doc.meta);
  if (line) parts.push(line);

  // The lead is the opening paragraph and sits above the contents strip, the way
  // the renderer puts the answer before the navigation.
  const blocks = doc.blocks ?? [];
  let i = 0;
  if (blocks[0]?.type === "markdown" && blocks[0].lead) parts.push(renderBlock(blocks[i++], ctx));

  const toc = contents(blocks);
  if (toc) parts.push(toc);

  for (; i < blocks.length; i++) parts.push(renderBlock(blocks[i], ctx));
  parts.push(...ctx.lightboxes);

  return `<div class="wrap"><main>\n${parts.filter(Boolean).join("\n")}\n</main></div>`;
}

/**
 * The byline row: a date pill with the calendar glyph, an @author pill, and a
 * status pill whose dot takes its colour from the status text.
 *
 * @param {Meta} meta
 * @returns {string} empty when the document carries no byline metadata
 */
export function byline(meta) {
  const chips = [];
  if (meta.date) {
    chips.push(
      `<span class="chip"><svg viewBox="0 0 16 16" aria-hidden="true">` +
      `<rect x="2" y="3" width="12" height="11" rx="2"/><path d="M2 7h12M5 1.5v3M11 1.5v3"/></svg>` +
      `${escapeHtml(meta.date)}</span>`,
    );
  }
  if (meta.byline) chips.push(`<span class="chip">@${escapeHtml(meta.byline)}</span>`);
  if (meta.status) {
    chips.push(`<span class="chip ${statusTone(meta.status)}"><span class="dot"></span>${escapeHtml(meta.status)}</span>`);
  }
  if (!chips.length) return "";
  return `<div class="byline">${chips.join('<span class="sep">·</span>')}</div>`;
}

/** Status words that colour the byline dot; anything else reads as on track. */
function statusTone(status) {
  const s = String(status).toLowerCase();
  if (/block|critical|fail|stopped/.test(s)) return "critical";
  if (/risk|warn|late|slipping/.test(s)) return "warn";
  return "good";
}

/**
 * The contents strip, built from the `##` headings so it needs no second parse.
 * One heading is not a table of contents, so fewer than two renders nothing.
 *
 * @param {Block[]} blocks
 * @returns {string}
 */
export function contents(blocks) {
  const tops = blocks.filter((b) => b.type === "heading" && b.level === 2);
  if (tops.length < 2) return "";
  const links = tops.map((h) => `<a href="#${escapeHtml(h.slug)}">${escapeHtml(h.text)}</a>`).join("");
  return `<div class="contents">${links}</div>`;
}

/* ------------------------------------------------------------------ blocks */

/**
 * Render one block. Unknown types render nothing: WP2's validator is what tells
 * the author about them, and a half-rendered block would hide that error.
 *
 * @param {Block} block
 * @param {Ctx} [ctx]
 * @returns {string}
 */
export function renderBlock(block, ctx = newCtx()) {
  switch (block.type) {
    case "markdown": return prose(block, ctx);
    case "heading": {
      ctx.heading = block.slug;
      const l = Math.min(Math.max(block.level, 1), 6);
      return `<h${l} id="${escapeHtml(block.slug)}">${escapeHtml(block.text)}</h${l}>`;
    }
    case "callout": {
      const cls = block.tone === "note" ? "note" : `note ${block.tone}`;
      return `<div class="${cls}"><span class="tag">${escapeHtml(block.title)}</span>\n<div>${block.html}</div></div>`;
    }
    case "container":
      return `<div class="${escapeHtml(block.kind)}">\n${block.html}\n</div>`;
    case "chart": return renderChart(block);
    case "stats": return stats(block);
    case "hero": return hero(block);
    case "timeline": return timeline(block);
    case "slides": return slides(block);
    case "video": return video(block);
    case "code": return renderCode(block);
    case "diff": return renderDiff(block);
    case "flow": return renderFlow(block);
    case "sequence": return renderSequence(block);
    case "math": return renderMathBlock(block.tex);
    case "html": return block.html;
    case "footnotes": return footnotes(block);
    default: return "";
  }
}

/* ------------------------------------------------------------------ prose */

/** Markdown HTML from WP1, with the three rewrites the shell needs. */
function prose(block, ctx) {
  let html = renderInlineMath(block.html);
  html = wrapTables(html);
  html = zoomFigures(html, ctx);
  if (block.lead) html = html.replace(/^<p>/, '<p class="lead">');
  // The list under a "Sources" heading is the provenance list, not body copy.
  if (ctx.heading === "sources") html = html.replace(/^<ul>/, '<ul class="sources">');
  return html;
}

/**
 * Give every table the horizontal scroll wrapper, and let a table with four or
 * more columns take the full column width; a narrow one sizes to its content,
 * which is what the renderer does.
 */
function wrapTables(html) {
  return html.replace(/<table>([\s\S]*?)<\/table>/g, (_, inner) => {
    const firstRow = /<tr>([\s\S]*?)<\/tr>/.exec(inner)?.[1] ?? "";
    const cols = (firstRow.match(/<t[hd][\s>]/g) ?? []).length;
    const cls = cols >= 4 ? ' class="full"' : "";
    return `<div class="tbl-wrap"><table${cls}>${inner}</table></div>`;
  });
}

/**
 * `![alt](src "zoom")` becomes a figure whose thumbnail links to a `:target`
 * overlay. The overlay is collected on the context and emitted once at the end
 * of the document, so it is never nested inside a paragraph.
 */
function zoomFigures(html, ctx) {
  const img = /<img\b[^>]*\bdata-zoom="1"[^>]*>/;
  const wrapped = new RegExp(`<p>\\s*(${img.source})\\s*</p>`, "g");
  const replace = (tag) => {
    const id = `lb-${++ctx.zoomCount}`;
    const alt = /alt="([^"]*)"/.exec(tag)?.[1] ?? "";
    const clean = tag.replace(/\s*data-zoom="1"/, "");
    const cap = alt ? `<figcaption>${alt}</figcaption>` : "";
    ctx.lightboxes.push(
      `<div class="lightbox" id="${id}"><a href="#_">${clean}</a>` +
      (alt ? `<div class="cap">${alt}</div>` : "") + `</div>`,
    );
    return `<figure class="img"><a class="zoom" href="#${id}">${clean}</a>${cap}</figure>`;
  };
  return html
    .replace(wrapped, (_, tag) => replace(tag))
    .replace(new RegExp(img.source, "g"), (tag) => replace(tag));
}

/* ------------------------------------------------------------------ tiles */

/** Dense stat tiles sharing one hairline grid, each with a sparkline or a meter. */
function stats(block) {
  const items = asArray(block.data);
  if (!items.length) return "";
  const tiles = items.map((it) => {
    const parts = [`<div class="k">${escapeHtml(it.k ?? "")}</div>`, `<div class="v">${value(it)}</div>`];
    if (it.delta) parts.push(`<div class="d">${delta(it)}</div>`);
    if (Array.isArray(it.spark)) parts.push(sparkline(it.spark, { color: sparkColor(it.tone) }));
    if (it.meter) parts.push(meter(Number(it.v), { max: Number(it.meter.max), tone: "#fab219" }));
    return `<div class="stat">${parts.join("")}</div>`;
  });
  return `<div class="stats">${tiles.join("")}</div>`;
}

/** The centred hero stat: title, big number, as-of line, signed change. */
function hero(block) {
  const items = asArray(block.data);
  if (!items.length) return "";
  const tiles = items.map((it) => {
    const parts = [`<div class="k">${escapeHtml(it.k ?? "")}</div>`, `<div class="v">${value(it)}</div>`];
    if (it.as) parts.push(`<div class="as">${escapeHtml(it.as)}</div>`);
    if (it.delta) parts.push(`<div class="d">${delta(it)}</div>`);
    return `<div class="hero">${parts.join("")}</div>`;
  });
  return tiles.length === 1 ? tiles[0] : `<div class="heroes">${tiles.join("")}</div>`;
}

const SPARK_TONES = { good: "#199e70", warn: "#c98500", bad: "#d03b3b", critical: "#d03b3b" };
const sparkColor = (tone) => SPARK_TONES[tone] ?? "#3987e5";

const value = (it) => escapeHtml(format(it.v, it.format));

/** The word that separates a change from what it is measured against. */
const BASIS = /\s(?:vs|of|since|over|against|from)\s/;

/**
 * A delta reads `+18.4% vs August`: the magnitude is bold and coloured by tone,
 * the basis stays muted. With no tone (`95% of the cap`) the whole line is muted,
 * because there is no direction to signal.
 */
function delta(it) {
  const text = String(it.delta);
  if (!it.tone) return escapeHtml(text);
  const at = BASIS.exec(text);
  const head = at ? text.slice(0, at.index) : text.split(/\s/, 1)[0];
  const dir = it.tone === "good" ? "up" : "down";
  return `<b class="${dir}">${escapeHtml(head)}</b>${escapeHtml(text.slice(head.length))}`;
}

/**
 * The format presets. Never a template string: the enum keeps the output
 * predictable and the error message short when an author invents one.
 *
 * @param {unknown} v
 * @param {string} [preset] one of `int` `compact` `usd` `pct` `ms`
 * @returns {string}
 */
export function format(v, preset) {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v ?? "");
  switch (preset) {
    case "int": return Math.round(n).toLocaleString("en-US");
    case "compact": return compact(n);
    case "usd": return (n < 0 ? "-$" : "$") + compact(Math.abs(n));
    case "pct": return `${trim(n * 100)}%`;
    case "ms": return `${Math.round(n).toLocaleString("en-US")} ms`;
    default: return trim(n);
  }
}

/** 1284 -> 1.28k, 412000 -> 412k: three significant figures, then a unit. */
function compact(n) {
  const abs = Math.abs(n);
  const units = [[1e9, "B"], [1e6, "M"], [1e3, "k"]];
  for (const [scale, unit] of units) {
    if (abs >= scale) return trim(Number((n / scale).toPrecision(3))) + unit;
  }
  return trim(Number(n.toPrecision(3)));
}

/** Drop a trailing `.0`, keeping thousands separators. */
function trim(n) {
  return Number(n.toFixed(2)).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/* ------------------------------------------------------------------ media */

/** Dated timeline; `state` is `done`, `now`, or absent for something ahead. */
function timeline(block) {
  const items = asArray(block.data);
  if (!items.length) return "";
  const rows = items.map((it) => {
    const cls = it.state === "done" || it.state === "now" ? ` class="${it.state}"` : "";
    const note = it.note ? `<p>${escapeHtml(it.note)}</p>` : "";
    return `<li${cls}><span class="when">${escapeHtml(it.when ?? "")}</span>` +
      `<div class="what">${escapeHtml(it.what ?? "")}</div>${note}</li>`;
  });
  return `<ul class="timeline">${rows.join("")}</ul>`;
}

/** Scroll-snap slideshow. The dots are anchors, so it needs no script. */
function slides(block) {
  const items = asArray(block.data);
  if (!items.length) return "";
  const figures = items.map((it, i) => {
    const id = `${block.id}-${i + 1}`;
    const cap = it.caption ? `<figcaption>${i + 1} · ${escapeHtml(it.caption)}</figcaption>` : "";
    return `<figure id="${escapeHtml(id)}"><img src="${escapeHtml(it.src ?? "")}" ` +
      `alt="${escapeHtml(it.alt ?? it.caption ?? `Slide ${i + 1}`)}" loading="lazy">${cap}</figure>`;
  });
  const dots = items.map((_, i) =>
    `<a href="#${escapeHtml(`${block.id}-${i + 1}`)}" aria-label="Slide ${i + 1}"></a>`).join("");
  return `<div class="slides"><div class="track">${figures.join("")}</div>` +
    `<div class="dots">${dots}</div><div class="count">${items.length} slides</div></div>`;
}

const VIDEO_TYPES = { mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime" };

/** A clip takes the same figure as an image: native player, poster, caption. */
function video(block) {
  const it = /** @type {Record<string, string>} */ (block.data ?? {});
  if (!it.src) return "";
  const ext = /\.([a-z0-9]+)(?:[?#]|$)/i.exec(it.src)?.[1]?.toLowerCase() ?? "mp4";
  const poster = it.poster ? ` poster="${escapeHtml(it.poster)}"` : "";
  const cap = it.caption ? `<figcaption>${escapeHtml(it.caption)}</figcaption>` : "";
  return `<figure class="img"><video controls preload="metadata"${poster}>` +
    `<source src="${escapeHtml(it.src)}" type="${VIDEO_TYPES[ext] ?? "video/mp4"}"></video>${cap}</figure>`;
}

/** Footnotes as a numbered list at the end, each linking back to its reference. */
function footnotes(block) {
  const items = block.items ?? [];
  if (!items.length) return "";
  const rows = items.map((it, i) =>
    `<li id="fn-${i + 1}">${it.html}<a class="fn-back" href="#fnref-${i + 1}" aria-label="Back to reference">↩</a></li>`);
  return `<hr><ol class="footnotes">${rows.join("")}</ol>`;
}

/** A data fence body that may be one object or a list of them. */
function asArray(data) {
  if (Array.isArray(data)) return data.filter((x) => x && typeof x === "object");
  return data && typeof data === "object" ? [data] : [];
}
