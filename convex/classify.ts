"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { getModel } from "./models";
import { buildClassificationSystemPrompt } from "./prompts";

const emailInputValidator = v.object({
  // Stable id we echo back so the caller can join predictions to inputs
  // regardless of array order.
  id: v.string(),
  subject: v.string(),
  from: v.string(),
  snippet: v.string(),
});

export type EmailInput = {
  id: string;
  subject: string;
  from: string;
  snippet: string;
};

export type BucketInput = { name: string; description: string };

export type Prediction = {
  id: string;
  bucket: string;
  reason: string;
};

export type ClassifyBatchResult = {
  predictions: Prediction[];
  latencyMs: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  costUsd: number;
};

function providerModel(modelId: string) {
  const cfg = getModel(modelId);
  if (cfg.provider === "openai") return openai(cfg.apiModel);
  if (cfg.provider === "anthropic") return anthropic(cfg.apiModel);
  if (cfg.provider === "google") return google(cfg.apiModel);
  throw new Error(`Unsupported provider for model ${modelId}`);
}

export const classifyBatch = internalAction({
  args: {
    modelId: v.string(),
    buckets: v.array(
      v.object({ name: v.string(), description: v.string() }),
    ),
    emails: v.array(emailInputValidator),
  },
  handler: async (_ctx, args): Promise<ClassifyBatchResult> => {
    const system = buildClassificationSystemPrompt(args.buckets);
    const bucketNames = args.buckets.map((b) => b.name);
    const itemSchema = z.object({
      id: z.string(),
      bucket: z.enum(bucketNames as [string, ...string[]]),
      reason: z.string(),
    });
    const schema = z.object({
      predictions: z.array(itemSchema),
    });

    const userPrompt =
      "Classify each of the following emails. Return one prediction per email, " +
      "in the same order, with the `id` field copied through unchanged.\n\n" +
      args.emails
        .map(
          (e, i) =>
            `Email ${i + 1} (id: ${e.id})\nFrom: ${e.from}\nSubject: ${e.subject}\nSnippet: ${e.snippet}`,
        )
        .join("\n\n");

    const start = Date.now();
    const { object, usage } = await generateObject({
      model: providerModel(args.modelId),
      schema,
      system,
      prompt: userPrompt,
    });
    const latencyMs = Date.now() - start;

    const cfg = getModel(args.modelId);
    const inputTokens = usage.inputTokens ?? 0;
    const outputTokens = usage.outputTokens ?? 0;
    const totalTokens = usage.totalTokens ?? inputTokens + outputTokens;
    const costUsd =
      (inputTokens / 1_000_000) * cfg.inputUsdPerM +
      (outputTokens / 1_000_000) * cfg.outputUsdPerM;

    return {
      predictions: object.predictions,
      latencyMs,
      usage: { inputTokens, outputTokens, totalTokens },
      costUsd,
    };
  },
});
