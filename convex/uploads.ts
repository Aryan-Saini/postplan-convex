import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";


export const create = internalMutation({
  args: {
    slug: v.string(),
    reason: v.optional(v.string()),
    createdBy: v.string(),
    days: v.number(),
    direction: v.optional(v.union(v.literal("in"), v.literal("out"))),
  },
  handler: async (ctx, args) => {
    const clash = await ctx.db
      .query("uploadRequests")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (clash) throw new Error(`slug already in use: ${args.slug}`);
    await ctx.db.insert("uploadRequests", {
      slug: args.slug,
      direction: args.direction ?? "in",
      reason: args.reason,
      createdBy: args.createdBy,
      expiresAt: Date.now() + (args.days || 7) * 24 * 60 * 60 * 1000,
    });
    return { slug: args.slug };
  },
});

export const bySlug = internalQuery({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    // The slug is the handle; the Convex document id is a fallback so a link
    // still resolves if the slug is ever lost or rewritten.
    let request = await ctx.db
      .query("uploadRequests")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!request) {
      const id = ctx.db.normalizeId("uploadRequests", args.slug);
      request = id ? await ctx.db.get(id) : null;
    }
    if (!request) return null;
    const files = await ctx.db
      .query("uploadFiles")
      .withIndex("by_slug", (q) => q.eq("slug", request.slug))
      .collect();
    return { request, files };
  },
});

export const addFile = internalMutation({
  args: {
    slug: v.string(),
    key: v.string(),
    name: v.string(),
    size: v.number(),
    contentType: v.string(),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db
      .query("uploadRequests")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!request) throw new Error("no such upload request");
    if (request.expiresAt < Date.now()) throw new Error("this upload link has expired");
    await ctx.db.insert("uploadFiles", { ...args, uploadedAt: Date.now() });
    return null;
  },
});

export const remove = internalMutation({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const request = await ctx.db
      .query("uploadRequests")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!request) return { keys: [] as string[] };
    const files = await ctx.db
      .query("uploadFiles")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .collect();
    for (const f of files) await ctx.db.delete(f._id);
    await ctx.db.delete(request._id);
    return { keys: files.map((f) => f.key) };
  },
});
