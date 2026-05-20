"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { DEFAULT_BUCKETS } from "./prompts";
import type { ClassifyBatchResult } from "./classify";
import type { Id } from "./_generated/dataModel";

const BATCH_SIZE = 10;

// Launch one eval run per selected model. Each model classifies the entire
// dataset in batches of 10 emails. Results land in evalRunResults and the
// aggregate row in evalRuns. Returns the run ids so the UI can subscribe.
export const runBench = action({
  args: {
    datasetId: v.id("evalDatasets"),
    modelIds: v.array(v.string()),
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

    const runIds: Id<"evalRuns">[] = [];

    // One run per model, but run all models concurrently.
    await Promise.all(
      args.modelIds.map(async (modelId): Promise<void> => {
        const runId: Id<"evalRuns"> = await ctx.runMutation(
          internal.evalsDb.startRun,
          { datasetId: args.datasetId, model: modelId },
        );
        runIds.push(runId);

        try {
          // Split into batches.
          const batches: typeof dataset[] = [];
          for (let i = 0; i < dataset.length; i += BATCH_SIZE) {
            batches.push(dataset.slice(i, i + BATCH_SIZE));
          }

          // Run batches sequentially for a given model (rate-limit friendly);
          // models are still parallel with each other above.
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

          for (const batch of batches) {
            const res = (await ctx.runAction(
              internal.classify.classifyBatch,
              {
                modelId,
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
              },
            )) as ClassifyBatchResult;
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

          // Aggregate.
          const correct = allResults.filter((r) => r.correct).length;
          const accuracy = correct / allResults.length;
          const perBucketAccuracy: Record<string, number> = {};
          for (const b of DEFAULT_BUCKETS) {
            const inBucket = allResults.filter(
              (r) => r.expectedBucket === b.name,
            );
            perBucketAccuracy[b.name] =
              inBucket.length === 0
                ? 0
                : inBucket.filter((r) => r.correct).length / inBucket.length;
          }

          await ctx.runMutation(internal.evalsDb.writeRunResults, {
            runId,
            results: allResults,
          });
          await ctx.runMutation(internal.evalsDb.completeRun, {
            runId,
            accuracy,
            perBucketAccuracy,
            avgLatencyMs: totalLatencyMs / batchCount,
            totalCostUsd,
          });
        } catch (err) {
          await ctx.runMutation(internal.evalsDb.failRun, {
            runId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }),
    );

    return { runIds };
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
