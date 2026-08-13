# postplan-aryan

Publish a self-contained HTML document and get a link back. A fork of
[postplan](https://www.npmjs.com/package/postplan) (MIT, t3dotgg) with the
express + Postgres + S3 server replaced by **Convex** functions and tables.

```bash
npx postplan-aryan auth set <api-key> --api-url https://<your-deployment>.convex.site
npx postplan-aryan upload plan.html
```

The CLI is upstream's, unmodified. No deployment is baked into the published
package: it reads `--api-url`, then `POSTPLAN_API_URL`, then
`~/.postplan/config.json`. Point it at your own instance.

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

## What changed from upstream

- `express` + `pg` + `@aws-sdk/client-s3` + `jose` are gone; Convex serves the API
  and holds drafts and versions.
- HTML goes to S3 addressed by content hash, so re-uploading identical HTML is
  idempotent.
- `src/html-policy.js` is unchanged apart from `Buffer.byteLength` becoming
  `TextEncoder`, since Convex is V8 without Node globals. It is still enforced
  server side.
