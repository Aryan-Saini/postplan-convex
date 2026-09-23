import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parseMarkdown } from "../src/render/parse.js";
import { highlight, langKey, renderCode, renderDiff } from "../src/render/code.js";

const gallery = readFileSync(fileURLToPath(new URL("../examples/gallery.md", import.meta.url)), "utf8");
const { doc } = parseMarkdown(gallery, { file: "gallery.md" });

/**
 * One snippet per language the spec lists, each holding a keyword. The expected
 * class is `t-kw` everywhere: HTML's doctype and CSS's at-rules stand in for the
 * keyword list the other languages have.
 */
const LANGUAGES = [
  ["ts", "export const x: number = 1;", "export"],
  ["js", "const x = await fetch(url);", "const"],
  ["py", "def main():\n    return 1", "def"],
  ["sh", "export PATH=/usr/bin", "export"],
  ["sql", "select id from users where id = 1", "select"],
  ["rust", "pub fn main() { let x = 1; }", "pub"],
  ["go", "func main() { var x = 1 }", "func"],
  ["json", '{"ok": true, "n": 1}', "true"],
  ["yaml", "name: postplan\nlive: true", "true"],
  ["html", "<!DOCTYPE html>\n<p class=\"a\">hi</p>", "&lt;!DOCTYPE html&gt;"],
  ["css", "@media (min-width:600px){ .a{color:#fff} }", "@media"],
  ["md", "# Heading\n\n**bold** and [a link](https://example.com)", "# Heading"],
  ["toml", '[server]\nport = 8080\ndebug = true', "true"],
];

for (const [lang, src, keyword] of LANGUAGES) {
  test(`${lang} highlights its keywords`, () => {
    const html = highlight(src, lang);
    assert.match(html, /class="t-kw"/, `${lang} produced no t-kw`);
    assert.ok(html.includes(`<span class="t-kw">${keyword}</span>`), `${lang} did not mark "${keyword}"`);
    assert.doesNotMatch(html, /<script/);
  });
}

test("aliases resolve to the tokenizer key", () => {
  assert.equal(langKey("typescript"), "ts");
  assert.equal(langKey("markdown"), "md");
  assert.equal(langKey("Bash"), "sh");
  assert.equal(langKey("toml"), "toml");
  assert.match(highlight("# Heading", "markdown"), /class="t-kw"/);
});

test("an unknown language is escaped, not tokenized", () => {
  const html = highlight("<b>plain & text</b>", "brainfuck");
  assert.equal(html, "&lt;b&gt;plain &amp; text&lt;/b&gt;");
});

test("a numbered block tokenizes per line", () => {
  const block = doc.blocks.find((b) => b.type === "code" && b.lines);
  assert.ok(block, "gallery.md has no `lines` fence");
  const html = renderCode(block);
  assert.match(html, /<ol class="code-lines">/);
  // One <li> per source line, blanks included.
  const source = block.source.replace(/^\n/, "").replace(/\s+$/, "");
  assert.equal(html.match(/<li>/g).length, source.split("\n").length);
  assert.match(html, /<li>&nbsp;<\/li>/);
  assert.match(html, /class="t-kw">export<\/span>/);
});

test("a multiline string is not cut in half by line numbering", () => {
  const html = renderCode({
    type: "code", lang: "py", lines: true,
    source: 'x = """one\ntwo"""\n',
  });
  // Each line closes its own span, so no `<span>` leaks across the <li> boundary.
  assert.equal((html.match(/<span/g) ?? []).length, (html.match(/<\/span>/g) ?? []).length);
  assert.match(html, /<li>.*two.*<\/li>/);
});

test("the header shows file, then lang, then title", () => {
  assert.match(renderCode({ type: "code", lang: "ts", file: "src/upload.ts", source: "const a = 1;" }),
    /<span class="code-file">src\/upload\.ts<\/span><span class="code-lang">ts<\/span>/);
  assert.match(renderCode({ type: "code", lang: "ts", title: "How it reads", source: "const a = 1;" }),
    /<span class="code-file">How it reads<\/span>/);
  // No file and no title: the language alone is the header.
  assert.match(renderCode({ type: "code", lang: "ts", source: "const a = 1;" }),
    /<span class="code-file">ts<\/span>/);
  assert.doesNotMatch(renderCode({ type: "code", lang: "", source: "plain" }), /code-head/);
});

test("a diff colours each line by its marker", () => {
  const block = doc.blocks.find((b) => b.type === "diff");
  assert.ok(block);
  const html = renderDiff(block);
  assert.match(html, /class="code has-head diff"/);
  assert.match(html, /<li class="d-hunk">@@/);
  assert.match(html, /<li class="d-add">\+/);
  assert.match(html, /<li class="d-del">-/);
  assert.match(html, /<li class="d-ctx">/);
  assert.match(html, /<span class="code-file">Add a CSP to served drafts<\/span>/);
  assert.doesNotMatch(html, /<script/);
});

test("source is escaped before it is tokenized", () => {
  const html = renderCode({ type: "code", lang: "js", source: 'const a = "<script>alert(1)</script>";' });
  assert.doesNotMatch(html, /<script/);
  assert.match(html, /&lt;script&gt;/);
});

test("renderers never throw on a block with nothing in it", () => {
  assert.doesNotThrow(() => renderCode({ type: "code" }));
  assert.doesNotThrow(() => renderDiff({ type: "diff" }));
});
