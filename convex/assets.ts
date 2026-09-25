import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

/** Rows for `postplan asset`. The HTTP routes in http.ts are the only callers. */

export const create = internalMutation({
  args: {
    slug: v.string(),
    key: v.string(),
    bucket: v.string(),
    visibility: v.union(v.literal("public"), v.literal("private")),
    project: v.string(),
    name: v.string(),
    size: v.number(),
    contentType: v.string(),
    expiresAt: v.optional(v.number()),
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    const clash = await ctx.db
      .query("assets")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (clash) throw new Error(`slug already in use: ${args.slug}`);
    await ctx.db.insert("assets", args);
    return null;
  },
});

export const bySlug = internalQuery({
  args: { slug: v.string() },
  handler: async (ctx, args) =>
    ctx.db
      .query("assets")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique(),
});

export const byKey = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, args) =>
    ctx.db
      .query("assets")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first(),
});

/** The caller's assets, newest first. */
export const list = internalQuery({
  args: { createdBy: v.string() },
  handler: async (ctx, args) =>
    ctx.db
      .query("assets")
      .withIndex("by_createdBy", (q) => q.eq("createdBy", args.createdBy))
      .order("desc")
      .take(500),
});

export const remove = internalMutation({
  args: { id: v.id("assets") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
    return null;
  },
});
