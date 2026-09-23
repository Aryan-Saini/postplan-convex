import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parseMarkdown } from "../src/render/parse.js";
import { highlight, langKey, renderCode, renderDiff } from "../src/render/code.js";
import { render } from "../src/render/index.js";
import { validateHtml } from "../src/html-policy.js";

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

const ICON = (k) => `<svg class="code-icon" viewBox="0 0 16 16" aria-hidden="true"><use href="#icon-${k}"/></svg>`;

test("the header puts file left and icon+lang right, or icon+lang left alone", () => {
  assert.ok(renderCode({ type: "code", lang: "ts", file: "src/upload.ts", source: "const a = 1;" }).includes(
    `<span class="code-file">src/upload.ts</span><span class="code-tools"><span class="code-lang">${ICON("ts")}ts</span>`));
  // A normalized block carries `file: ""`, which must not hide the title.
  assert.match(renderCode({ type: "code", lang: "ts", file: "", title: "How it reads", source: "const a = 1;" }),
    /<span class="code-file">How it reads<\/span>/);
  assert.ok(renderCode({ type: "code", lang: "py", source: "x = 1" }).includes(
    `<div class="code-head"><span class="code-lang">${ICON("py")}py</span><span class="code-tools"><button`));
  // An unknown language gets the generic glyph; no language at all, just Copy.
  assert.ok(renderCode({ type: "code", lang: "txt", source: "x" }).includes(ICON("code")));
  assert.match(renderCode({ type: "code", lang: "", source: "plain" }),
    /<div class="code-head"><span class="code-tools"><button/);
});

test("every block carries a Copy button and its raw source in a template", () => {
  const html = renderCode({ type: "code", lang: "ts", lines: true, source: 'const a = "<b>&";\nf(a);' });
  assert.match(html, /<button type="button" class="copy" aria-label="Copy code" hidden>.*<span>Copy<\/span><\/button>/);
  // Escaped once, no highlighting and no line numbers.
  assert.ok(html.includes('<template class="src">const a = "&lt;b&gt;&amp;";\nf(a);</template>'));
  assert.match(renderDiff({ type: "diff", source: "+a\n-b" }), /<template class="src">\+a\n-b<\/template>/);
});

/** One fixture per language, each with the token classes the tokenizer should now find in it. */
const TOKENS = [
  ["ts", "const n: number = 1;\nfunction go(x: string) { return this.url.trim() + n; }\nconst re = /a+b/g;\nconst s = `id ${n}\\n`;",
    ["var", "fn", "prop", "this", "type", "regex", "esc", "str", "op", "punc", "num"]],
  ["tsx", "const App = () => <Card title=\"x\" onPick={go}>hi</Card>;\nconst el = <div className=\"a\" />;",
    ["var", "type", "attr", "str", "tag"]],
  ["js", "let total = sum(items.length); // done\nclass Cart {}\ntotal += LIMIT;",
    ["var", "fn", "prop", "com", "type", "const"]],
  ["jsx", "const x = <li key={id}>{name}</li>;", ["tag", "attr", "var"]],
  ["py", "@cached\ndef load(self):\n    total = f\"{self.n}\\n\"\n    return None", ["meta", "fn", "this", "var", "esc", "str", "const"]],
  ["sh", "export PATH=/usr/bin\nnpx postplan upload --description \"$HOME\" | grep -v x", ["kw", "var", "fn", "flag", "str", "op"]],
  ["json", '{"ok": true, "n": 1}', ["key", "kw", "num", "punc"]],
  ["yaml", "name: postplan # c\nlive: true", ["key", "com", "kw"]],
  ["html", '<p class="a">hi &amp; bye</p>', ["tag", "attr", "str", "esc", "punc"]],
  ["css", ".a:hover{color:#fff} #id{margin:4px} div{x:rgb(0,0,0)}", ["attr", "fn", "tag", "key", "num"]],
  ["sql", "SELECT count(*) FROM users WHERE name IS NULL -- c", ["kw", "fn", "const", "com"]],
  ["rust", "fn main() { let mut x: u8 = 1; println!(\"{}\", self.x); }", ["fn", "var", "type", "this", "prop"]],
  ["go", "func main() { x := 1; var y int = 2; fmt.Println(cfg.Port) }", ["fn", "var", "type", "prop"]],
  ["md", "# Title\n\n**bold** and `code`", ["kw", "type", "str"]],
  ["toml", '[server]\nport = 8080 # c\nname = "a"', ["tag", "key", "num", "com", "str"]],
];

