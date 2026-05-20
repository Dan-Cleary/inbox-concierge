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
    generatorModel: v.optional(v.string()),
    emails: v.array(emailInput),
  },
  handler: async (ctx, args): Promise<Id<"evalDatasets">> => {
    // Refuse to create a new dataset if any existing one is locked — the
    // user has explicitly committed to a canonical set, don't shadow it.
    const existing = await ctx.db.query("evalDatasets").collect();
    const lockedExists = existing.some((d) => d.locked === true);
    if (lockedExists) {
      throw new Error(
        "A locked dataset already exists. Unlock or delete it before generating a new one.",
      );
    }

    const version = `v${Date.now()}`;
    const datasetId = await ctx.db.insert("evalDatasets", {
      version,
      generatedAt: Date.now(),
      notes: args.notes,
      generatorModel: args.generatorModel,
      locked: false,
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
        generatorModel: d.generatorModel,
        locked: d.locked === true,
        lockedAt: d.lockedAt,
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
    const email = await ctx.db.get(emailId);
    if (!email) throw new Error("Email not found");
    const dataset = await ctx.db.get(email.datasetId);
    if (dataset?.locked) {
      throw new Error("Dataset is locked; unlock to edit labels.");
    }
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

export const lockDataset = mutation({
  args: { datasetId: v.id("evalDatasets") },
  handler: async (ctx, { datasetId }) => {
    await ctx.db.patch(datasetId, {
      locked: true,
      lockedAt: Date.now(),
      reviewedAt: Date.now(),
    });
  },
});

export const unlockDataset = mutation({
  args: { datasetId: v.id("evalDatasets") },
  handler: async (ctx, { datasetId }) => {
    await ctx.db.patch(datasetId, { locked: false });
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
    promptVersionId: v.optional(v.id("promptVersions")),
  },
  handler: async (ctx, args): Promise<Id<"evalRuns">> => {
    return ctx.db.insert("evalRuns", {
      datasetId: args.datasetId,
      model: args.model,
      promptVersionId: args.promptVersionId,
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
    const results = await ctx.db
      .query("evalRunResults")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect();
    // Join in dataset email content so the inspector can show subject/from/
    // snippet without a second round-trip.
    return Promise.all(
      results.map(async (r) => {
        const email = await ctx.db.get(r.datasetEmailId);
        return {
          ...r,
          email: email
            ? {
                subject: email.subject,
                from: email.from,
                snippet: email.snippet,
              }
            : null,
        };
      }),
    );
  },
});
