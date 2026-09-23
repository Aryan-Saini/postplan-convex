/**
 * Syntax highlighting without a runtime.
 *
 * Postplan serves static HTML with no external scripts, so highlighting happens
 * here, at render time, and ships as plain `<span>` elements. The tokenizer is
 * deliberately small: one pass, ordered rules, first match wins. It covers the
 * languages the spec lists and degrades to plain text for anything else, which
 * is the right failure mode for a document.
 *
 * Token classes (`t-kw`, `t-str`, …) are styled by the shell's stylesheet.
 *
 * @module render/code
 */

/** @typedef {import("./ir.js").CodeBlock} CodeBlock */
/** @typedef {import("./ir.js").DiffBlock} DiffBlock */

const esc = (s) =>
  String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

const KEYWORDS = {
  ts: "abstract as async await break case catch class const continue default delete do else enum export extends finally for from function if implements import in instanceof interface let new of private protected public readonly return satisfies static super switch this throw try type typeof var void while yield",
  js: "async await break case catch class const continue default delete do else export extends finally for from function if import in instanceof let new of return static super switch this throw try typeof var void while yield",
  py: "and as assert async await break class continue def del elif else except finally for from global if import in is lambda none nonlocal not or pass raise return try while with yield",
  sh: "cd echo export fi for if then else do done function in local return set source while case esac",
  sql: "select from where group by order having join left right inner outer on as insert into values update set delete limit offset with",
  rust: "as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return self static struct super trait type unsafe use where while",
  go: "break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var",
};

/** Languages with their own rule set rather than a keyword list. */
const RULE_LANGS = ["json", "yaml", "html", "xml", "css", "md", "toml"];

const ALIASES = {
  typescript: "ts", tsx: "ts", javascript: "js", jsx: "js", python: "py",
  bash: "sh", shell: "sh", zsh: "sh", console: "sh", golang: "go", rs: "rust", py3: "py",
  markdown: "md", mdx: "md", tml: "toml",
};

/** Does this language get tokenized at all? */
const known = (key) => Boolean(KEYWORDS[key]) || RULE_LANGS.includes(key);

