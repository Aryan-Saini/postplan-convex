# postplan-aryan

Publish a self-contained HTML document and get a link back. A fork of
[postplan](https://www.npmjs.com/package/postplan) (MIT, t3dotgg) with the
express + Postgres + S3 server replaced by **Convex** functions and tables.

```bash
npx postplan-aryan auth set <api-key> --api-url https://<your-deployment>.convex.site
npx postplan-aryan upload plan.html
```

No deployment is baked into the published package: the CLI reads `--api-url`,
then `POSTPLAN_API_URL`, then `~/.postplan/config.json`. Point it at your own
instance.

## Rendering Markdown

`render` turns a Markdown document into the same self-contained HTML the upload
endpoint accepts: one file, no webfont, no network call. Charts, diagrams and
formulas are generated as inline SVG and MathML at render time.

Code blocks are highlighted at render time in One Dark Pro with a language icon,
and each has a Copy button that puts the raw source on the clipboard; that button
is the only script a document carries, and a document without code has none.

```bash
npx postplan-aryan render plan.md              # writes plan.html
npx postplan-aryan upload plan.md              # renders, then publishes
```

A document is frontmatter, prose, and fences whose info string names a block:

```markdown
---
title: Q3 warehouse plan
byline: Aryan Saini
status: On track
---

Pick-to-ship is 41 hours against a 24 hour target, and the gap is all putaway.

## Throughput

​```chart columns
{"title":"Orders shipped","format":"int",
 "labels":["Jul","Aug","Sep"],"values":[812,904,1130]}
​```
```

`upload plan.md` renders to `plan.html` and publishes that, but remembers the
draft under `plan.md`, so re-uploading the source keeps the same URL.

`--out <path>` moves the output, `--emit-ir` also writes the block IR as JSON,
and `render` accepts that JSON back in place of the Markdown. A document that
does not validate prints one diagnostic per line and writes nothing.

The full grammar — every block kind, its JSON shape, and the error messages —
lives in the `html-communication` skill's `SKILL.md`. `examples/gallery.md`
renders one of everything and is the fixture the tests check.

## Where uploads go

Uploads go to whichever instance you configured — **not** `postplan.dev`. Run
`auth set` once per machine; without it the CLI falls back to `postplan.dev`,
which is somebody else's server.

The instance stores each document in its S3 bucket and serves it at
`/d/<draftId>`. Re-uploading the same file path updates that URL in place and
bumps the version, so a link you already sent keeps working and keeps showing the
latest. `--new` starts a separate draft instead.

Draft ids are random and unguessable, and there is no listing URL: a link leads to
one document and nothing else. `/d/<id>/raw` returns the source.

## Self-hosting

You need a Convex project and an S3 bucket. No Postgres, no Railway.

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in your deployment.
3. Set the server env vars on your deployment:

```bash
npx convex env set --prod S3_BUCKET <bucket>
npx convex env set --prod S3_REGION <region>
npx convex env set --prod S3_PREFIX <prefix>
npx convex env set --prod S3_ACCESS_KEY_ID <key>
npx convex env set --prod S3_SECRET_ACCESS_KEY <secret>
npx convex env set --prod POSTPLAN_PUBLIC_BASE_URL https://<deployment>.convex.site
npx convex env set --prod POSTPLAN_API_KEY <a long random string>
```

**Set `POSTPLAN_API_KEY`.** With it unset the upload endpoint is open, and anyone
who learns your deployment URL can write HTML into your bucket and have it served
from your origin.

4. `npx convex deploy`

Give the bucket a private prefix for drafts; they are reachable only through
`/d/<draftId>`. Use an IAM user scoped to that prefix, with no `ListBucket`.

## Content-Security-Policy

`GET /d/<draftId>` sets:

```
default-src 'none'; img-src https: data:; media-src https: data:; style-src 'unsafe-inline'; font-src data:; script-src 'unsafe-inline'; connect-src 'none'; frame-src 'none'; frame-ancestors 'none'; form-action 'none'; base-uri 'none'; worker-src 'none'
```

plus `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`. The
not-found page carries the same headers. `/d/<draftId>/raw` is `text/plain` with
`nosniff` and no CSP, because it is never rendered.

What it guarantees, in a browser: the upload policy allows inline classic
`<script>`, so a draft's own scripts still run, but they cannot fetch
(`connect-src 'none'`), frame anything or be framed, submit a form, start a
worker, retarget relative URLs with a base tag, or load a remote script,
stylesheet or font. Images and media may load over https or as data URIs.

What it does not guarantee: it cannot block same-origin storage, so a draft can
read and write `localStorage`, `sessionStorage` and cookies for your deployment
origin alongside every other draft you host there. It also does nothing for
non-browser clients; `curl` gets the bytes verbatim. Treat the upload policy in
`src/html-policy.js`, not the CSP, as the real gate.

The upload and download pages (`/u/<slug>`, `/s/<slug>`) are the server's own
HTML rather than uploaded HTML, and they need cross-origin fetch, PUT and framing
against S3, so they are not covered by this policy.

## What changed from upstream

- `express` + `pg` + `@aws-sdk/client-s3` + `jose` are gone; Convex serves the API
  and holds drafts and versions.
- HTML goes to S3 addressed by content hash, so re-uploading identical HTML is
  idempotent.
- `src/html-policy.js` is unchanged apart from `Buffer.byteLength` becoming
  `TextEncoder`, since Convex is V8 without Node globals. It is still enforced
  server side.
