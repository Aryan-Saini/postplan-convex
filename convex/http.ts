import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { validateHtml } from "../src/html-policy.js";
import { draftKey, presign, s3Config } from "./lib/s3";

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
