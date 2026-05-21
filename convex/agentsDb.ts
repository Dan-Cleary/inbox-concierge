import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";

// Snapshot of the classified inbox shaped for the discovery agent's prompt.
// Returns only classified rows (so the agent isn't reasoning over in-flight
// rows) with their current bucket name resolved.
export const getClassifiedInboxForAgent = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const [emails, buckets] = await Promise.all([
      ctx.db
        .query("emails")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("buckets")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
    ]);
    const bucketName = new Map(buckets.map((b) => [b._id, b.name]));
    return emails
      .filter((e) => e.classifyStatus === "classified" && e.bucketId)
      .map((e) => ({
        _id: e._id,
        subject: e.subject,
        from: e.from,
        snippet: e.snippet,
        bucket: bucketName.get(e.bucketId!) ?? "(unknown)",
      }));
  },
});

export const insertSuggestion = internalMutation({
  args: {
    userId: v.id("users"),
    name: v.string(),
    description: v.string(),
    rationale: v.string(),
    sampleEmailIds: v.array(v.id("emails")),
  },
  handler: async (ctx, args): Promise<Id<"bucketSuggestions">> => {
    // Don't re-suggest something we already proposed and the user already
    // saw — they explicitly dismissed it (or already accepted it).
    const prior = await ctx.db
      .query("bucketSuggestions")
      .withIndex("by_user_status", (q) => q.eq("userId", args.userId))
      .collect();
    if (
      prior.some(
        (p) =>
          p.name.toLowerCase() === args.name.toLowerCase() &&
          p.status !== "pending",
      )
    ) {
      // Skip silently — return a no-op id by inserting and immediately
      // dismissing wouldn't be honest; instead we just don't write.
      throw new Error("suggestion already handled");
    }
    return ctx.db.insert("bucketSuggestions", {
      userId: args.userId,
      name: args.name,
      description: args.description,
      rationale: args.rationale,
      sampleEmailIds: args.sampleEmailIds,
      status: "pending",
      createdAt: Date.now(),
    });
  },
});

// Public: list pending suggestions for the signed-in user.
export const listPendingSuggestions = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const suggestions = await ctx.db
      .query("bucketSuggestions")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", userId).eq("status", "pending"),
      )
      .collect();
    // Hydrate sample emails so the UI can show subject/from for each.
    return Promise.all(
      suggestions.map(async (s) => {
        const samples = await Promise.all(
          s.sampleEmailIds.map(async (id) => {
            const e = await ctx.db.get(id);
            return e ? { subject: e.subject, from: e.from } : null;
          }),
        );
        return {
          ...s,
          samples: samples.filter((x): x is { subject: string; from: string } => x !== null),
        };
      }),
    );
  },
});

export const dismissSuggestion = mutation({
  args: { suggestionId: v.id("bucketSuggestions") },
  handler: async (ctx, { suggestionId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in");
    const s = await ctx.db.get(suggestionId);
    if (!s || s.userId !== userId) throw new Error("Not found");
    await ctx.db.patch(suggestionId, { status: "dismissed" });
  },
});

// Accept a suggestion: create the bucket and mark the suggestion accepted.
// Re-classification is kicked off by the caller (mutation cannot start a
// workflow + this mutation also needs to return the bucketId).
export const acceptSuggestion = mutation({
  args: { suggestionId: v.id("bucketSuggestions") },
  handler: async (ctx, { suggestionId }): Promise<Id<"buckets">> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in");
    const s = await ctx.db.get(suggestionId);
    if (!s || s.userId !== userId) throw new Error("Not found");
    if (s.status !== "pending") throw new Error("Already handled");

    const existing = await ctx.db
      .query("buckets")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    if (existing.some((b) => b.name.toLowerCase() === s.name.toLowerCase())) {
      throw new Error(`Bucket "${s.name}" already exists`);
    }
    const sortOrder =
      existing.reduce((max, b) => Math.max(max, b.sortOrder), -1) + 1;
    const bucketId = await ctx.db.insert("buckets", {
      userId,
      name: s.name,
      description: s.description,
      isDefault: false,
      sortOrder,
    });
    await ctx.db.patch(suggestionId, {
      status: "accepted",
      acceptedBucketId: bucketId,
    });
    return bucketId;
  },
});
