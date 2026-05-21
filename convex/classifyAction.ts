"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { getModel } from "./models";
import { buildClassificationSystemPrompt } from "./prompts";
import type { Id } from "./_generated/dataModel";

// Classify a batch of real inbox emails (resolved from emailIds) against the
// user's current bucket set. Writes results back via writeClassifications.
// On batch-level failure, marks the emails as "failed" — we don't want a
// transient LLM error to crater the entire workflow.
export const classifyEmailBatch = internalAction({
  args: {
    emailIds: v.array(v.id("emails")),
    modelId: v.string(),
  },
  handler: async (ctx, args): Promise<{ classified: number; failed: number }> => {
    if (args.emailIds.length === 0) {
      return { classified: 0, failed: 0 };
    }
    const emails = (await ctx.runQuery(internal.inbox.getEmailsByIds, {
      emailIds: args.emailIds,
    })) as Array<{
      _id: Id<"emails">;
      userId: Id<"users">;
      subject: string;
      from: string;
      snippet: string;
    }>;
    if (emails.length === 0) return { classified: 0, failed: 0 };

    const userId = emails[0].userId;
    const [buckets, latestPrompt] = await Promise.all([
      ctx.runQuery(internal.inbox.getBuckets, { userId }) as Promise<
        Array<{
          _id: Id<"buckets">;
          name: string;
          description: string;
        }>
      >,
      ctx.runQuery(internal.promptVersions.latest, {}) as Promise<{
        template: string;
      } | null>,
    ]);

    const bucketByName = new Map(buckets.map((b) => [b.name, b._id]));
    const cfg = getModel(args.modelId);
    const model =
      cfg.provider === "openai"
        ? openai(cfg.apiModel)
        : cfg.provider === "anthropic"
          ? anthropic(cfg.apiModel)
          : google(cfg.apiModel);

    const system = buildClassificationSystemPrompt(
      buckets.map((b) => ({ name: b.name, description: b.description })),
      latestPrompt?.template,
    );
    const bucketNames = buckets.map((b) => b.name) as [string, ...string[]];
    const schema = z.object({
      predictions: z.array(
        z.object({
          id: z.string(),
          bucket: z.enum(bucketNames),
          reason: z.string(),
        }),
      ),
    });

    const userPrompt =
      "Classify each of the following emails. Return one prediction per email, " +
      "in the same order, with the `id` field copied through unchanged.\n\n" +
      emails
        .map(
          (e) =>
            `Email (id: ${e._id})\nFrom: ${e.from}\nSubject: ${e.subject}\nSnippet: ${e.snippet}`,
        )
        .join("\n\n");

    // Retry transient failures (rate limits, brief network blips, malformed
    // first response) with exponential backoff before giving up. Most prod
    // classification failures we see are transient.
    const MAX_ATTEMPTS = 3;
    const BACKOFF_MS = [0, 1000, 3000];
    let lastErr: unknown = null;
    let object: { predictions: Array<{ id: string; bucket: string; reason: string }> } | null = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (BACKOFF_MS[attempt] > 0) {
        await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]));
      }
      try {
        const result = await generateObject({
          model,
          schema,
          system,
          prompt: userPrompt,
        });
        object = result.object;
        break;
      } catch (err) {
        lastErr = err;
        console.warn(
          `classifyEmailBatch attempt ${attempt + 1}/${MAX_ATTEMPTS} failed for ${args.modelId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    if (!object) {
      // All retries exhausted — surface failure. markClassificationFailed
      // preserves any prior bucket the email already had.
      await ctx.runMutation(internal.inbox.markClassificationFailed, {
        emailIds: emails.map((e) => e._id),
        error: lastErr instanceof Error ? lastErr.message : String(lastErr),
      });
      return { classified: 0, failed: emails.length };
    }

    try {
      const byId = new Map(object.predictions.map((p) => [p.id, p]));
      const results: {
        emailId: Id<"emails">;
        bucketId: Id<"buckets">;
        reason: string;
        model: string;
      }[] = [];
      const unmapped: Id<"emails">[] = [];
      for (const e of emails) {
        const p = byId.get(e._id);
        if (!p) {
          unmapped.push(e._id);
          continue;
        }
        const bucketId = bucketByName.get(p.bucket);
        if (!bucketId) {
          unmapped.push(e._id);
          continue;
        }
        results.push({
          emailId: e._id,
          bucketId,
          reason: p.reason,
          model: args.modelId,
        });
      }
      if (results.length > 0) {
        await ctx.runMutation(internal.inbox.writeClassifications, {
          results,
        });
      }
      if (unmapped.length > 0) {
        await ctx.runMutation(internal.inbox.markClassificationFailed, {
          emailIds: unmapped,
          error: "Classifier returned no/unknown bucket for email",
        });
      }
      return { classified: results.length, failed: unmapped.length };
    } catch (err) {
      // Post-LLM bookkeeping failed (rare — would be a Convex write error,
      // not a model error). Don't retry the LLM call; just surface.
      await ctx.runMutation(internal.inbox.markClassificationFailed, {
        emailIds: emails.map((e) => e._id),
        error: err instanceof Error ? err.message : String(err),
      });
      return { classified: 0, failed: emails.length };
    }
  },
});

