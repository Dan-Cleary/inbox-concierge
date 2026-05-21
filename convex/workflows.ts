import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { WorkflowManager } from "@convex-dev/workflow";
import { components, internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";

const workflow = new WorkflowManager(components.workflow);

const BATCH_SIZE = 10;
const BATCH_CONCURRENCY = 3;
const DEFAULT_MODEL = "claude-haiku-4-5";

// Durable classification workflow. Splits the email set into batches of
// BATCH_SIZE and runs BATCH_CONCURRENCY batches in parallel so a long
// classification of 200 emails completes in ~30s instead of 5 min.
//
// If a batch fails, classifyEmailBatch marks those emails as "failed" rather
// than throwing; the workflow continues so a single bad batch doesn't kill
// the whole inbox.
export const classifyInboxWorkflow = workflow.define({
  args: {
    userId: v.id("users"),
    emailIds: v.array(v.id("emails")),
    modelId: v.string(),
    runDiscovery: v.optional(v.boolean()),
  },
  handler: async (step, args): Promise<void> => {
    const batches: Id<"emails">[][] = [];
    for (let i = 0; i < args.emailIds.length; i += BATCH_SIZE) {
      batches.push(args.emailIds.slice(i, i + BATCH_SIZE));
    }
    for (let i = 0; i < batches.length; i += BATCH_CONCURRENCY) {
      const wave = batches.slice(i, i + BATCH_CONCURRENCY);
      await Promise.all(
        wave.map((batch) =>
          step.runAction(internal.classifyAction.classifyEmailBatch, {
            emailIds: batch,
            modelId: args.modelId,
          }),
        ),
      );
    }
    // Post-classification: kick off RAG embedding (idempotent: only embeds
    // emails missing embeddingId) and optionally run bucket discovery.
    // Both run in parallel — embeddings don't depend on bucket discovery
    // and vice versa.
    await Promise.all([
      step.runAction(internal.rag.embedInbox, { userId: args.userId }),
      args.runDiscovery
        ? step.runAction(internal.agents.discoverBuckets, {
            userId: args.userId,
          })
        : Promise.resolve(),
    ]);
  },
});

// ----- Public mutations to kick off classification ------------------------

// Classify only emails currently marked "queued". Used after an initial
// inbox sync, when the user lands on the app and queued emails exist.
export const startClassification = mutation({
  args: { modelId: v.optional(v.string()) },
  handler: async (
    ctx,
    args,
  ): Promise<{ workflowId: string | null; count: number }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in");
    const emails = await ctx.db
      .query("emails")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const queued = emails.filter((e) => e.classifyStatus === "queued");
    if (queued.length === 0) {
      return { workflowId: null, count: 0 };
    }
    const emailIds = queued.map((e) => e._id);
    for (const id of emailIds) {
      await ctx.db.patch(id, { classifyStatus: "classifying" });
    }
    const workflowId = await workflow.start(
      ctx,
      internal.workflows.classifyInboxWorkflow,
      {
        userId,
        emailIds,
        modelId: args.modelId ?? DEFAULT_MODEL,
        runDiscovery: true,
      },
    );
    return { workflowId, count: emailIds.length };
  },
});

// Re-classify EVERY email against the current bucket set. Used after the
// user creates / edits / deletes a bucket. Marks all emails as
// "re-classifying" so the UI visibly shows the transition.
export const startReclassification = mutation({
  args: { modelId: v.optional(v.string()) },
  handler: async (
    ctx,
    args,
  ): Promise<{ workflowId: string | null; count: number }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in");
    const emails = await ctx.db
      .query("emails")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    if (emails.length === 0) {
      return { workflowId: null, count: 0 };
    }
    const emailIds = emails.map((e) => e._id);
    for (const id of emailIds) {
      await ctx.db.patch(id, { classifyStatus: "re-classifying" });
    }
    const workflowId = await workflow.start(
      ctx,
      internal.workflows.classifyInboxWorkflow,
      {
        userId,
        emailIds,
        modelId: args.modelId ?? DEFAULT_MODEL,
      },
    );
    return { workflowId, count: emailIds.length };
  },
});
