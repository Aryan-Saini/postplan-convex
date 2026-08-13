import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // A draft is a stable URL. Re-uploading the same file updates it in place and
  // adds a version, which is the whole point of the CLI's draftId round-trip.
  drafts: defineTable({
    draftId: v.string(),
    filename: v.string(),
    description: v.optional(v.string()),
    latestVersion: v.number(),
    createdBy: v.string(),
    updatedAt: v.number(),
  }).index("by_draftId", ["draftId"]),

  versions: defineTable({
    draftId: v.string(),
    versionNumber: v.number(),
    key: v.string(),
    sha256: v.optional(v.string()),
    bytes: v.number(),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_draft", ["draftId"])
    .index("by_draft_version", ["draftId", "versionNumber"]),
});
