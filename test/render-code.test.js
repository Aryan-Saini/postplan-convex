import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parseMarkdown } from "../src/render/parse.js";
import { highlight, iconKey, langKey, renderCode, renderDiff } from "../src/render/code.js";
import { filePath } from "../src/render/blocks.js";
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
  ["erlang", "-module(upload).\n-export([start/1]).\nstart(Name) -> receive {ok, Name} -> ok end. % done", "receive"],
  ["ex", "defmodule Upload do\n  def run(x), do: {:ok, x} # c\nend", "defmodule"],
  ["rb", "def upload(path)\n  @size = File.size(path) # c\nend", "def"],
  ["java", "public final class Upload { private int size; }", "public"],
  ["kt", "fun upload(path: String): Int { val n = 1; return n }", "fun"],
  ["swift", "func upload(_ path: String) -> Int { let n = 1; return n }", "func"],
  ["c", "#include <stdio.h>\nint main(void) { return 0; }", "return"],
  ["cpp", "namespace pp { template <typename T> class Box {}; }", "namespace"],
  ["h", "static const int MAX = 512;", "static"],
  ["cs", "public sealed class Upload { public string Path { get; init; } }", "sealed"],
  ["php", "<?php\nfunction upload($path) { return $path; }", "function"],
  ["dockerfile", "FROM node:20 AS build\nRUN pnpm install --frozen-lockfile", "FROM"],
  ["makefile", "CC := gcc\nifdef DEBUG\nbuild: main.c\n\t$(CC) -o app $<\nendif", "ifdef"],
  ["env", "# local\nexport API_URL=https://example.com\nMAX_BYTES=524288", "export"],
  ["ini", "[server]\nport = 8080\ndebug = true ; c", "true"],
  ["graphql", "query Draft($id: ID!) { draft(id: $id) { title } }", "query"],
  ["proto", 'syntax = "proto3";\nmessage Draft { string id = 1; }', "message"],
  ["xml", '<?xml version="1.0"?>\n<!DOCTYPE note>\n<note to="a"/>', "&lt;!DOCTYPE note&gt;"],
  ["svelte", "{#if user}<p>{user.name}</p>{/if}", "{#if"],
  ["vue", '<template><p v-if="ok">{{ msg }}</p></template>', "v-if"],
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
  assert.equal(langKey("erl"), "erlang");
  assert.equal(langKey("exs"), "elixir");
  assert.equal(langKey("kt"), "kotlin");
  assert.equal(langKey("txt"), "text");
  assert.match(highlight("# Heading", "markdown"), /class="t-kw"/);
});

/** Every language added in the file-header pass has its own glyph, except `proto`, which has no mark to draw. */
const ICON_OF = {
  erlang: "erlang", erl: "erlang", ex: "elixir", exs: "elixir", rb: "ruby", java: "java", kt: "kotlin",
  swift: "swift", c: "c", h: "c", cpp: "cpp", cs: "cs", php: "php", dockerfile: "dockerfile", makefile: "makefile",
  env: "env", ini: "ini", graphql: "graphql", proto: "code", xml: "xml", svelte: "svelte", vue: "vue", text: "text", txt: "text",
};

test("each new language renders its icon <use> and the sprite defines it", () => {
  for (const [lang, icon] of Object.entries(ICON_OF)) {
    assert.equal(iconKey(lang), icon, lang);
    const { html } = render(`# T\n\n\`\`\`${lang}\nx\n\`\`\`\n`, { file: "t.md" });
    assert.ok(html.includes(`<svg class="code-icon" viewBox="0 0 16 16" aria-hidden="true"><use href="#icon-${icon}"/></svg>`), lang);
    assert.ok(html.includes(`<symbol id="icon-${icon}"`), `${lang} symbol`);
  }
});

test("Erlang: attributes and keywords, Capitalised variables, atoms, % comments", () => {
  const html = highlight("-module(upload).\nstart(Name) -> io:format(\"~p\", [Name]), ok. % go", "erl");
  assert.ok(html.includes('<span class="t-kw">-module</span>'));
  assert.ok(html.includes('<span class="t-var">Name</span>'));
  assert.ok(html.includes('<span class="t-const">ok</span>'));
  assert.ok(html.includes('<span class="t-fn">format</span>'));
  assert.ok(html.includes('<span class="t-com">% go</span>'));
});

test("text blocks are not highlighted and read in plain white", () => {
  const html = renderCode({ type: "code", lang: "text", source: "const x = 1" });
  assert.match(html, /class="code has-head plain"/);
  assert.ok(html.includes("<code>const x = 1</code>"));
});

test("an unknown language is escaped, not tokenized", () => {
  const html = highlight("<b>plain & text</b>", "brainfuck");
  assert.equal(html, "&lt;b&gt;plain &amp; text&lt;/b&gt;");
});