for (const [lang, src, classes] of TOKENS) {
  test(`${lang} produces its token classes`, () => {
    const html = highlight(src, lang);
    for (const cls of classes) assert.match(html, new RegExp(`class="t-${cls}"`), `${lang} has no t-${cls}`);
  });
}

test("declarations, calls and properties get their own colours", () => {
  const html = highlight("const bytes = encode(html).length;\nif (bytes > 1) go();", "ts");
  assert.ok(html.includes('<span class="t-var">bytes</span> <span class="t-op">=</span> <span class="t-fn">encode</span>'));
  assert.ok(html.includes('<span class="t-prop">length</span>'));
  // A later reference to a declared name is still the variable colour; an undeclared one stays plain.
  assert.ok(html.includes('<span class="t-punc">(</span><span class="t-var">bytes</span>'));
  assert.ok(html.includes('<span class="t-punc">(</span>html<span class="t-punc">)</span>'));
  // Template holes are escape-delimited code, not string.
  assert.ok(highlight("`a ${b.c} d`", "js").includes(
    '<span class="t-str">`a </span><span class="t-esc">${</span>b<span class="t-punc">.</span><span class="t-prop">c</span><span class="t-esc">}</span>'));
  // Division is not a regex; a generic arrow is not JSX.
  assert.doesNotMatch(highlight("const d = a / b / c;", "ts"), /t-regex/);
  assert.doesNotMatch(highlight("const id = <T,>(v: T) => v;", "ts"), /t-tag|t-attr/);
});

test("the gallery renders one sprite, one script and a <use> per header, and passes the upload policy", () => {
  const { html, errors } = render(gallery, { file: "gallery.md" });
  assert.deepEqual(errors, []);
  const blocks = doc.blocks.filter((b) => b.type === "code" || b.type === "diff").length;
  assert.equal((html.match(/<svg class="sprite"/g) ?? []).length, 1);
  assert.equal((html.match(/<script>/g) ?? []).length, 1);
  assert.equal((html.match(/<use href="#icon-copy"\/>/g) ?? []).length, blocks);
  assert.equal((html.match(/<svg class="code-icon"[^>]*><use href="#icon-/g) ?? []).length, blocks);
  assert.equal((html.match(/<template class="src">/g) ?? []).length, blocks);
  // Every icon referenced is defined exactly once.
  for (const [, id] of html.matchAll(/<use href="#(icon-[\w-]+)"/g)) {
    assert.equal(html.split(`<symbol id="${id}"`).length - 1, 1, `${id} defined once`);
  }
  const policy = validateHtml(html);
  assert.equal(policy.ok, true, policy.errors.join("; "));
});

test("a document without code carries no script and no sprite", () => {
  const { html } = render("# Memo\n\nJust prose.\n", { file: "m.md" });
  assert.doesNotMatch(html, /<script|class="sprite"/);
});

test("a diff colours each line by its marker", () => {
  const block = doc.blocks.find((b) => b.type === "diff");
  assert.ok(block);
  const html = renderDiff(block);
  assert.match(html, /class="code has-head diff"/);
  assert.match(html, /<li class="d-hunk">@@/);
  assert.match(html, /<li class="d-add"><span class="d-sign">\+<\/span>/);
  assert.match(html, /<li class="d-del"><span class="d-sign">-<\/span>/);
  assert.match(html, /<li class="d-ctx"><span class="d-sign"> <\/span>/);
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
