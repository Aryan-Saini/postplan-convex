---
title: Postplan component gallery
byline: Aryan Saini
date: Sep 22, 2026
status: Draft v3
---

Every block a Postplan document can carry, on one page, with real numbers in it. Nothing here needs a
script, a webfont or a network call: the charts are generated SVG, the code is tokenized at build time,
and the whole page is one file under 512 KB.

## Type

Body copy sits at 17px on a 25px line, the renderer's own measure, and reads in primary white. **Bold**
lifts a phrase to primary white; the rest of the sentence stays one step down, which is what keeps a dense
page from glaring. Inline `const x = 1` and a [link](https://claude.ai) read without breaking the line
rhythm. ==Highlighted== text, ++underlined++ text and ~~struck~~ text read as expected; water is H~2~O and
the area scales as r^2^.[^measure]

### Third level heading, serif

Second and third level headings are the serif at regular weight; the fourth is the sans, semibold.

#### Fourth level heading

Text under a fourth level heading.

1. First step
   1. Nested numbered under the first
   2. Second nested
      1. Third level nested
2. Second step
   - Bullet under a number
     - Deeper bullet
3. Third step

- Top bullet
  - Second level
    - Third level
- Bullets carry parallel items only

- [ ] An open task
- [x] A finished task

> A quote takes a hairline rule, not a tinted card.

```html
<dl class="spec">
  <dt>Size cap</dt><dd>512 KB per document, enforced server side</dd>
  <dt>Scripts</dt><dd>Inline classic only; no modules, no external src</dd>
  <dt>Images</dt><dd>data: URIs inline, or an https URL from file-upload</dd>
  <dt>Update</dt><dd>Re-upload the same path; the URL is stable, the version bumps</dd>
</dl>
```

::: center
A centred line, for a quote or a figure label.
:::

::: right
Right-aligned, for a sign-off or a total.
:::

::: subtext
Muted 14px secondary text under a paragraph, a table or a figure. Same ink as a caption.
:::

::: columns
Two short paragraphs side by side; each blank-line-separated paragraph becomes a column.

Under 520px the group collapses to one column, so the reading order is the source order.
:::

## Callouts

> [!note] Note
> A rule and a label. No tinted panel, no icon set, no rounded pill around the whole paragraph.

> [!good] Shipped
> Validation moved server side on Sep 14, so a bad document now fails at upload rather than in the
> reader's browser.

> [!warn] Risk
> S3 presigns expire in 120 seconds. A cold viewer on a slow link can miss the window and see a 502.

> [!critical] Blocked
> The README still documents Railway and Postgres. Anyone provisioning from it today gets a stack that no
> longer exists.

## Stat tiles

The renderer's stat is centred: title, one big number, the as-of line, then the signed change with its
basis. One per view as a hero, or a row of them.

```hero
[{"k":"Net burn, August","v":412000,"format":"usd","as":"Aug 2026","delta":"−6.0% vs July","tone":"good"},
 {"k":"Documents published","v":1284,"format":"int","as":"Sep 2026, to date","delta":"+18.4% vs August","tone":"good"},
 {"k":"Median upload","v":412,"format":"ms","as":"Week 38","delta":"+38 ms vs August","tone":"warn"}]
```

Tiles are the denser form: label above, number, change, and a 12-point sparkline, sharing one hairline grid.

```stats id=throughput
[{"k":"Documents published","v":1284,"format":"int","delta":"+18.4% vs August","tone":"good",
  "spark":[620,680,705,790,860,910,980,1040,1085,1160,1210,1284]},
 {"k":"Median upload","v":412,"format":"ms","delta":"+38 ms vs August","tone":"warn",
  "spark":[300,318,330,322,341,360,372,366,390,398,404,412]},
 {"k":"Rejected at validation","v":0.031,"format":"pct","delta":"−1.2 pts vs August","tone":"good",
  "spark":[7.1,6.8,6.2,5.9,5.4,5.1,4.6,4.3,4.3,3.8,3.4,3.1]},
 {"k":"Largest document","v":486,"format":"int","delta":"95% of the cap","meter":{"max":512}}]
```

## Tables

A row per item, a column per attribute, units in the header. Numbers are tabular and right-aligned so the
column can be read down. Tone is carried by the value's colour plus its own text, never colour alone.

| Left | Center | Right |
|:---|:---:|---:|
| a | b | 1,240 |
| longer cell text here | c | 88 |

A table sizes to its content and honours the alignment markers; a wide one takes the full column.

| Stage | Owner | p50 (ms) | p95 (ms) | Error rate |
|:---|:---|---:|---:|---:|
| Validate | Aryan | 18 | 41 | good:0.2% |
| S3 put | Aryan | 212 | 905 | warn:1.4% |
| Serve | Aryan | 96 | 1,340 | bad:4.8% |
| Total | Aryan | 326 | 2,286 | flat:2.1% |

::: subtext
p95 serve time is the S3 presign round trip, not the document itself.
:::

## Charts

Generated as inline SVG from the data, so geometry, ticks and labels line up without hand placement. Hover
any mark for its value. The palette is the eight-slot categorical set, validated against a true-black surface.

```chart columns id=published
{"title":"Documents published per month","note":"September is partial, through the 22nd.","format":"int",
 "labels":["Apr","May","Jun","Jul","Aug","Sep"],"values":[61,78,96,142,168,121]}
```

```chart lines
{"title":"Upload latency, median","note":"Milliseconds, weekly.","format":"ms","area":true,"zeroFloor":false,
 "labels":["W1","W2","W3","W4","W5","W6","W7","W8"],
 "series":[{"name":"Median","values":[284,301,296,340,366,392,401,412]}]}
```

```chart lines
{"title":"Stage latency","note":"Three series get a legend and a labelled end point.","format":"ms",
 "labels":["W1","W2","W3","W4","W5","W6","W7","W8"],
 "series":[{"name":"Validate","values":[18,19,17,18,20,19,18,18]},
           {"name":"S3 put","values":[180,195,210,240,232,244,220,212]},
           {"name":"Serve","values":[70,79,96,121,118,130,118,96]}]}
```

```chart bars
{"title":"Documents by kind","note":"Ranked, so the bars go sideways and the labels stay horizontal.",
 "format":"int","labels":["Plans","Findings","PR reviews","UI mocks","Runbooks","Other"],
 "values":[412,298,211,164,91,108]}
```

```chart grouped
{"title":"Create vs update","format":"int","labels":["Q3 25","Q4 25","Q1 26","Q2 26"],
 "series":[{"name":"Created","values":[42,51,66,78]},{"name":"Updated","values":[18,22,26,31]}]}
```

```chart stacked
{"title":"Publishes by harness","note":"Stacked because the segments sum to the month's total.","format":"int",
 "labels":["Apr","May","Jun","Jul","Aug","Sep"],
 "series":[{"name":"Claude Code","values":[30,38,44,70,82,58]},
           {"name":"Codex","values":[18,22,31,42,51,40]},
           {"name":"Other harness","values":[13,18,21,30,35,23]}]}
```

```chart delta
{"title":"Change in p50 vs August","note":"Signed change reads against zero. Slower is worse here, so up is red.",
 "format":"ms","higherIsBetter":false,
 "labels":["Validate","S3 put","Serve","Presign","Total"],"values":[-3,32,26,-11,44]}
```

```chart whisker
{"title":"Latency spread by stage","note":"Dot is the median, whisker spans p05 to p95.","format":"ms",
 "labels":["Validate","S3 put","Serve"],"mid":[18,212,96],"lo":[11,148,58],"hi":[41,905,1340]}
```

```chart heatmap
{"title":"Uploads by hour and weekday","note":"One hue, light to dark. Counts sit in the cell.","format":"int",
 "rows":["Mon","Tue","Wed","Thu","Fri","Sat","Sun"],
 "cols":["00","03","06","09","12","15","18","21"],
 "values":[[1,0,2,9,14,18,12,6],[0,1,3,11,16,21,15,7],[2,0,1,12,19,24,14,8],
           [1,1,2,10,17,22,16,9],[3,2,4,14,21,26,11,5],[0,0,1,3,5,6,4,2],
           [0,1,0,2,4,5,3,1]]}
```

## More charts

Shapes that come up often enough to be worth a primitive: a bridge between two totals, two numeric axes, an
ordered drop-off, a schedule, one panel per item, and a share of a whole that is not a pie.

```chart waterfall
{"title":"What moved between August and September","note":"Green adds, red removes, blue is a balance.",
 "format":"int","labels":["Aug total","New repos","Churned","Reruns","Partial Sep","Sep total"],
 "values":[168,34,-41,18,-58,121],"totals":[0,5]}
```

```chart scatter
{"title":"Document size against time to write","note":"Bubble area is the number of documents of that kind.",
 "xTitle":"Minutes to write","yTitle":"KB","format":"int",
 "points":[{"label":"Plans","x":42,"y":186,"size":412},{"label":"Findings","x":61,"y":143,"size":298},
           {"label":"PR reviews","x":28,"y":96,"size":211},{"label":"UI mocks","x":88,"y":240,"size":164},
           {"label":"Runbooks","x":34,"y":71,"size":91},{"label":"Other","x":52,"y":110,"size":108}]}
```

```chart funnel
{"title":"Reader drop-off","note":"Percentages on the right are the step-to-step change.","format":"int",
 "labels":["Document opened","Scrolled past the lead","Reached a chart","Reached the end","Replied or commented"],
 "values":[4820,3910,2640,1180,412]}
```

```chart schedule
{"title":"Build schedule","note":"Green is finished, blue is planned.",
 "tasks":[{"label":"Vendor postplan","start":"2026-08-10","end":"2026-08-14","done":true},
          {"label":"Convex backend","start":"2026-08-14","end":"2026-08-29","done":true},
          {"label":"S3 storage","start":"2026-08-29","end":"2026-09-15","done":true},
          {"label":"Component system","start":"2026-09-16","end":"2026-10-03"},
          {"label":"Fold into the skill","start":"2026-10-01","end":"2026-10-14"}]}
```

```chart small-multiples
{"title":"Publishes by harness","format":"int","labels":["W1","W2","W3","W4","W5","W6","W7","W8"],
 "series":[{"name":"Claude Code","values":[42,48,51,63,71,78,74,82]},
           {"name":"Codex","values":[18,22,26,31,34,39,44,51]},
           {"name":"Cursor","values":[9,11,10,14,13,16,18,17]},
           {"name":"opencode","values":[3,4,6,5,8,9,12,14]},
           {"name":"CI","values":[12,14,13,19,22,21,25,28]},
           {"name":"Manual","values":[7,6,5,6,4,5,3,4]}]}
```

```chart share
{"title":"Share of publishes","note":"A strip rather than a pie: angles are hard to compare, lengths are not.",
 "format":"int","labels":["Claude Code","Codex","Cursor","opencode","CI"],"values":[612,284,131,96,161]}
```

## Code

Highlighted at build time into plain spans, with an optional filename header and line numbers. No runtime
highlighter, so the block costs nothing to render and works with scripts blocked.

```ts file=src/upload.ts lines
export async function upload(html: string, filename: string): Promise<Draft> {
  const bytes = new TextEncoder().encode(html).length;
  if (bytes > MAX_HTML_BYTES) throw new UploadError(`${bytes} bytes exceeds the cap`);

  const check = validateHtml(html, {});
  if (!check.ok) throw new UploadError(check.errors.join("\n"));

  return post("/api/uploads", { html, filename });
}
```

```bash
npx postplan-aryan@latest upload ./plan.html --description "Q3 warehouse plan"
# Draft  https://abundant-cardinal-686.convex.site/d/q3-warehouse-8fk2
# Version 4
```

```json file=response
{
  "draftId": "q3-warehouse-8fk2",
  "publicUrl": "https://abundant-cardinal-686.convex.site/d/q3-warehouse-8fk2",
  "versionNumber": 4,
  "warnings": []
}
```

```diff title="Add a CSP to served drafts"
@@ convex/http.ts @@
 const headers = {
   "Content-Type": "text/html; charset=utf-8",
-  "Cache-Control": "private, max-age=30",
+  "Cache-Control": "private, max-age=30, must-revalidate",
+  "Content-Security-Policy": "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'",
 };
```

## Images and video

A figure is the image at full column width, corners at 8px, a hairline border, and the caption underneath in
the muted ink, left aligned, the way the renderer captions an embed with its provenance. A title of `zoom`
turns the figure into a lightbox target.

![Dashboard after the S3 move · captured Sep 21](https://abundant-cardinal-686.convex.site/img/dash.png "zoom")

### Slideshow

Several screenshots of one flow go in a slideshow: swipe or scroll sideways, or use the dots. Scroll-snap
does the paging, so it needs no script and degrades to a horizontal strip.

```slides
[{"src":"https://abundant-cardinal-686.convex.site/img/1.png","caption":"The list view before the change"},
 {"src":"https://abundant-cardinal-686.convex.site/img/2.png","caption":"Detail pane with the new sparkline column"},
 {"src":"https://abundant-cardinal-686.convex.site/img/3.png","caption":"Settings, unchanged"}]
```

### Video

Video takes the same figure. Always mp4 with a poster frame, so the block reads as a still when nothing is
playing, and never a bare link. The native player carries the controls.

```video
{"src":"https://abundant-cardinal-686.convex.site/img/clip.mp4",
 "poster":"https://abundant-cardinal-686.convex.site/img/poster.png",
 "caption":"Upload flow, 0:42"}
```

## Diagrams

The flow and sequence shapes mermaid is normally used for, drawn as SVG with computed geometry.

```flow
{"title":"Publish path","note":"Rejection happens before any byte reaches storage.",
 "cols":[[{"id":"cli","label":"CLI upload","shape":"round"}],
         [{"id":"val","label":"Validate","shape":"diamond"}],
         [{"id":"s3","label":"S3","shape":"store"},{"id":"err","label":"400 rejected","tone":"bad"}],
         [{"id":"row","label":"Convex row"}],
         [{"id":"view","label":"/d/:id","shape":"round"}]],
 "edges":[{"from":"cli","to":"val"},{"from":"val","to":"s3","label":"ok"},
          {"from":"val","to":"err","label":"reject"},{"from":"s3","to":"row"},
          {"from":"row","to":"view"}]}
```

```sequence
{"title":"Upload and read","actors":["Agent","Convex","S3","Reader"],
 "msgs":[{"from":"Agent","to":"Convex","label":"POST /api/uploads"},
         {"from":"Convex","to":"S3","label":"PUT html (presigned)"},
         {"from":"S3","to":"Convex","label":"200","dashed":true},
         {"from":"Convex","to":"Agent","label":"publicUrl","dashed":true},
         {"from":"Reader","to":"Convex","label":"GET /d/:id"},
         {"from":"Convex","to":"Reader","label":"html","dashed":true}]}
```

## Math

MathML renders natively in every current browser, so a formula needs no KaTeX bundle and no image. The
half-life is $t_{1/2} = \frac{\ln 2}{\lambda}$, inline, at body size.

$$
p_{95} = \mu + 1.645\,\sigma
$$

```math
\text{cost} = \frac{\text{bytes} \times \text{reads}}{10^{6}} \times 0.09
```

## Timeline

```timeline
[{"when":"Aug 12","what":"Forked postplan 0.0.4 from npm","state":"done",
  "note":"Vendored unmodified so the diff against upstream stays readable."},
 {"when":"Aug 28","what":"Replaced express and Postgres with Convex","state":"done"},
 {"when":"Sep 14","what":"Moved draft HTML to S3, addressed by content hash","state":"done",
  "note":"Uploading the same bytes twice is now a no-op."},
 {"when":"Sep 22","what":"Component gallery, this page","state":"now"},
 {"when":"Next","what":"Fold the components into the skill as copyable references"}]
```

## Mock frames

When the document is a set of UI variants, each frame is labelled and laid out for side-by-side comparison.
The `html` fence is the escape hatch: emitted verbatim, inheriting the document's tokens, and policy-checked
with the rest of the page.

```html
<div class="mocks">
  <div class="mock"><div class="mock-head">A · Tiles</div><div class="mock-body">
    <div class="k small">Published</div><div class="mock-big">1,284</div>
    <div class="small">+18.4% vs August</div></div></div>
  <div class="mock"><div class="mock-head">B · Row</div><div class="mock-body">
    <div class="mock-row"><span class="small">Published</span><span class="mock-big">1,284</span></div>
    <div class="mock-row"><span class="small">Rejected</span><span class="mock-big">3.1%</span></div>
  </div></div>
</div>
```

## Sources

- Figures are illustrative, generated for this gallery on Sep 22, 2026.
- Palette: the eight-slot categorical set, validated against surface `#000000`.
- Upload policy: `src/html-policy.js` in postplan-convex.[^policy]

[^measure]: The measure is 744px with 22px of side padding, so a line lands near 75 characters.
[^policy]: The same validator the server runs, re-applied to the assembled document.
