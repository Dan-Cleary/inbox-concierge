import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { DEFAULT_PROMPT_TEMPLATE } from "./prompts";

// List prompt versions, newest first. Used by the bench UI to pick which
// prompt to run with.
export const list = query({
  args: {},
  handler: async (ctx) => {
    const versions = await ctx.db.query("promptVersions").collect();
    return versions.sort((a, b) => b.createdAt - a.createdAt);
  },
});

// Latest prompt version. Used by classifyEmailBatch as the default when a
// run doesn't specify one explicitly.
export const latest = internalQuery({
  args: {},
  handler: async (ctx) => {
    const versions = await ctx.db.query("promptVersions").collect();
    if (versions.length === 0) return null;
    return versions.sort((a, b) => b.createdAt - a.createdAt)[0];
  },
});

export const getById = internalQuery({
  args: { id: v.id("promptVersions") },
  handler: async (ctx, { id }) => {
    return ctx.db.get(id);
  },
});

// Create a new prompt version. Each save creates a new row — versions are
// append-only so eval runs always have a stable reference.
export const create = mutation({
  args: {
    label: v.string(),
    template: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!args.template.includes("{{BUCKETS}}")) {
      throw new Error("Template must contain the `{{BUCKETS}}` placeholder.");
    }
    return ctx.db.insert("promptVersions", {
      label: args.label,
      template: args.template,
      notes: args.notes,
      createdAt: Date.now(),
    });
  },
});

// Idempotently seed the initial prompt version on first use of the UI.
export const seedDefaultVersion = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("promptVersions").collect();
    if (existing.length > 0) return existing[0]._id;
    return ctx.db.insert("promptVersions", {
      label: "v1 (default)",
      template: DEFAULT_PROMPT_TEMPLATE,
      createdAt: Date.now(),
      notes: "Initial prompt — seeded from DEFAULT_PROMPT_TEMPLATE.",
    });
  },
});
