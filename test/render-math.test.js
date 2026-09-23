import test from "node:test";
import assert from "node:assert/strict";

import { parseMarkdown } from "../src/render/parse.js";
import { renderInlineMath, renderMath, renderMathBlock, unescapeHtml } from "../src/render/math.js";

/** The plan's own formulas, plus one per construct the spec promises. */
const FIXTURES = [
  ["half-life", String.raw`t_{1/2} = \frac{\ln 2}{\lambda}`],
  ["Maxwell integral", String.raw`\int_0^\infty f(v)\,dv = 1`],
  ["energy quantum", String.raw`E = \hbar\omega`],
  ["fraction", String.raw`\frac{a + b}{c}`],
  ["square root", String.raw`\sqrt{x^2 + y^2}`],
  ["sum with limits", String.raw`\sum_{i=1}^{n} i = \frac{n(n+1)}{2}`],
  ["vector and bold", String.raw`\vec{F} = m\mathbf{a}`],
  ["Greek", String.raw`\mu + 1.645\,\sigma`],
  ["subscript and superscript", String.raw`p_{95}^{\,2}`],
  ["units", String.raw`t = 412\,\mathrm{ms}`],
  ["text macro", String.raw`\text{cost} = \frac{\text{bytes} \times \text{reads}}{10^{6}} \times 0.09`],
];

for (const [name, tex] of FIXTURES) {
  test(`${name} renders to MathML`, () => {
    const html = renderMathBlock(tex);
    assert.match(html, /<math/);
    assert.match(html, /display="block"/);
    assert.doesNotMatch(html, /<script/);
    assert.doesNotMatch(html, /math-error/);
    assert.match(html, /^<div class="math-block">/);
  });

  test(`${name} also renders inline`, () => {
    const html = renderMath(tex);
    assert.match(html, /<math/);
    assert.doesNotMatch(html, /display="block"/);
    assert.doesNotMatch(html, /<script/);
  });
}

test("a TeX error comes back as a span, never a throw", () => {
  for (const bad of [String.raw`\frac{1`, String.raw`\notacommand{x}`, String.raw`\begin{nope}x\end{nope}`, "}{"]) {
    let html;
    assert.doesNotThrow(() => { html = renderMath(bad); }, bad);
    assert.match(html, /^<span class="math-error">/);
    assert.doesNotMatch(html, /<math/);
  }
  assert.match(renderMathBlock(String.raw`\frac{1`), /math-error/);
});

test("the error message is escaped", () => {
  const html = renderMath(String.raw`\notacommand{<script>}`);
  assert.match(html, /math-error/);
  assert.doesNotMatch(html, /<script/);
});

test("empty TeX renders nothing", () => {
  assert.equal(renderMath(""), "");
  assert.equal(renderMath("   "), "");
  assert.equal(renderMath(undefined), "");
});

test("unescapeHtml reverses the parser's attribute escaping", () => {
  assert.equal(unescapeHtml("a &lt; b &amp;&amp; c &gt; d"), "a < b && c > d");
  assert.equal(unescapeHtml("it&#39;s &quot;quoted&quot;"), `it's "quoted"`);
});

test("inline placeholders in prose become MathML", () => {
  const { doc } = parseMarkdown(
    "# T\n\nThe half-life is $t_{1/2} = \\frac{\\ln 2}{\\lambda}$, inline, and $a < b$ too.\n",
  );
  const prose = doc.blocks.filter((b) => b.type === "markdown").map((b) => b.html).join("");
  assert.match(prose, /class="math-inline"/);

  const out = renderInlineMath(prose);
  assert.doesNotMatch(out, /math-inline/);
  assert.equal(out.match(/<math/g).length, 2);
  // The `<` came through the attribute escaped; it must survive as an operator.
  assert.match(out, /<mo>&lt;<\/mo>/);
  assert.match(out, /The half-life is <math/);
  assert.doesNotMatch(out, /<script/);
});

test("prose with no math is passed through untouched", () => {
  const html = "<p>Costs $30 and $40, not math.</p>";
  assert.equal(renderInlineMath(html), html);
  assert.equal(renderInlineMath(""), "");
  assert.equal(renderInlineMath(undefined), "");
});

test("a display fence and a $$ block reach the same MathML", () => {
  const { doc } = parseMarkdown("# T\n\n$$\np_{95} = \\mu + 1.645\\,\\sigma\n$$\n\n```math\np_{95} = \\mu + 1.645\\,\\sigma\n```\n");
  const maths = doc.blocks.filter((b) => b.type === "math");
  assert.equal(maths.length, 2);
  assert.equal(renderMathBlock(maths[0].tex), renderMathBlock(maths[1].tex));
  assert.match(renderMathBlock(maths[0].tex), /<math/);
});