// Rules run in order; the first that matches at the cursor wins.
function rulesFor(lang) {
  const kw = KEYWORDS[lang];
  const base = [
    [/^\s+/, null],
  ];
  if (lang === "json") {
    return [
      ...base,
      [/^"(?:[^"\\]|\\.)*"(?=\s*:)/, "key"],
      [/^"(?:[^"\\]|\\.)*"/, "str"],
      [/^\b(?:true|false|null)\b/, "kw"],
      [/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/i, "num"],
      [/^[{}\[\],:]/, "punc"],
      [/^[^\s{}\[\],:"]+/, null],
    ];
  }
  if (lang === "yaml") {
    return [
      ...base,
      [/^#[^\n]*/, "com"],
      [/^[\w.-]+(?=\s*:)/, "key"],
      [/^"(?:[^"\\]|\\.)*"|^'(?:[^'\\]|\\.)*'/, "str"],
      [/^\b(?:true|false|null|yes|no)\b/, "kw"],
      [/^-?\d+(?:\.\d+)?/, "num"],
      [/^[^\s#]+/, null],
    ];
  }
  if (lang === "toml") {
    return [
      ...base,
      [/^#[^\n]*/, "com"],
      // A table header, `[server]` or `[[bin]]`, reads as the structure marker.
      [/^\[\[?[^\]\n]*\]\]?/, "tag"],
      [/^[A-Za-z_][\w.-]*(?=\s*=)|^"(?:[^"\\]|\\.)*"(?=\s*=)/, "key"],
      [/^"""[\s\S]*?"""|^'''[\s\S]*?'''/, "str"],
      [/^"(?:[^"\\]|\\.)*"|^'(?:[^'\\]|\\.)*'/, "str"],
      [/^\b(?:true|false)\b/, "kw"],
      // Offset date-time, local date, then plain numbers.
      [/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?/, "num"],
      [/^[+-]?(?:0x[0-9a-f_]+|\d[\d_]*(?:\.[\d_]+)?(?:e[+-]?\d+)?|inf|nan)\b/i, "num"],
      [/^[=,]/, "op"],
      [/^[{}\[\]]/, "punc"],
      [/^[^\s#=,{}\[\]"']+/, null],
    ];
  }
  if (lang === "md") {
    return [
      ...base,
      // `#` through `######`, plus the fence that opens or closes a code block.
      [/^#{1,6}[ \t][^\n]*/, "kw"],
      [/^(?:```|~~~)[^\n]*/, "meta"],
      [/^>[ \t]?/, "meta"],
      [/^(?:[-*+]|\d+\.)(?=[ \t])/, "punc"],
      [/^!?\[[^\]\n]*\]\([^)\n]*\)/, "fn"],
      [/^`[^`\n]+`/, "str"],
      [/^\*\*[^\n]+?\*\*|^__[^\n]+?__/, "type"],
      [/^\*[^*\n]+?\*|^_[^_\n]+?_/, "attr"],
      [/^~~[^\n]+?~~/, "com"],
      [/^https?:\/\/\S+/, "fn"],
      [/^[^\s*_`\[\]!#>~]+/, null],
    ];
  }
  if (lang === "html" || lang === "xml") {
    return [
      ...base,
      [/^<!--[\s\S]*?-->/, "com"],
      [/^<!DOCTYPE[^>\n]*>/i, "kw"],
      [/^<\/?[\w-]+/, "tag"],
      [/^[\w-]+(?==)/, "attr"],
      [/^"(?:[^"\\]|\\.)*"|^'(?:[^'\\]|\\.)*'/, "str"],
      [/^[>/=]/, "punc"],
      [/^[^<>"'=\s]+/, null],
    ];
  }
  if (lang === "css") {
    return [
      ...base,
      [/^\/\*[\s\S]*?\*\//, "com"],
      // At-rules and `!important` are the closest CSS has to keywords.
      [/^@[\w-]+|^!important\b/, "kw"],
      [/^[.#]?[\w-]+(?=[^{};]*\{)/, "tag"],
      [/^--[\w-]+|^[\w-]+(?=\s*:)/, "key"],
      [/^#[0-9a-f]{3,8}\b/i, "num"],
      [/^-?\d+(?:\.\d+)?(?:px|rem|em|%|s|ms|vh|vw|fr)?/, "num"],
      [/^[{};:,()]/, "punc"],
      [/^[^\s{};:,()]+/, null],
    ];
  }
  return [
    ...base,
    [lang === "py" || lang === "sh" ? /^#[^\n]*/ : lang === "sql" ? /^--[^\n]*/ : /^\/\/[^\n]*/, "com"],
    [/^\/\*[\s\S]*?\*\//, "com"],
    [/^(?:"""[\s\S]*?"""|'''[\s\S]*?''')/, "str"],
    [/^`(?:[^`\\]|\\.)*`/, "str"],
    [/^"(?:[^"\\]|\\.)*"|^'(?:[^'\\]|\\.)*'/, "str"],
    ...(lang === "sh" ? [] : [[/^@[\w.]+/, "meta"]]),
    [/^\b(?:0x[0-9a-f]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?)\b/i, "num"],
    [/^[A-Za-z_$][\w$]*(?=\s*\()/, "fn"],
    [/^[A-Z][\w$]*/, "type"],
    [kw ? new RegExp(`^\\b(?:${kw.trim().split(/\s+/).join("|")})\\b`, "i") : /^$a/, "kw"],
    [/^[A-Za-z_$][\w$]*/, null],
    [/^[=+\-*/%<>!&|^~?:]+/, "op"],
    [/^[{}()\[\];,.]/, "punc"],
    [/^[^\s]/, null],
  ];
}

function tokenize(src, lang) {
  const rules = rulesFor(lang);
  let out = "", rest = src;
  let guard = 0;
  while (rest && guard++ < 200000) {
    let hit = false;
    for (const [re, cls] of rules) {
      const m = re.exec(rest);
      if (!m || !m[0]) continue;
      out += cls ? `<span class="t-${cls}">${esc(m[0])}</span>` : esc(m[0]);
      rest = rest.slice(m[0].length);
      hit = true;
      break;
    }
    if (!hit) {
      out += esc(rest[0]);
      rest = rest.slice(1);
    }
  }
  return out;
}

/** Resolve an info-string language to a tokenizer key. */
export function langKey(lang) {
  const key = String(lang ?? "").toLowerCase();
  return ALIASES[key] ?? key;
}

/** Highlight a fragment of source. Unknown languages come back escaped, not styled. */
export function highlight(src, lang) {
  const key = langKey(lang);
  return known(key) ? tokenize(String(src), key) : esc(src);
}

/**
 * A fenced code block with an optional filename header and line numbers.
 * `lang` is a display label as well as the tokenizer selector.
 */
export function code(src, { lang = "", file = "", lines: showLines = false } = {}) {
  const key = langKey(lang);
  const text = String(src).replace(/^\n/, "").replace(/\s+$/, "");
  const head = file || lang
    ? `<div class="code-head"><span class="code-file">${esc(file || lang)}</span>` +
      (file && lang ? `<span class="code-lang">${esc(lang)}</span>` : "") + `</div>`
    : "";
  // Line numbering tokenizes line by line: splitting already-tokenized markup on
  // newlines would cut a multiline span (a block comment, a template string) in half.
  const numbered = showLines
    ? `<ol class="code-lines">${text.split("\n").map((l) => {
        const cell = known(key) ? tokenize(l, key) : esc(l);
        return `<li>${cell || "&nbsp;"}</li>`;
      }).join("")}</ol>`
    : `<code>${known(key) ? tokenize(text, key) : esc(text)}</code>`;
  return `<div class="code${head ? " has-head" : ""}">${head}<pre>${numbered}</pre></div>`;
}

/** A unified diff, coloured per line, no tokenizer. */
export function diff(src, { file = "" } = {}) {
  const rows = String(src).replace(/^\n/, "").replace(/\s+$/, "").split("\n").map((l) => {
    const kind = l.startsWith("+") ? "add" : l.startsWith("-") ? "del" : l.startsWith("@") ? "hunk" : "ctx";
    return `<li class="d-${kind}">${esc(l) || "&nbsp;"}</li>`;
  });
  return `<div class="code has-head diff">` +
    `<div class="code-head"><span class="code-file">${esc(file || "diff")}</span></div>` +
    `<pre><ol class="code-lines">${rows.join("")}</ol></pre></div>`;
}

/**
 * Render one `code` block. The header shows `file=` when present and falls back
 * to `title=`, so a block can be captioned without naming a path.
 *
 * @param {CodeBlock} block
 */
export function renderCode(block) {
  return code(block?.source ?? "", {
    lang: block?.lang ?? "",
    file: block?.file ?? block?.title ?? "",
    lines: block?.lines === true,
  });
}

/**
 * Render one `diff` block; `title=` names the change, since a diff spans files.
 * @param {DiffBlock} block
 */
export function renderDiff(block) {
  return diff(block?.source ?? "", { file: block?.title ?? "" });
}

export { esc, KEYWORDS, RULE_LANGS };
