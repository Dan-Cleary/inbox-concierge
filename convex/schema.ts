import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,

  // Gmail credentials per user (populated after OAuth sign-in).
  // We store tokens here because Convex Auth's authAccounts table does not
  // expose the raw OAuth access_token to action handlers by default.
  gmailCredentials: defineTable({
    userId: v.id("users"),
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    scope: v.string(),
  }).index("by_user", ["userId"]),

  // Email threads pulled from Gmail.
  emails: defineTable({
    userId: v.id("users"),
    gmailThreadId: v.string(),
    gmailMessageId: v.string(),
    subject: v.string(),
    snippet: v.string(),
    from: v.string(),
    to: v.optional(v.string()),
    date: v.number(),
    bucketId: v.optional(v.id("buckets")),
    classifyStatus: v.union(
      v.literal("queued"),
      v.literal("classifying"),
      v.literal("classified"),
      v.literal("re-classifying"),
      v.literal("failed"),
    ),
    classifyReason: v.optional(v.string()),
    classifyModel: v.optional(v.string()),
    classifyError: v.optional(v.string()),
    embeddingId: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_user_thread", ["userId", "gmailThreadId"])
    .index("by_user_bucket", ["userId", "bucketId"]),

  // Default + user-defined buckets.
  buckets: defineTable({
    userId: v.id("users"),
    name: v.string(),
    description: v.string(),
    isDefault: v.boolean(),
    sortOrder: v.number(),
  }).index("by_user", ["userId"]),

  // One row per (re)classification workflow run.
  classificationRuns: defineTable({
    userId: v.id("users"),
    workflowId: v.string(),
    triggeredBy: v.union(
      v.literal("initial-fetch"),
      v.literal("bucket-created"),
      v.literal("bucket-edited"),
      v.literal("manual"),
    ),
    model: v.string(),
    status: v.union(
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    emailCount: v.number(),
  }).index("by_user", ["userId"]),

  // Eval dataset (synthetic emails + ground-truth labels, human-reviewed).
  evalDatasets: defineTable({
    version: v.string(),
    generatedAt: v.number(),
    reviewedAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    generatorModel: v.optional(v.string()),
    // Once locked, labels are frozen and no new dataset can be generated
    // (avoids accidental drift while comparing model accuracy over time).
    locked: v.optional(v.boolean()),
    lockedAt: v.optional(v.number()),
  }),

  evalDatasetEmails: defineTable({
    datasetId: v.id("evalDatasets"),
    subject: v.string(),
    from: v.string(),
    snippet: v.string(),
    expectedBucket: v.string(),
    rationale: v.optional(v.string()),
    reviewed: v.boolean(),
  }).index("by_dataset", ["datasetId"]),

  // Eval runs (one row per model run against a dataset version).
  evalRuns: defineTable({
    datasetId: v.id("evalDatasets"),
    model: v.string(),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    status: v.union(
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    accuracy: v.optional(v.number()),
    perBucketAccuracy: v.optional(v.record(v.string(), v.number())),
    avgLatencyMs: v.optional(v.number()),
    totalCostUsd: v.optional(v.number()),
  }).index("by_dataset", ["datasetId"]),

  evalRunResults: defineTable({
    runId: v.id("evalRuns"),
    datasetEmailId: v.id("evalDatasetEmails"),
    predictedBucket: v.string(),
    expectedBucket: v.string(),
    correct: v.boolean(),
    reason: v.optional(v.string()),
    latencyMs: v.number(),
  }).index("by_run", ["runId"]),

  // Per-user settings (e.g. which model wins after eval).
  userSettings: defineTable({
    userId: v.id("users"),
    classifierModel: v.string(),
  }).index("by_user", ["userId"]),
});
