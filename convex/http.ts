import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { validateHtml } from "../src/html-policy.js";
import { draftKey, presign, s3Config } from "./lib/s3";
import { uploadPage } from "./lib/uploadPage";

/**
 * The Postplan API, served by Convex instead of express + Postgres + S3.
 *
 * The CLI (`npx postplan upload`) speaks exactly three endpoints, so those are
 * reproduced byte-for-byte in shape. Convex functions replace express and Convex
 * tables replace Postgres; the HTML itself goes to S3, which removes Railway and
 * Postgres but keeps the bytes somewhere Aryan owns.
 */

const MAX_HTML_BYTES = Number(process.env.MAX_HTML_BYTES ?? 512 * 1024);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * Bearer auth. With POSTPLAN_API_KEY set, a matching key is required; without
 * it the deployment is open, which is fine for a single-user instance and is
 * how the CLI already behaves (it only sends the header when a key exists).
 */
function authorize(request: Request): { ok: true; account: string } | { ok: false } {
  const expected = process.env.POSTPLAN_API_KEY;
  if (!expected) return { ok: true, account: "open" };
  const header = request.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return token && token === expected ? { ok: true, account: "owner" } : { ok: false };
}

function baseUrl(request: Request): string {
  return process.env.POSTPLAN_PUBLIC_BASE_URL ?? new URL(request.url).origin;
}

/** Unguessable id: the URL is the credential, so it must not be enumerable. */
function newDraftId(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

const http = httpRouter();

http.route({
  path: "/api/me",
  method: "GET",
  handler: httpAction(async (_ctx, request) => {
    const auth = authorize(request);
    if (!auth.ok) return json({ error: "Unauthorized." }, 401);
    return json({ account_id: auth.account, plan: "self-hosted", backend: "convex" });
  }),
});

http.route({
  path: "/api/uploads",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const auth = authorize(request);
    if (!auth.ok) return json({ error: "Unauthorized." }, 401);

    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null) return json({ error: "Invalid body." }, 400);
    const { html, filename, draftId, description, metadata } = body as Record<string, unknown>;

    if (typeof html !== "string" || !html.trim()) {
      return json({ error: "html is required." }, 400);
    }
    if (typeof filename !== "string" || !filename.trim()) {
      return json({ error: "filename is required." }, 400);
    }
    const bytes = new TextEncoder().encode(html).length;
    if (bytes > MAX_HTML_BYTES) {
      return json(
        { error: `HTML exceeds ${MAX_HTML_BYTES} bytes.`, errors: [`Got ${bytes} bytes.`] },
        413,
      );
    }

    // Re-validate server side. The CLI checks too, but a client check is only a
    // convenience -- this HTML is served from our own origin.
    const validation = validateHtml(html, {});
    if (!validation.ok) {
      return json({ error: "HTML failed Postplan validation.", errors: validation.errors }, 400);
    }

    const id = typeof draftId === "string" && draftId ? draftId : newDraftId();

    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(html));
    const sha256 = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");

    // Bytes go to S3, addressed by content hash: uploading the same HTML twice
    // is idempotent, and a failed PUT leaves no row pointing at nothing.
    const config = s3Config();
    const key = draftKey(config, id, sha256);
    const put = await fetch(await presign(config, "PUT", key, 300), {
      method: "PUT",
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: html,
    });
    if (!put.ok) return json({ error: `Storage upload failed (${put.status}).` }, 502);

    const { versionNumber } = await ctx.runMutation(internal.drafts.upsert, {
      draftId: id,
      filename,
      description: typeof description === "string" ? description : undefined,
      key,
      sha256,
      bytes,
      metadata: metadata ?? undefined,
      createdBy: auth.account,
    });

    const publicUrl = `${baseUrl(request)}/d/${id}`;
    return json({
      draftId: id,
      publicUrl,
      rawUrl: `${publicUrl}/raw`,
      versionNumber,
      warnings: validation.warnings ?? [],
    });
  }),
});

http.route({
  path: "/api/drafts",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const auth = authorize(request);
    if (!auth.ok) return json({ error: "Unauthorized." }, 401);
    return json({ drafts: await ctx.runQuery(internal.drafts.list, {}) });
  }),
});

/**
 * Upload requests. The page and its two endpoints are deliberately unauthenticated:
 * the slug is the credential, because whoever uploads is often not the person who
 * generated the link. Creating and reading a request still requires the API key.
 */
http.route({
  path: "/api/upload-requests",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const auth = authorize(request);
    if (!auth.ok) return json({ error: "Unauthorized." }, 401);
    const body: unknown = await request.json();
    const { reason, days } = (body ?? {}) as Record<string, unknown>;
    const slug = newDraftId();
    await ctx.runMutation(internal.uploads.create, {
      slug,
      reason: typeof reason === "string" && reason.trim() ? reason.trim() : undefined,
      createdBy: auth.account,
      days: typeof days === "number" ? days : 7,
    });
    return json({ slug, url: `${baseUrl(request)}/u/${slug}` });
  }),
});

