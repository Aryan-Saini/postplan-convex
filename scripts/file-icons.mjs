/**
 * Regenerates `src/render/file-icons.js`, the file-type glyphs a `file` fence
 * card and the /s/ send page draw.
 *
 *     pnpm install && node scripts/file-icons.mjs
 *
 * The three icon packages are devDependencies: their SVGs are read here, cleaned
 * (no ids, widths, classes or comments; numbers rounded; viewBox kept) and
 * written out as plain strings, so nothing ships at runtime. Programming
 * languages and config formats are not here: they reuse the code-block icons
 * in `code.js`.
 *
 * Sources and licences:
 *   material-icon-theme  MIT   document, design, key and notebook types
 *   lucide-static        ISC   generic monoline shapes (file, image, archive, …)
 *   simple-icons         CC0   platform marks (Android, App Store, Apple, Red Hat, …)
 *
 * The Debian swirl is left out: it is 2 KB even rounded, so .deb takes the
 * generic package glyph.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Read straight from node_modules: simple-icons' exports map hides its files from require.resolve.
const read = (name, file) => readFileSync(new URL(`../node_modules/${name}/${file}`, import.meta.url), "utf8");

/** Round every decimal in path data or attributes to `places`, dropping leading zeros. */
const round = (s, places) =>
  s.replace(/-?\d*\.\d+/g, (n, at, all) => {
    const r = Number(Number(n).toFixed(places));
    const out = String(r === 0 ? 0 : r).replace(/^(-?)0\./, "$1.");
    // A dropped minus or leading point was also a separator: "1.9-.01" must not become
    // "1.90", nor "1.0.5" become "1.5".
    const lead = /\d/.test(out[0]) && /[\d.]/.test(all[at - 1] ?? "") ? " " : "";
    const trail = !out.includes(".") && all[at + n.length] === "." ? " " : "";
    return lead + out + trail;
  });

const clean = (s) =>
  s.replace(/<!--[\s\S]*?-->/g, "").replace(/<title>[\s\S]*?<\/title>/g, "")
    .replace(/\s*\/>/g, "/>").replace(/>\s+</g, "><").replace(/\s+/g, " ").trim();

const svgParts = (src) => {
  const m = /<svg\b([^>]*)>([\s\S]*)<\/svg>/.exec(src);
  if (!m) throw new Error("not an svg");
  return { viewBox: /viewBox="([^"]+)"/.exec(m[1])[1], inner: clean(m[2]) };
};

/** A material-icon-theme file icon, optionally recoloured to the type's conventional hex. */
function material(name, recolor) {
  let { viewBox, inner } = svgParts(read("material-icon-theme", `icons/${name}.svg`));
  inner = inner
    .replace(/<path d="M0 0h(\d+)v\1H0z"\/>/, "") // an unfilled bounding box that would paint black
    .replace(/ style="isolation:isolate"/g, "");
  if (recolor) inner = inner.replace(/fill="#[0-9a-f]{3,6}"/gi, `fill="${recolor}"`);
  return { src: `material-icon-theme ${name}`, viewBox, body: round(inner, 2) };
}

/** A lucide monoline icon, stroked in `color` (white by default, via currentColor). */
function lucide(name, color = "currentColor") {
  const { viewBox, inner } = svgParts(read("lucide-static", `icons/${name}.svg`));
  const body = `<g fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`;
  return { src: `lucide ${name}`, viewBox, body: round(body, 2) };
}

/** A simple-icons mark filled with `hex`. Long paths are rounded harder to stay near 1 KB. */
function simple(name, hex) {
  const { viewBox, inner } = svgParts(read("simple-icons", `icons/${name}.svg`));
  const d = /d="([^"]+)"/.exec(inner)[1];
  const tight = d.length > 900 ? 1 : 2;
  return { src: `simple-icons ${name}`, viewBox, body: `<path fill="${hex}" d="${round(d, tight)}"/>`, d: round(d, tight) };
}

const appstore = simple("appstore", "#fff");

/** Icon key -> glyph. Keys are namespaced `ft-` so they never collide with a language icon. */
const ICONS = {
  // documents
  "ft-pdf": material("pdf", "#e5252a"),
  "ft-word": material("word", "#2b579a"),
  "ft-slides": material("powerpoint", "#d24726"),
  "ft-excel": material("table", "#1d6f42"),
  "ft-epub": material("epub"),
  // design
  "ft-figma": material("figma"),
  "ft-sketch": material("sketch"),
  "ft-psd": material("adobe-photoshop"),
  "ft-ai": material("adobe-illustrator"),
  // keys and certificates
  "ft-key": material("key"),
  "ft-cert": material("certificate"),
  // data
  "ft-jupyter": material("jupyter"),
  "ft-jar": material("jar"),
  // generic shapes
  "ft-file": lucide("file"),
  "ft-image": lucide("file-image"),
  "ft-video": lucide("file-video-camera"),
  "ft-audio": lucide("file-music"),
  "ft-archive": lucide("file-archive"),
  "ft-sheet": lucide("file-spreadsheet", "#1d6f42"),
  "ft-font": lucide("a-large-small"),
  "ft-db": lucide("database"),
  "ft-window": lucide("app-window"),
  "ft-package": lucide("package"),
  // platform marks
  "ft-android": simple("android", "#3ddc84"),
  // The App Store tile: the mark in white on a rounded #0d84ff square.
  "ft-ipa": {
    src: "simple-icons appstore",
    viewBox: "0 0 24 24",
    body: `<rect width="24" height="24" rx="5.4" fill="#0d84ff"/><path fill="#fff" transform="translate(4.8 4.8) scale(.6)" d="${appstore.d}"/>`,
  },
  "ft-apple": simple("apple", "#fff"),
  "ft-redhat": simple("redhat", "#ee0000"),
  "ft-snap": simple("snapcraft", "#e95420"),
  "ft-appimage": simple("appimage", "#739fb9"),
  "ft-pypi": simple("pypi", "#3775a9"),
  "ft-gem": simple("rubygems", "#e9573f"),
  "ft-parquet": simple("apacheparquet", "#50abf1"),
};

const version = (name) => JSON.parse(read(name, "package.json")).version;
const lines = Object.entries(ICONS).map(([key, { src, viewBox, body }]) =>
  `  // ${src}\n  ${JSON.stringify(key)}: [${JSON.stringify(viewBox)}, ${JSON.stringify(body)}],`);

const out = `/**
 * File-type glyphs for \`file\` fence cards and the /s/ send page.
 *
 * GENERATED by scripts/file-icons.mjs; do not edit by hand. Each entry is
 * [viewBox, symbol body], drawn from:
 *   material-icon-theme ${version("material-icon-theme")} (MIT, Copyright (c) 2025 Material Extensions)
 *   lucide-static ${version("lucide-static")} (ISC, Copyright (c) Lucide Contributors)
 *   simple-icons ${version("simple-icons")} (CC0 1.0)
 * Brand marks are trademarks of their owners and are used to identify file types.
 *
 * @module render/file-icons
 */

/** @type {Record<string, [viewBox: string, body: string]>} */
export const FILE_ICONS = {
${lines.join("\n")}
};
`;

const target = fileURLToPath(new URL("../src/render/file-icons.js", import.meta.url));
writeFileSync(target, out);
for (const [key, { body }] of Object.entries(ICONS)) {
  if (body.length > 1100) console.warn(`${key}: ${body.length} bytes`);
}
console.log(`wrote ${Object.keys(ICONS).length} icons to ${target}`);
