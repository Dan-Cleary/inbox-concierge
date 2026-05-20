import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const emailInput = v.object({
  subject: v.string(),
  from: v.string(),
  snippet: v.string(),
  expectedBucket: v.string(),
  rationale: v.optional(v.string()),
});

export const createDataset = internalMutation({
  args: {
    notes: v.optional(v.string()),
    emails: v.array(emailInput),
  },
  handler: async (ctx, args): Promise<Id<"evalDatasets">> => {
    const version = `v${Date.now()}`;
    const datasetId = await ctx.db.insert("evalDatasets", {
      version,
      generatedAt: Date.now(),
      notes: args.notes,
    });
    for (const e of args.emails) {
      await ctx.db.insert("evalDatasetEmails", {
        datasetId,
        subject: e.subject,
        from: e.from,
        snippet: e.snippet,
        expectedBucket: e.expectedBucket,
        rationale: e.rationale,
        reviewed: false,
      });
    }
    return datasetId;
  },
});

export const listDatasets = query({
  args: {},
  handler: async (ctx) => {
    const datasets = await ctx.db.query("evalDatasets").collect();
    return datasets
      .sort((a, b) => b.generatedAt - a.generatedAt)
      .map((d) => ({
        _id: d._id,
        version: d.version,
        generatedAt: d.generatedAt,
        reviewedAt: d.reviewedAt,
        notes: d.notes,
      }));
  },
});

export const getDatasetEmails = query({
  args: { datasetId: v.id("evalDatasets") },
  handler: async (ctx, { datasetId }) => {
    return ctx.db
      .query("evalDatasetEmails")
      .withIndex("by_dataset", (q) => q.eq("datasetId", datasetId))
      .collect();
  },
});

export const getDatasetEmailsInternal = internalQuery({
  args: { datasetId: v.id("evalDatasets") },
  handler: async (ctx, { datasetId }) => {
    return ctx.db
      .query("evalDatasetEmails")
      .withIndex("by_dataset", (q) => q.eq("datasetId", datasetId))
      .collect();
  },
});

export const updateDatasetEmail = mutation({
  args: {
    emailId: v.id("evalDatasetEmails"),
    expectedBucket: v.optional(v.string()),
    subject: v.optional(v.string()),
    snippet: v.optional(v.string()),
    from: v.optional(v.string()),
    reviewed: v.optional(v.boolean()),
  },
  handler: async (ctx, { emailId, ...rest }) => {
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined) patch[k] = v;
    }
    await ctx.db.patch(emailId, patch);
  },
});

export const markDatasetReviewed = mutation({
  args: { datasetId: v.id("evalDatasets") },
  handler: async (ctx, { datasetId }) => {
    await ctx.db.patch(datasetId, { reviewedAt: Date.now() });
  },
});

export const deleteDataset = mutation({
  args: { datasetId: v.id("evalDatasets") },
  handler: async (ctx, { datasetId }) => {
    const emails = await ctx.db
      .query("evalDatasetEmails")
      .withIndex("by_dataset", (q) => q.eq("datasetId", datasetId))
      .collect();
    for (const e of emails) await ctx.db.delete(e._id);
    await ctx.db.delete(datasetId);
  },
});

// ----- Runs -----

export const startRun = internalMutation({
  args: {
    datasetId: v.id("evalDatasets"),
    model: v.string(),
  },
  handler: async (ctx, args): Promise<Id<"evalRuns">> => {
    return ctx.db.insert("evalRuns", {
      datasetId: args.datasetId,
      model: args.model,
      startedAt: Date.now(),
      status: "running",
    });
  },
});

export const completeRun = internalMutation({
  args: {
    runId: v.id("evalRuns"),
    accuracy: v.number(),
    perBucketAccuracy: v.record(v.string(), v.number()),
    avgLatencyMs: v.number(),
    totalCostUsd: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      status: "completed",
      completedAt: Date.now(),
      accuracy: args.accuracy,
      perBucketAccuracy: args.perBucketAccuracy,
      avgLatencyMs: args.avgLatencyMs,
      totalCostUsd: args.totalCostUsd,
    });
  },
});

export const failRun = internalMutation({
  args: { runId: v.id("evalRuns"), error: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      status: "failed",
      completedAt: Date.now(),
    });
    console.error(`Run ${args.runId} failed: ${args.error}`);
  },
});

export const writeRunResults = internalMutation({
  args: {
    runId: v.id("evalRuns"),
    results: v.array(
      v.object({
        datasetEmailId: v.id("evalDatasetEmails"),
        predictedBucket: v.string(),
        expectedBucket: v.string(),
        correct: v.boolean(),
        reason: v.optional(v.string()),
        latencyMs: v.number(),
      }),
    ),
  },
  handler: async (ctx, { runId, results }) => {
    for (const r of results) {
      await ctx.db.insert("evalRunResults", { runId, ...r });
    }
  },
});

export const listRuns = query({
  args: { datasetId: v.optional(v.id("evalDatasets")) },
  handler: async (ctx, { datasetId }) => {
    const runs = datasetId
      ? await ctx.db
          .query("evalRuns")
          .withIndex("by_dataset", (q) => q.eq("datasetId", datasetId))
          .collect()
      : await ctx.db.query("evalRuns").collect();
    return runs.sort((a, b) => b.startedAt - a.startedAt);
  },
});

export const getRunResults = query({
  args: { runId: v.id("evalRuns") },
  handler: async (ctx, { runId }) => {
    return ctx.db
      .query("evalRunResults")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect();
  },
});