http.route({
  path: "/api/upload-requests/list",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const auth = authorize(request);
    if (!auth.ok) return json({ error: "Unauthorized." }, 401);
    const body: unknown = await request.json();
    const { slug } = (body ?? {}) as Record<string, unknown>;
    if (typeof slug !== "string") return json({ error: "slug is required." }, 400);
    const found = await ctx.runQuery(internal.uploads.bySlug, { slug });
    if (!found) return json({ error: "no such upload link" }, 404);
    const config = s3Config();
    const files = await Promise.all(
      found.files.map(async (f) => ({
        name: f.name,
        size: f.size,
        contentType: f.contentType,
        url: await presign(config, "GET", f.key, 3600),
      })),
    );
    return json({ slug, reason: found.request.reason ?? null, expiresAt: found.request.expiresAt, files });
  }),
});

/** Mint a presigned PUT for the phone. No API key: the slug is the credential. */
http.route({
  pathPrefix: "/api/u/",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const path = new URL(request.url).pathname;
    const match = path.match(/^\/api\/u\/([^/]+)\/(sign|record)$/);
    if (!match) return json({ error: "Not found." }, 404);
    const [, slug, action] = match;

    const found = await ctx.runQuery(internal.uploads.bySlug, { slug });
    if (!found) return json({ error: "no such upload link" }, 404);
    if (found.request.expiresAt < Date.now()) return json({ error: "this link has expired" }, 410);

    const body: unknown = await request.json();
    const fields = (body ?? {}) as Record<string, unknown>;

    if (action === "sign") {
      const { name, contentType } = fields;
      if (typeof name !== "string" || typeof contentType !== "string") {
        return json({ error: "name and contentType are required." }, 400);
      }
      const config = s3Config();
      const suffix = name.includes(".") ? name.slice(name.lastIndexOf(".")).toLowerCase().slice(0, 20) : "";
      const key = `${config.prefix}/uploads/${slug}/${found.files.length + 1}${suffix}`;
      return json({ key, url: await presign(config, "PUT", key, 3600) });
    }

    const { key, name, size, contentType } = fields;
    if (typeof key !== "string" || typeof name !== "string" || typeof size !== "number" || typeof contentType !== "string") {
      return json({ error: "key, name, size and contentType are required." }, 400);
    }
    await ctx.runMutation(internal.uploads.addFile, { slug, key, name, size, contentType });
    return json({ ok: true });
  }),
});

/** The page itself. */
http.route({
  pathPrefix: "/u/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const slug = decodeURIComponent(new URL(request.url).pathname.slice("/u/".length).replace(/\/+$/, ""));
    const found = await ctx.runQuery(internal.uploads.bySlug, { slug });
    const page = (body: string, status: number) =>
      new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
    if (!found) {
      return page("<!doctype html><meta charset=utf-8><title>Not found</title><body style='background:#000;color:#71717a;font:16px system-ui;padding:48px'>That link is not valid any more.", 404);
    }
    if (found.request.expiresAt < Date.now()) {
      return page("<!doctype html><meta charset=utf-8><title>Expired</title><body style='background:#000;color:#71717a;font:16px system-ui;padding:48px'>This upload link has expired.", 410);
    }
    return page(uploadPage(slug, found.request.reason, found.files), 200);
  }),
});

/** The published document. Serving it here keeps the URL stable across versions. */
async function serveDraft(ctx: any, request: Request, raw: boolean): Promise<Response> {
  const path = new URL(request.url).pathname;
  const id = decodeURIComponent(
    path.slice("/d/".length).replace(/\/raw$/, "").replace(/\/+$/, ""),
  );
  const found = await ctx.runQuery(internal.drafts.latest, { draftId: id });
  if (!found) {
    return new Response("<!doctype html><meta charset=utf-8><title>Not found</title>"
      + "<body style='background:#000;color:#888;font:16px system-ui;padding:48px'>No such draft.",
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
  const config = s3Config();
  const upstream = await fetch(await presign(config, "GET", found.version.key, 120));
  if (!upstream.ok) return new Response("Draft content missing", { status: 502 });
  return new Response(await upstream.text(), {
    status: 200,
    headers: {
      "Content-Type": raw ? "text/plain; charset=utf-8" : "text/html; charset=utf-8",
      "Cache-Control": "private, max-age=30",
      "X-Postplan-Version": String(found.version.versionNumber),
    },
  });
}

http.route({
  pathPrefix: "/d/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const raw = new URL(request.url).pathname.endsWith("/raw");
    return await serveDraft(ctx, request, raw);
  }),
});

export default http;
