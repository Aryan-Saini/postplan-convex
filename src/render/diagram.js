/**
 * Diagrams as inline SVG.
 *
 * Claude's documents render mermaid; Postplan cannot, because mermaid needs a
 * script at view time. These two layouts cover what mermaid is actually used for
 * in a spec — a left-to-right flow and a call sequence — and compute their own
 * geometry, so a diagram never has to be hand-positioned.
 *
 * @module render/diagram
 */

import { toneInk } from "./charts.js";

/** @typedef {import("./ir.js").FlowBlock} FlowBlock */
/** @typedef {import("./ir.js").SequenceBlock} SequenceBlock */

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const n = (v) => Math.round(v * 100) / 100;

// A marker id is document-global, so each diagram mints its own: two diagrams on
// one page must not share `url(#arw)`.
let markerSeq = 0;
const arrowDefs = (id) =>
  `<defs><marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">` +
  `<path d="M0,1 L9,5 L0,9 z" fill="#6f6f6a"/></marker></defs>`;

/**
 * Left-to-right flow. `cols` is an array of columns, each an array of
 * { id, label, shape?: 'box' | 'round' | 'diamond' | 'store', tone?: string }.
 * `edges` is [{ from, to, label? }]; ids must be unique across columns.
 */
export function flow(cols, edges, { title = "", note = "", colW = 168, rowH = 74, boxH = 42 } = {}) {
  const pos = new Map();
  const rows = Math.max(...cols.map((c) => c.length));
  const H = (rows - 1) * rowH + boxH + 24;
  const W = cols.length * colW - 32;
  const boxW = colW - 46;

  cols.forEach((col, ci) => {
    const offset = (rows - col.length) * rowH / 2;
    col.forEach((node, ri) => {
      pos.set(node.id, { x: ci * colW, y: offset + ri * rowH + 12, w: boxW, h: boxH, node });
    });
  });

  const arw = `arw${++markerSeq}`;
  let body = arrowDefs(arw);
  for (const e of edges) {
    const a = pos.get(e.from), b = pos.get(e.to);
    if (!a || !b) throw new Error(`flow edge ${e.from} -> ${e.to} names a node that does not exist`);
    const x1 = a.x + a.w, y1 = a.y + a.h / 2;
    const x2 = b.x, y2 = b.y + b.h / 2;
    const mx = (x1 + x2) / 2;
    const d = Math.abs(y1 - y2) < 1
      ? `M${n(x1)},${n(y1)} L${n(x2 - 4)},${n(y2)}`
      : `M${n(x1)},${n(y1)} C${n(mx)},${n(y1)} ${n(mx)},${n(y2)} ${n(x2 - 4)},${n(y2)}`;
    body += `<path d="${d}" fill="none" stroke="#3a3a37" stroke-width="1.5" marker-end="url(#${arw})"/>`;
    if (e.label) {
      body += `<text x="${n(mx)}" y="${n((y1 + y2) / 2 - 6)}" class="edge-label">${esc(e.label)}</text>`;
    }
  }
  for (const { x, y, w, h, node } of pos.values()) {
    // A node names a tone word, not a colour, and an absent one normalizes to "".
    const tone = toneInk(node.tone, "#2a2a27");
    if (node.shape === "diamond") {
      const cx = x + w / 2, cy = y + h / 2;
      body += `<path d="M${n(cx)},${n(y - 6)} L${n(x + w)},${n(cy)} L${n(cx)},${n(y + h + 6)} L${n(x)},${n(cy)} Z" ` +
        `fill="#0b0b0b" stroke="${tone}" stroke-width="1.5"/>`;
    } else if (node.shape === "store") {
      body += `<path d="M${n(x)},${n(y + 7)} a${n(w / 2)},7 0 0 1 ${n(w)},0 v${n(h - 14)} a${n(w / 2)},7 0 0 1 ${n(-w)},0 Z" ` +
        `fill="#0b0b0b" stroke="${tone}" stroke-width="1.5"/>`;
    } else {
      const r = node.shape === "round" ? h / 2 : 6;
      body += `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(r)}" ` +
        `fill="#0b0b0b" stroke="${tone}" stroke-width="1.5"/>`;
    }
    body += `<text x="${n(x + w / 2)}" y="${n(y + h / 2 + 4)}" class="node-label">${esc(node.label)}</text>`;
  }
  return figure(`<svg viewBox="-6 -4 ${W + 14} ${H + 8}" width="100%" class="chart diagram" role="img" aria-label="${esc(title || "flow diagram")}">${body}</svg>`, title, note);
}

