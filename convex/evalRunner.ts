"use node";

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { DEFAULT_BUCKETS } from "./prompts";
import type { ClassifyBatchResult } from "./classify";
import { computeAccuracy, computePerBucketAccuracy } from "./evalScoring";
import type { Id } from "./_generated/dataModel";

const BATCH_SIZE = 10;

// Public: fire-and-forget. Resolve the prompt template + bucket set, create
// one evalRuns row per model in "running" state, then schedule each model's
// actual work as a background internal action. Returns immediately so the
// websocket doesn't hang while 7 models classify in parallel.
//
// The UI subscribes to listRuns and watches rows flip from "running" to
// "completed" / "failed" as each background action finishes.
export const runBench = action({
  args: {
    datasetId: v.id("evalDatasets"),
    modelIds: v.array(v.string()),
    promptVersionId: v.optional(v.id("promptVersions")),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ runIds: Id<"evalRuns">[] }> => {
    const dataset = await ctx.runQuery(
      internal.evalsDb.getDatasetEmailsInternal,
      { datasetId: args.datasetId },
    );
    if (dataset.length === 0) {
      throw new Error("Dataset is empty");
    }

    // Resolve the prompt version once for all models in this bench so they
    // all run against the same template.
    let promptVersionId = args.promptVersionId ?? null;
    let promptTemplate: string | undefined;
    if (promptVersionId) {
      const pv = await ctx.runQuery(internal.promptVersions.getById, {
        id: promptVersionId,
      });
      promptTemplate = pv?.template;
    } else {
      const pv = await ctx.runQuery(internal.promptVersions.latest, {});
      if (pv) {
        promptVersionId = pv._id;
        promptTemplate = pv.template;
      } else {
        promptVersionId = await ctx.runMutation(
          internal.promptVersions.seedDefaultVersion,
          {},
        );
      }
    }

    // Create the "running" rows synchronously so the UI sees them appear
    // the instant Run bench is clicked.
    const runIds: Id<"evalRuns">[] = [];
    for (const modelId of args.modelIds) {
      const runId: Id<"evalRuns"> = await ctx.runMutation(
        internal.evalsDb.startRun,
        {
          datasetId: args.datasetId,
          model: modelId,
          promptVersionId: promptVersionId ?? undefined,
        },
      );
      runIds.push(runId);
      // Schedule the actual classification work as a separate background
      // action — the parent action returns without waiting for it.
      await ctx.scheduler.runAfter(0, internal.evalRunner.runOneModel, {
        runId,
        datasetId: args.datasetId,
        modelId,
        promptTemplate,
      });
    }
    return { runIds };
  },
});

// Internal: classify the entire dataset with one model and write aggregate
// + per-email results. Runs in the background so the parent runBench action
// can return immediately.
export const runOneModel = internalAction({
  args: {
    runId: v.id("evalRuns"),
    datasetId: v.id("evalDatasets"),
    modelId: v.string(),
    promptTemplate: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    try {
      const dataset = (await ctx.runQuery(
        internal.evalsDb.getDatasetEmailsInternal,
        { datasetId: args.datasetId },
      )) as Array<{
        _id: Id<"evalDatasetEmails">;
        subject: string;
        from: string;
        snippet: string;
        expectedBucket: string;
      }>;

      const batches: typeof dataset[] = [];
      for (let i = 0; i < dataset.length; i += BATCH_SIZE) {
        batches.push(dataset.slice(i, i + BATCH_SIZE));
      }

      const allResults: {
        datasetEmailId: Id<"evalDatasetEmails">;
        predictedBucket: string;
        expectedBucket: string;
        correct: boolean;
        reason?: string;
        latencyMs: number;
      }[] = [];
      let totalLatencyMs = 0;
      let totalCostUsd = 0;
      let batchCount = 0;

      // Sequential batches per model (LLM rate-limit friendly); models are
      // already parallel across each other via separate scheduled actions.
      for (const batch of batches) {
        const res = (await ctx.runAction(internal.classify.classifyBatch, {
          modelId: args.modelId,
          buckets: DEFAULT_BUCKETS.map((b) => ({
            name: b.name,
            description: b.description,
          })),
          emails: batch.map((e) => ({
            id: e._id,
            subject: e.subject,
            from: e.from,
            snippet: e.snippet,
          })),
          promptTemplate: args.promptTemplate,
        })) as ClassifyBatchResult;
        totalLatencyMs += res.latencyMs;
        totalCostUsd += res.costUsd;
        batchCount += 1;

        const byId = new Map(res.predictions.map((p) => [p.id, p]));
        for (const e of batch) {
          const p = byId.get(e._id);
          const predictedBucket = p?.bucket ?? "(no prediction)";
          allResults.push({
            datasetEmailId: e._id,
            predictedBucket,
            expectedBucket: e.expectedBucket,
            correct: predictedBucket === e.expectedBucket,
            reason: p?.reason,
            latencyMs: res.latencyMs / batch.length,
          });
        }
      }

      const accuracy = computeAccuracy(allResults);
      const perBucketAccuracy = computePerBucketAccuracy(
        allResults,
        DEFAULT_BUCKETS.map((b) => b.name),
      );

      await ctx.runMutation(internal.evalsDb.writeRunResults, {
        runId: args.runId,
        results: allResults,
      });
      await ctx.runMutation(internal.evalsDb.completeRun, {
        runId: args.runId,
        accuracy,
        perBucketAccuracy,
        avgLatencyMs: batchCount === 0 ? 0 : totalLatencyMs / batchCount,
        totalCostUsd,
      });
    } catch (err) {
      await ctx.runMutation(internal.evalsDb.failRun, {
        runId: args.runId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
});

// Expose the model registry to the UI.
export const listModels = action({
  args: {},
  handler: async () => {
    const { MODELS } = await import("./models");
    return MODELS.map((m) => ({
      id: m.id,
      label: m.label,
      provider: m.provider,
      inputUsdPerM: m.inputUsdPerM,
      outputUsdPerM: m.outputUsdPerM,
    }));
  },
});