test("a numbered block tokenizes per line", () => {
  const block = doc.blocks.find((b) => b.type === "code" && b.range);
  assert.ok(block, "gallery.md has no `range=` fence");
  const html = renderCode(block);
  assert.match(html, /<ol class="code-lines"[^>]*>/);
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

const FILE_ICON = `<svg class="file-icon" viewBox="0 0 16 16" aria-hidden="true"><use href="#icon-file"/></svg>`;
const PATH = (p, dir, name) => `<button type="button" class="code-path" data-path="${p}" title="Copy path">${FILE_ICON}` +
  `<span class="p-text"><span class="p-dir">${dir}</span><span class="p-name">${name}</span></span></button>`;

test("a file header leads with the path; icon+lang move right, before Copy", () => {
  const html = renderCode({ type: "code", lang: "ts", file: "src/upload.ts", source: "const a = 1;" });
  assert.ok(html.includes(`<div class="code-head"><span class="code-name">${PATH("src/upload.ts", "src/", "upload.ts")}</span>` +
    `<span class="code-tools"><span class="code-lang">${ICON("ts")}ts</span><button type="button" class="copy"`));
  // No line numbers unless asked for.
  assert.doesNotMatch(html, /code-lines/);
});

test("path= is an alias for file=", () => {
  const { doc: d } = parseMarkdown("# T\n\n```ts path=convex/http.ts\nx\n```\n", { file: "t.md" });
  assert.equal(d.blocks[0].file, "convex/http.ts");
  assert.ok(renderCode(d.blocks[0]).includes('data-path="convex/http.ts"'));
});

test("range= starts the numbering at its first line and labels the path", () => {
  const { doc: d } = parseMarkdown("# T\n\n```ts file=src/upload.ts range=12-40\na\nb\n```\n", { file: "t.md" });
  const html = renderCode(d.blocks[0]);
  assert.ok(html.includes(`${PATH("src/upload.ts", "src/", "upload.ts")}<span class="code-range">L12–40</span>`));
  assert.ok(html.includes('<ol class="code-lines" style="counter-reset:l 11"><li>'));
  // `lines` alone numbers from 1 with no reset.
  assert.match(renderCode({ type: "code", lang: "ts", file: "a.ts", lines: true, source: "x" }), /<ol class="code-lines"><li>/);
});

test("title and file coexist: path first, then the title after a middot", () => {
  const html = renderCode({ type: "code", lang: "ts", file: "src/retry.ts", title: "Retry helper", source: "x" });
  assert.ok(html.includes(`${PATH("src/retry.ts", "src/", "retry.ts")}<span class="code-sep">·</span><span class="code-title">Retry helper</span></span>`));
});

test("a caption block shows the title on the left, the language right", () => {
  // A normalized block carries `file: ""`, which must not hide the title.
  assert.ok(renderCode({ type: "code", lang: "ts", file: "", title: "How it reads", source: "const a = 1;" }).includes(
    `<span class="code-name"><span class="code-title">How it reads</span></span><span class="code-tools"><span class="code-lang">${ICON("ts")}ts</span>`));
});

test("a plain snippet puts icon+lang left alone", () => {
  assert.ok(renderCode({ type: "code", lang: "py", source: "x = 1" }).includes(
    `<div class="code-head"><span class="code-lang">${ICON("py")}py</span><span class="code-tools"><button`));
  // An unknown language gets the generic glyph; no language at all, just Copy.
  assert.ok(renderCode({ type: "code", lang: "brainfuck", source: "x" }).includes(ICON("code")));
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

test("inline file references become chips; commands, URLs and words stay code", () => {
  for (const [text, path] of [
    ["convex/http.ts", "convex/http.ts"], ["./plan.md", "./plan.md"], ["~/.npmrc", "~/.npmrc"],
    ["src/render/code.js:42", "src/render/code.js"], ["/etc/hosts", "/etc/hosts"], ["package.json", "package.json"],
  ]) assert.equal(filePath(text)?.path, path, text);
  for (const text of ["https://example.com/a.ts", "npm install x", "foo", "a/b c", "Next.js", "process.env"]) {
    assert.equal(filePath(text), null, text);
  }
  const { html } = render("# T\n\nEdit `src/render/code.js:42`, run `npm install x`, see [`a/b.ts`](https://example.com).\n", { file: "t.md" });
  // The chip keeps `:42` on screen but copies only the path.
  assert.ok(html.includes('<button type="button" class="file-chip" data-path="src/render/code.js" title="Copy path">' +
    `${FILE_ICON}<span class="p-text"><span class="p-dir">src/render/</span><span class="p-name">code.js:42</span></span></button>`));
  assert.ok(html.includes("<code>npm install x</code>"));
  assert.ok(html.includes('<a href="https://example.com"><code>a/b.ts</code></a>'));
  // A chip needs the copy script and the file glyph even with no code block on the page.
  assert.equal((html.match(/<script>/g) ?? []).length, 1);
  assert.ok(html.includes('<symbol id="icon-file"'));
  assert.equal(validateHtml(html).ok, true);
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
  assert.match(html, /<span class="code-title">Add a CSP to served drafts<\/span>/);
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
