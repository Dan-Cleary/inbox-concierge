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
    promptVersionId: v.optional(v.id("promptVersions")),
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

  // Versioned classification prompt templates. The template body must contain
  // a `{{BUCKETS}}` placeholder that gets substituted with the active bucket
  // taxonomy (default buckets in evals; user buckets in production).
  promptVersions: defineTable({
    label: v.string(),
    template: v.string(),
    createdAt: v.number(),
    notes: v.optional(v.string()),
  }),

  evalRunResults: defineTable({
    runId: v.id("evalRuns"),
    datasetEmailId: v.id("evalDatasetEmails"),
    predictedBucket: v.string(),
    expectedBucket: v.string(),
    correct: v.boolean(),
    reason: v.optional(v.string()),
    latencyMs: v.number(),
  }).index("by_run", ["runId"]),

  // Buckets the discovery Agent has proposed for a user. Status moves
  // pending -> accepted | dismissed. Accepting creates a real bucket and
  // triggers reclassification.
  bucketSuggestions: defineTable({
    userId: v.id("users"),
    name: v.string(),
    description: v.string(),
    rationale: v.string(),
    sampleEmailIds: v.array(v.id("emails")),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("dismissed"),
    ),
    createdAt: v.number(),
    acceptedBucketId: v.optional(v.id("buckets")),
  }).index("by_user_status", ["userId", "status"]),

  // Persistent chat history for the "ask your inbox" assistant. Each user
  // gets a single rolling thread; we don't expose multi-thread chat in v1.
  chatMessages: defineTable({
    userId: v.id("users"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    // Email IDs the assistant cited as evidence for an answer. UI renders
    // these as chips that scroll/highlight the matching row.
    citations: v.optional(v.array(v.id("emails"))),
    // True while the assistant message is still streaming or being computed.
    pending: v.optional(v.boolean()),
    error: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),

  // Pending label changes per user. Accumulates as the user creates/
  // deletes labels and accepts suggestions; cleared on Apply.
  pendingLabelChanges: defineTable({
    userId: v.id("users"),
    changeCount: v.number(),
    summaries: v.array(v.string()),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // Legacy: kept so old data isn't lost. No new writes after the
  // Apply-pattern refactor.
  reclassifyJobs: defineTable({
    userId: v.id("users"),
    scheduledFnId: v.id("_scheduled_functions"),
  }).index("by_user", ["userId"]),

  // Per-user settings (e.g. which model wins after eval).
  userSettings: defineTable({
    userId: v.id("users"),
    classifierModel: v.string(),
  }).index("by_user", ["userId"]),
});
