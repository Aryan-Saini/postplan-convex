/**
 * The document shell: tokens, type scale and every component's CSS, plus the
 * wrapper that turns a body string into a complete HTML file.
 *
 * @module render/shell
 */
//
// One <style> block, no external stylesheet, no webfont. The type scale copies
// Claude's document renderer, measured off a PDF export: a ~700px column, body
// at 17px on a 25px line, list pitch 28px, serif headings at regular weight
// (h1 34, h2 24, h3 19.5), filled byline chips, fully gridded tables. Anthropic
// Serif / Sans / Mono are not shippable, so each gets the nearest system stack.
// The page plane stays true black; chart colours are the validated dark palette.

export const CSS = `
:root{
  --bg:#000;                 /* page plane: Aryan's true black (the system's is #0d0d0d) */
  --surface:#1a1a19;         /* chart / code surface, from the palette's dark surface */
  --surface-2:#232321;
  --line:#2c2c2a;            /* gridline hairline */
  --line-strong:#383835;     /* baseline / axis / table rule */
  /* No grey text. Every glyph in the document is white and hierarchy is carried
     by size and weight: metadata at 12-14px regular, body at 17px, labels at
     600. Hairlines, panels, dots and the chart palette keep their own colour,
     and so do the syntax-highlight tokens, which are not grey. */
  --ink:#fff;                /* every glyph */
  --mark:#898781;            /* dots and other non-text marks, never a glyph */
  --grid:#2c2c2a;
  --axis:#383835;
  --s1:#3987e5; --s2:#d95926; --s3:#199e70; --s4:#c98500;
  --s5:#d55181; --s6:#008300; --s7:#9085e9; --s8:#e66767;
  --good:#0ca30c; --warn:#fab219; --serious:#ec835a; --critical:#d03b3b;
  --serif:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,"Times New Roman",serif;
  --sans:system-ui,-apple-system,"Segoe UI",Inter,Roboto,sans-serif;
  --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.5 var(--sans);
  font-feature-settings:"kern" 1}
.wrap{max-width:744px;margin:0 auto;padding:56px 22px 96px}
/* A grid track of minmax(0,1fr) stops a wide table, code block or chart from
   propagating its intrinsic width up and giving the whole page a sideways scroll. */
main{display:grid;grid-template-columns:minmax(0,1fr)}
main > *{min-width:0}

/* ---- headings: serif, regular weight, like the renderer ---- */
h1,h2,h3{font-family:var(--serif);font-weight:400;color:var(--ink);letter-spacing:-.005em}
h1{font-size:46px;line-height:1.12;margin:0 0 30px;letter-spacing:-.01em}
h2{font-size:24px;line-height:1.25;margin:44px 0 12px;scroll-margin-top:16px}
h3{font-size:19.5px;line-height:1.3;margin:30px 0 8px}
h4{font:600 17px/1.4 var(--sans);color:var(--ink);margin:24px 0 6px}
h2 + p,h3 + p,h4 + p{margin-top:0}

/* ---- byline ---- */
.byline{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;margin:0 0 28px;font-size:15.5px}
.chip{display:inline-flex;align-items:center;gap:7px;padding:4px 12px;border-radius:999px;
  background:#262624;color:var(--ink);white-space:nowrap;line-height:1.4}
.chip svg{width:14px;height:14px;flex:none;stroke:var(--ink);fill:none;stroke-width:1.6}
.chip .dot{width:6px;height:6px;border-radius:50%;background:var(--mark)}
.chip.good .dot{background:var(--good)} .chip.warn .dot{background:var(--warn)}
.chip.critical .dot{background:var(--critical)}
.byline .sep{color:var(--ink)}
.lead{color:var(--ink);margin:0 0 20px}
.contents{display:flex;flex-wrap:wrap;gap:4px 16px;font-size:14px;margin:0 0 8px;padding:10px 0;
  border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.contents a{color:var(--ink);border:0}
.contents a:hover{text-decoration:underline}

/* ---- prose ---- */
p{margin:0 0 14px}
strong{color:var(--ink);font-weight:600}
a{color:#5c9cf0;text-decoration:underline;text-decoration-color:rgba(92,156,240,.45);text-underline-offset:3px}
a:hover{text-decoration-color:#5c9cf0}
ul,ol{margin:0 0 14px;padding-left:26px}
li{margin:4px 0}
li > ul,li > ol{margin:4px 0 0}
/* a loose list wraps each item in a <p>; keep the item's own rhythm, not the body's */
li > p{margin:0 0 6px}
li > p:last-child{margin-bottom:0}
li::marker{color:var(--ink)}
/* the renderer's nesting: 1 → a → i, and disc → circle → square */
ol{list-style:decimal} ol ol{list-style:lower-alpha} ol ol ol{list-style:lower-roman}
ul{list-style:disc} ul ul{list-style:circle} ul ul ul{list-style:square}
.center{text-align:center}
.right{text-align:right}
.subtext{font-size:15px;color:var(--ink);margin:0 0 14px}
.subtext p{margin:0 0 6px}
.subtext p:last-child{margin-bottom:0}
/* auto-fit collapses the group to one column on a phone, keeping source order */
.columns{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px 24px;margin:0 0 14px}
.columns > p{margin:0}
/* CommonMark runs a plain bullet list and a task list written back to back into
   one list, so the checkbox item styles itself rather than relying on the parent. */
ul.tasks{list-style:none;padding-left:26px}
ul.tasks > li{list-style:disc}
ul.tasks > li:has(> .box){display:flex;gap:10px;align-items:baseline;list-style:none;margin-left:-26px}
ul.tasks li p{margin:0}
ul.tasks .box{flex:none;width:15px;height:15px;border-radius:3px;border:1px solid var(--line-strong);
  background:var(--surface-2);position:relative;top:2px}
ul.tasks li.done .box{background:#3a3a37;border-color:#3a3a37}
ul.tasks li.done .box::after{content:"";position:absolute;left:4.5px;top:1.5px;width:4px;height:8px;
  border:solid #cfcfc8;border-width:0 2px 2px 0;transform:rotate(45deg)}
ul.tasks li.done span{color:var(--ink);text-decoration:line-through}
hr{border:0;border-top:1px solid var(--line-strong);margin:26px 0}
blockquote{margin:0 0 14px;padding:4px 0 4px 18px;border-left:3px solid var(--line-strong);color:var(--ink)}
code{font:.9em/1.5 var(--mono);background:var(--surface);border-radius:4px;padding:2px 6px;color:var(--ink)}
kbd{font:.85em var(--mono);background:var(--surface-2);border:1px solid var(--line-strong);
  border-bottom-width:2px;border-radius:4px;padding:1px 6px;color:var(--ink)}
.small{font-size:15px;color:var(--ink)}

/* ---- callouts ---- */
.note{display:grid;grid-template-columns:82px minmax(0,1fr);gap:12px;align-items:start;
  border-left:3px solid #4a4a46;padding:4px 0 4px 16px;margin:0 0 16px}
.note .tag{font-size:12px;letter-spacing:.07em;text-transform:uppercase;color:var(--ink);
  padding-top:5px;white-space:nowrap}
.note p{margin:0}
.note.good{border-left-color:var(--good)} .note.good .tag{color:var(--good)}
.note.warn{border-left-color:var(--warn)} .note.warn .tag{color:var(--warn)}
.note.critical{border-left-color:var(--critical)} .note.critical .tag{color:var(--critical)}

/* ---- stat tiles ---- */
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(168px,1fr));gap:1px;
  background:var(--line);border:1px solid var(--line);border-radius:6px;overflow:hidden;margin:0 0 22px}
.stat{background:var(--bg);padding:14px 16px 13px}
.stat .k{font-size:13.5px;color:var(--ink);margin-bottom:6px}
.stat .v{font-size:28px;line-height:1.1;font-weight:600;color:var(--ink);letter-spacing:-.02em}
.stat .d{font-size:13.5px;margin-top:6px;color:var(--ink)}
.stat .d b{font-weight:600}
.stat .d .up{color:var(--good)} .stat .d .down{color:var(--critical)}
.stat .spark{margin-top:10px;display:block}

/* ---- tables: fully gridded, header band, like the renderer ---- */
.tbl-wrap{overflow-x:auto;margin:0 0 20px;-webkit-overflow-scrolling:touch}
table{border-collapse:collapse;font-size:15.5px;min-width:min(100%,440px)}
th,td{border:1px solid var(--line-strong);padding:9px 14px;text-align:left;vertical-align:middle}
th{font-weight:400;color:var(--ink);background:var(--surface)}
td{color:var(--ink)}
.num{text-align:right;font-variant-numeric:tabular-nums}
.t-good{color:var(--good)} .t-bad{color:#e66767} .t-warn{color:var(--warn)}
.t-flat{color:var(--ink)}
table.full{width:100%}

/* ---- figures & charts: centred title, note and caption below ---- */
.fig{margin:0 0 28px;max-width:100%}
.fig-title{font:600 15px/1.4 var(--sans);color:var(--ink);text-align:center;margin:0 0 6px}
.fig-note{font-size:14px;color:var(--ink);margin-top:6px}
.fig-cap{font-size:14px;color:var(--ink);margin-top:8px}
svg.chart{display:block;overflow:visible;min-width:520px}
.fig-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
.chart .grid{stroke:var(--grid);stroke-width:1}
.chart .axis{stroke:var(--axis);stroke-width:1}
.chart .tick{fill:var(--ink);font:12px var(--sans);font-variant-numeric:tabular-nums}
.chart .tick-y{text-anchor:end} .chart .tick-x{text-anchor:middle}
.chart .val{fill:var(--ink);font:12px var(--sans);text-anchor:middle;font-variant-numeric:tabular-nums}
.chart .val-left{text-anchor:start}
.chart .cell-val{font:11px var(--sans);text-anchor:middle;font-variant-numeric:tabular-nums}
.chart .node-label{fill:var(--ink);font:13px var(--sans);text-anchor:middle}
.chart .edge-label{fill:var(--ink);font:11.5px var(--sans);text-anchor:middle}
.legend{display:flex;flex-wrap:wrap;gap:16px;margin:2px 0 10px;font-size:13.5px;color:var(--ink)}
.pctn{color:var(--ink);font-variant-numeric:tabular-nums}
.key{display:inline-flex;align-items:center;gap:7px}
.swatch{width:10px;height:10px;border-radius:2px;display:inline-block}
.key .stroke{width:14px;height:2px;border-radius:1px;display:inline-block}
.spark{vertical-align:middle}

/* ---- images and video ---- */
.img{margin:0 0 28px}
.img img,.img video{display:block;width:100%;height:auto;border-radius:8px;border:1px solid var(--line)}
.img.plain img{border:0;border-radius:0}
.img.narrow{max-width:420px}
.pair{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin:0 0 8px}
.pair figure{margin:0}
.pair .lbl{font-size:12.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--ink);margin:0 0 6px}
.img figcaption{font-size:14px;color:var(--ink);margin-top:8px}

/* ---- lightbox: :target, no script. A thumbnail links to #id; the overlay links back to #_ ---- */
.img a.zoom{display:block;cursor:zoom-in}
.lightbox{display:none;position:fixed;inset:0;z-index:10;background:rgba(0,0,0,.94);padding:24px}
.lightbox:target{display:grid;place-items:center}
.lightbox a{display:grid;place-items:center;width:100%;height:100%;cursor:zoom-out;text-decoration:none}
.lightbox img{max-width:100%;max-height:92vh;width:auto;height:auto;border-radius:6px}
.lightbox .cap{position:fixed;left:0;right:0;bottom:16px;text-align:center;font-size:14px;color:var(--ink)}

/* ---- slideshow: scroll-snap, dots are anchors ---- */
.slides{margin:0 0 8px}
.slides .track{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;gap:12px;scroll-behavior:smooth;
  scrollbar-width:none;-webkit-overflow-scrolling:touch}
.slides .track::-webkit-scrollbar{display:none}
.slides .track > figure{flex:0 0 100%;scroll-snap-align:start;margin:0;scroll-margin:0}
.slides .track img{display:block;width:100%;height:auto;border-radius:8px;border:1px solid var(--line)}
.slides .track figcaption{font-size:14px;color:var(--ink);margin-top:8px}
.slides .dots{display:flex;gap:8px;justify-content:center;margin:10px 0 0}
.slides .dots a{width:8px;height:8px;border-radius:50%;background:#3a3a37;display:block}
.slides .dots a:hover{background:var(--mark)}
.slides .count{font-size:13px;color:var(--ink);text-align:center;margin-top:6px}

/* ---- hero stat, the renderer's centred stat widget ---- */
.hero{ text-align:center;margin:8px 0 28px}
.hero .k{font:600 15px/1.4 var(--sans);color:var(--ink)}
.hero .v{font-size:34px;line-height:1.15;font-weight:600;color:var(--ink);letter-spacing:-.02em;margin-top:2px}
.hero .as{font-size:13.5px;color:var(--ink);margin-top:2px}
.hero .d{font-size:13.5px;color:var(--ink)}
.hero .d b{font-weight:600}
.hero .d .up{color:var(--good)} .hero .d .down{color:var(--critical)}
.heroes{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}

/* ---- meters ---- */
.meter{margin:0 0 12px;max-width:420px}
.meter-head{display:flex;justify-content:space-between;font-size:13.5px;color:var(--ink);margin-bottom:5px}
.meter-track{height:6px;border-radius:3px;background:var(--surface-2);overflow:hidden}
.meter-fill{height:100%;border-radius:3px}

/* ---- code ---- */
.code{border-radius:8px;background:var(--surface);margin:0 0 20px;overflow:hidden;border:1px solid var(--line)}
.code-head{display:flex;justify-content:space-between;align-items:center;padding:8px 16px;
  border-bottom:1px solid var(--line);background:var(--surface-2)}
.code-file{font:13px var(--mono);color:var(--ink)}
.code-lang{font-size:11.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--ink)}
.code pre{margin:0;padding:16px 0 16px 18px;overflow-x:auto;font:14.5px/1.6 var(--mono);color:#e4e4dd}
.code pre > code{display:block;padding-right:18px}
.code code{background:0;border:0;padding:0;font-size:inherit;color:inherit;border-radius:0}
.code-lines{margin:0;padding:0;list-style:none;counter-reset:l;min-width:max-content}
.code-lines li{counter-increment:l;white-space:pre;position:relative;padding-left:36px;padding-right:18px;
  margin:0;display:block}
.code-lines li::before{content:counter(l);position:absolute;left:0;width:22px;text-align:right;
  color:var(--ink);font-size:.85em;font-variant-numeric:tabular-nums}
.t-kw{color:#c792ea} .t-str{color:#9ccc7c} .t-num{color:#f2a15c} .t-com{color:#6a6a63;font-style:italic}
.t-fn{color:#82aaff} .t-type{color:#7fd6c1} .t-key{color:#82aaff} .t-op{color:#b0b0a8}
.t-punc{color:#8f8f88} .t-tag{color:#e66767} .t-attr{color:#c98500} .t-meta{color:#d55181}
.d-add{color:#9ccc7c;background:rgba(12,163,12,.12)}
.d-del{color:#e88d8d;background:rgba(208,59,59,.12)}
.d-hunk{color:var(--ink)}
.d-ctx{color:var(--ink)}

/* ---- timeline ---- */
.timeline{list-style:none;margin:0 0 20px;padding:0 0 0 20px;border-left:1px solid var(--line-strong)}
.timeline li{position:relative;padding:0 0 18px 6px}
.timeline li::before{content:"";position:absolute;left:-25px;top:8px;width:8px;height:8px;border-radius:50%;
  background:var(--mark);box-shadow:0 0 0 3px var(--bg)}
.timeline li.done::before{background:var(--good)}
.timeline li.now::before{background:var(--s1)}
.timeline .when{font-size:13px;color:var(--ink);font-variant-numeric:tabular-nums}
.timeline .what{color:var(--ink)}
.timeline p{margin:2px 0 0;font-size:15px;color:var(--ink)}

/* ---- key/value spec list ---- */
dl.spec{display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px 20px;margin:0 0 20px;font-size:15.5px}
dl.spec dt{color:var(--ink)}
dl.spec dd{margin:0}

/* ---- collapsible ---- */
details{border-top:1px solid var(--line);padding:12px 0}
details:last-of-type{border-bottom:1px solid var(--line)}
summary{cursor:pointer;color:var(--ink);list-style:none;display:flex;gap:10px;align-items:center}
summary::-webkit-details-marker{display:none}
summary::before{content:"+";color:var(--ink);font:15px var(--mono)}
details[open] summary::before{content:"\\2212"}
details > *:not(summary){margin-top:10px}

/* ---- math ---- */
math{font-size:19px;color:var(--ink)}
.math-block{margin:0 0 20px;padding:12px 0;text-align:center}

/* ---- comparison grid for mocks ---- */
.mocks{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin:0 0 20px}
.mock{border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--surface)}
.mock .mock-head{padding:6px 12px;border-bottom:1px solid var(--line);font-size:12px;
  letter-spacing:.07em;text-transform:uppercase;color:var(--ink)}
.mock .mock-body{padding:14px}
/* the html fence's own idiom: a big number and a label/value row, no inline styles */
.mock-big{font-size:22px;font-weight:600;color:var(--ink);letter-spacing:-.02em}
.mock-row{display:flex;justify-content:space-between;align-items:baseline;margin-top:6px}
.mock-row:first-child{margin-top:0}

/* ---- footnotes ---- */
sup.fn{font-size:.72em;line-height:0}
sup.fn a{text-decoration:none;color:#5c9cf0}
ol.footnotes{font-size:14.5px;color:var(--ink);margin:8px 0 0;padding-left:22px}
ol.footnotes li{margin:5px 0}
ol.footnotes a.fn-back{text-decoration:none;color:var(--ink);margin-left:4px}
ol.footnotes a.fn-back:hover{color:var(--ink)}

/* ---- sources ---- */
.sources{font-size:14.5px;color:var(--ink);padding-left:20px}
.sources li{margin:4px 0}
.sources a,.sources code{color:var(--ink)}

@media (max-width:520px){
  body{font-size:16px}
  h1{font-size:34px} h2{font-size:22px}
  .wrap{padding:36px 18px 72px}
}
@media print{
  body{background:#fff;color:#000}
  .contents{display:none}
}
`;

const escText = (v) =>
  String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/**
 * Wrap body HTML in a complete, self-contained document: one <style>, no
 * external stylesheet, no webfont, no script.
 *
 * @param {{ title: string, body: string, generator?: string }} opts
 *   `generator` is stamped as `<meta name="generator">` so a reader (and
 *   `postplan upload`) can tell a rendered document from a hand-written one.
 * @returns {string}
 */
export function page({ title, body, generator }) {
  const t = escText(title);
  const stamp = generator ? `\n<meta name="generator" content="${escText(generator)}">` : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">${stamp}
<title>${t}</title>
<style>${CSS}</style>
</head>
<body>
${body}
</body>
</html>`;
}