/**
 * A call sequence. `actors` is a list of names; `msgs` is
 * [{ from, to, label, dashed?: true, note?: string }] in order.
 */
export function sequence(actors, msgs, { title = "", note = "" } = {}) {
  const laneW = Math.min(180, 680 / actors.length);
  const W = actors.length * laneW;
  const top = 34, step = 42;
  const H = top + msgs.length * step + 18;
  const xOf = (name) => actors.indexOf(name) * laneW + laneW / 2;

  const arw = `arw${++markerSeq}`;
  let body = arrowDefs(arw);
  for (const m of msgs) {
    for (const who of [m.from, m.to]) {
      if (!actors.includes(who)) throw new Error(`sequence message names an unknown actor: ${who}`);
    }
  }
  actors.forEach((a, i) => {
    const x = i * laneW + laneW / 2;
    body += `<rect x="${n(x - laneW / 2 + 10)}" y="4" width="${n(laneW - 20)}" height="24" rx="5" fill="#0b0b0b" stroke="#2a2a27" stroke-width="1.5"/>`;
    body += `<text x="${n(x)}" y="20" class="node-label">${esc(a)}</text>`;
    body += `<line x1="${n(x)}" y1="30" x2="${n(x)}" y2="${n(H - 8)}" stroke="#1e1e1c" stroke-width="1"/>`;
  });
  msgs.forEach((m, i) => {
    const y = top + i * step + 20;
    const x1 = xOf(m.from), x2 = xOf(m.to);
    const dir = x2 > x1 ? -4 : 4;
    body += `<line x1="${n(x1)}" y1="${n(y)}" x2="${n(x2 + dir)}" y2="${n(y)}" stroke="#3a3a37" stroke-width="1.5" ` +
      (m.dashed ? `stroke-dasharray="4 3" ` : "") + `marker-end="url(#${arw})"/>`;
    body += `<text x="${n((x1 + x2) / 2)}" y="${n(y - 8)}" class="edge-label">${esc(m.label)}</text>`;
  });
  return figure(`<svg viewBox="-6 -4 ${W + 12} ${H + 8}" width="100%" class="chart diagram" role="img" aria-label="${esc(title || "sequence diagram")}">${body}</svg>`, title, note);
}

function figure(svg, title, note) {
  return `<figure class="fig">` +
    (title ? `<figcaption class="fig-title">${esc(title)}</figcaption>` : "") +
    `<div class="fig-scroll">${svg}</div>` +
    (note ? `<div class="fig-note">${esc(note)}</div>` : "") + `</figure>`;
}

/**
 * Render one `flow` block.
 * @param {FlowBlock} block
 */
export function renderFlow(block) {
  const d = /** @type {any} */ (block?.data ?? {});
  return flow(d.cols ?? [], d.edges ?? [], {
    title: d.title ?? "",
    note: d.note ?? "",
    ...(d.colW ? { colW: d.colW } : {}),
    ...(d.rowH ? { rowH: d.rowH } : {}),
    ...(d.boxH ? { boxH: d.boxH } : {}),
  });
}

/**
 * Render one `sequence` block.
 * @param {SequenceBlock} block
 */
export function renderSequence(block) {
  const d = /** @type {any} */ (block?.data ?? {});
  return sequence(d.actors ?? [], d.msgs ?? [], { title: d.title ?? "", note: d.note ?? "" });
}

export { esc };
