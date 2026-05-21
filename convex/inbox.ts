import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import { DEFAULT_BUCKETS } from "./prompts";
import { getValidAccessToken } from "./gmail";
import { notePendingLabelChange } from "./labelChanges";

// Cap user-defined labels at MAX_LABELS to keep the LLM's bucket list short
// (longer taxonomies degrade classification accuracy) and the UI scannable.
// Default labels count against the cap.
export const MAX_LABELS = 12;

// ----- Buckets -------------------------------------------------------------

export const seedDefaultBuckets = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const existing = await ctx.db
      .query("buckets")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    if (existing.length > 0) return;
    let order = 0;
    for (const b of DEFAULT_BUCKETS) {
      await ctx.db.insert("buckets", {
        userId,
        name: b.name,
        description: b.description,
        isDefault: true,
        sortOrder: order++,
      });
    }
  },
});

export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    return {
      _id: user._id,
      name: user.name,
      email: user.email,
      image: user.image,
    };
  },
});

export const listBuckets = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const buckets = await ctx.db
      .query("buckets")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return buckets.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

export const createBucket = mutation({
  args: { name: v.string(), description: v.string() },
  handler: async (ctx, { name, description }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in");
    const existing = await ctx.db
      .query("buckets")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    if (existing.length >= MAX_LABELS) {
      throw new Error(
        `You can have at most ${MAX_LABELS} labels. Delete one to make room.`,
      );
    }
    if (existing.some((b) => b.name.toLowerCase() === name.toLowerCase())) {
      throw new Error("A label with that name already exists");
    }
    const sortOrder =
      existing.reduce((max, b) => Math.max(max, b.sortOrder), -1) + 1;
    const bucketId = await ctx.db.insert("buckets", {
      userId,
      name,
      description,
      isDefault: false,
      sortOrder,
    });
    await notePendingLabelChange(ctx, userId, `Added "${name}"`);
    return bucketId;
  },
});

export const labelCapacity = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { used: 0, max: MAX_LABELS };
    const buckets = await ctx.db
      .query("buckets")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return { used: buckets.length, max: MAX_LABELS };
  },
});

export const deleteBucket = mutation({
  args: { bucketId: v.id("buckets") },
  handler: async (ctx, { bucketId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in");
    const bucket = await ctx.db.get(bucketId);
    if (!bucket || bucket.userId !== userId) {
      throw new Error("Bucket not found");
    }
    if (bucket.isDefault) {
      throw new Error("Cannot delete a default bucket");
    }
    // Unassign any emails that were in this bucket. The debounced
    // reclassify below will re-sort them (along with everything else).
    const emails = await ctx.db
      .query("emails")
      .withIndex("by_user_bucket", (q) =>
        q.eq("userId", userId).eq("bucketId", bucketId),
      )
      .collect();
    for (const e of emails) {
      await ctx.db.patch(e._id, { bucketId: undefined });
    }
    const deletedName = bucket.name;
    await ctx.db.delete(bucketId);
    await notePendingLabelChange(ctx, userId, `Removed "${deletedName}"`);
  },
});

// ----- Emails --------------------------------------------------------------

export const listEmails = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const emails = await ctx.db
      .query("emails")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    // Sort by Gmail date (newest first) so the inbox feels like an inbox.
    // Convex's `.order("desc")` would sort by _creationTime which is the
    // sync-insert time, not the email's actual sent/received date.
    return emails.sort((a, b) => b.date - a.date);
  },
});

export const inboxStats = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const emails = await ctx.db
      .query("emails")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    let queued = 0;
    let classifying = 0;
    let classified = 0;
    let reclassifying = 0;
    let failed = 0;
    for (const e of emails) {
      if (e.classifyStatus === "queued") queued++;
      else if (e.classifyStatus === "classifying") classifying++;
      else if (e.classifyStatus === "classified") classified++;
      else if (e.classifyStatus === "re-classifying") reclassifying++;
      else if (e.classifyStatus === "failed") failed++;
    }
    return { total: emails.length, queued, classifying, classified, reclassifying, failed };
  },
});

export const upsertEmailsBatch = internalMutation({
  args: {
    userId: v.id("users"),
    emails: v.array(
      v.object({
        gmailThreadId: v.string(),
        gmailMessageId: v.string(),
        subject: v.string(),
        snippet: v.string(),
        from: v.string(),
        to: v.optional(v.string()),
        date: v.number(),
      }),
    ),
  },
  handler: async (ctx, { userId, emails }) => {
    let inserted = 0;
    let skipped = 0;
    for (const e of emails) {
      const existing = await ctx.db
        .query("emails")
        .withIndex("by_user_thread", (q) =>
          q.eq("userId", userId).eq("gmailThreadId", e.gmailThreadId),
        )
        .unique();
      if (existing) {
        skipped++;
        continue;
      }
      await ctx.db.insert("emails", {
        userId,
        gmailThreadId: e.gmailThreadId,
        gmailMessageId: e.gmailMessageId,
        subject: e.subject,
        snippet: e.snippet,
        from: e.from,
        to: e.to,
        date: e.date,
        classifyStatus: "queued",
      });
      inserted++;
    }
    return { inserted, skipped };
  },
});

export const getQueuedEmailIds = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const emails = await ctx.db
      .query("emails")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return emails
      .filter((e) => e.classifyStatus === "queued")
      .map((e) => e._id);
  },
});

export const getAllEmailIds = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const emails = await ctx.db
      .query("emails")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return emails.map((e) => e._id);
  },
});

export const getEmailsForEmbedding = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const emails = await ctx.db
      .query("emails")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return emails
      .filter((e) => !e.embeddingId)
      .map((e) => ({
        _id: e._id,
        subject: e.subject,
        from: e.from,
        snippet: e.snippet,
      }));
  },
});

export const markEmailEmbedded = internalMutation({
  args: { emailId: v.id("emails"), embeddingId: v.string() },
  handler: async (ctx, { emailId, embeddingId }) => {
    await ctx.db.patch(emailId, { embeddingId });
  },
});

export const getEmailsByIdPreservingOrder = internalQuery({
  args: { emailIds: v.array(v.id("emails")) },
  handler: async (ctx, { emailIds }) => {
    const out: Array<{
      _id: Id<"emails">;
      subject: string;
      from: string;
      snippet: string;
      date: number;
    }> = [];
    for (const id of emailIds) {
      const e = await ctx.db.get(id);
      if (e)
        out.push({
          _id: e._id,
          subject: e.subject,
          from: e.from,
          snippet: e.snippet,
          date: e.date,
        });
    }
    return out;
  },
});

// Agent-facing version of createBucket. The Agent tool runs inside
// streamText() where there's no auth context to derive userId from, so
// we take it explicitly. Same validation as the user-facing mutation.
export const createBucketForUser = internalMutation({
  args: {
    userId: v.id("users"),
    name: v.string(),
    description: v.string(),
  },
  handler: async (ctx, args): Promise<Id<"buckets">> => {
    const existing = await ctx.db
      .query("buckets")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    if (existing.length >= MAX_LABELS) {
      throw new Error(
        `You can have at most ${MAX_LABELS} labels. Delete one to make room.`,
      );
    }
    if (existing.some((b) => b.name.toLowerCase() === args.name.toLowerCase())) {
      throw new Error(`A label called "${args.name}" already exists.`);
    }
    const sortOrder =
      existing.reduce((max, b) => Math.max(max, b.sortOrder), -1) + 1;
    const bucketId = await ctx.db.insert("buckets", {
      userId: args.userId,
      name: args.name,
      description: args.description,
      isDefault: false,
      sortOrder,
    });
    await notePendingLabelChange(
      ctx,
      args.userId,
      `Added "${args.name}" (via agent)`,
    );
    return bucketId;
  },
});

// Agent-facing version of deleteBucket. Takes explicit userId; protects
// default labels from deletion.
export const deleteBucketForUser = internalMutation({
  args: {
    userId: v.id("users"),
    bucketName: v.string(),
  },
  handler: async (ctx, args) => {
    const buckets = await ctx.db
      .query("buckets")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    const match = buckets.find(
      (b) => b.name.toLowerCase() === args.bucketName.toLowerCase(),
    );
    if (!match) {
      throw new Error(`No label named "${args.bucketName}".`);
    }
    if (match.isDefault) {
      throw new Error(
        `"${match.name}" is a default label and can't be deleted.`,
      );
    }
    // Unassign any emails in this label; the debounced reclassify will
    // re-sort them.
    const emails = await ctx.db
      .query("emails")
      .withIndex("by_user_bucket", (q) =>
        q.eq("userId", args.userId).eq("bucketId", match._id),
      )
      .collect();
    for (const e of emails) {
      await ctx.db.patch(e._id, { bucketId: undefined });
    }
    await ctx.db.delete(match._id);
    await notePendingLabelChange(
      ctx,
      args.userId,
      `Removed "${match.name}" (via agent)`,
    );
    return { ok: true, name: match.name };
  },
});

// Agent tool support: hydrate emails by id (for searchInbox), including
// each email's canonical bucket name so the LLM doesn't have to infer it.
export const getEmailsByIdWithLabel = internalQuery({
  args: { emailIds: v.array(v.id("emails")) },
  handler: async (ctx, { emailIds }) => {
    const out: Array<{
      _id: Id<"emails">;
      subject: string;
      from: string;
      snippet: string;
      date: number;
      label: string | null;
    }> = [];
    for (const id of emailIds) {
      const e = await ctx.db.get(id);
      if (!e) continue;
      const bucket = e.bucketId ? await ctx.db.get(e.bucketId) : null;
      out.push({
        _id: e._id,
        subject: e.subject,
        from: e.from,
        snippet: e.snippet,
        date: e.date,
        label: bucket?.name ?? null,
      });
    }
    return out;
  },
});

// Agent tool support: list recent emails for a user, optionally filtered
// by label name. Sorted by date desc.
export const listEmailsForAgent = internalQuery({
  args: {
    userId: v.id("users"),
    labelName: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const emails = await ctx.db
      .query("emails")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    const buckets = await ctx.db
      .query("buckets")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    const bucketByName = new Map(
      buckets.map((b) => [b.name.toLowerCase(), b]),
    );
    const bucketById = new Map(buckets.map((b) => [b._id, b]));

    let filtered = emails;
    if (args.labelName) {
      const match = bucketByName.get(args.labelName.toLowerCase());
      if (!match) return [];
      filtered = emails.filter((e) => e.bucketId === match._id);
    }
    filtered.sort((a, b) => b.date - a.date);
    const limit = args.limit ?? 10;
    return filtered.slice(0, limit).map((e) => ({
      cid: e._id,
      from: e.from,
      subject: e.subject,
      snippet: e.snippet,
      date: e.date,
      label: e.bucketId
        ? (bucketById.get(e.bucketId)?.name ?? null)
        : null,
    }));
  },
});

export const labelsWithCountsFor = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const [buckets, emails] = await Promise.all([
      ctx.db
        .query("buckets")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("emails")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
    ]);
    const counts = new Map<string, number>();
    for (const e of emails) {
      if (!e.bucketId) continue;
      counts.set(e.bucketId, (counts.get(e.bucketId) ?? 0) + 1);
    }
    return buckets.map((b) => ({
      name: b.name,
      description: b.description,
      count: counts.get(b._id) ?? 0,
    }));
  },
});

export const getBuckets = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return ctx.db
      .query("buckets")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

export const getEmailsByIds = internalQuery({
  args: { emailIds: v.array(v.id("emails")) },
  handler: async (ctx, { emailIds }) => {
    const results = [];
    for (const id of emailIds) {
      const e = await ctx.db.get(id);
      if (e) results.push(e);
    }
    return results;
  },
});

export const markEmailsStatus = internalMutation({
  args: {
    emailIds: v.array(v.id("emails")),
    status: v.union(
      v.literal("queued"),
      v.literal("classifying"),
      v.literal("classified"),
      v.literal("re-classifying"),
      v.literal("failed"),
    ),
  },
  handler: async (ctx, { emailIds, status }) => {
    for (const id of emailIds) {
      await ctx.db.patch(id, { classifyStatus: status });
    }
  },
});

export const writeClassifications = internalMutation({
  args: {
    results: v.array(
      v.object({
        emailId: v.id("emails"),
        bucketId: v.id("buckets"),
        reason: v.string(),
        model: v.string(),
      }),
    ),
  },
  handler: async (ctx, { results }) => {
    for (const r of results) {
      await ctx.db.patch(r.emailId, {
        bucketId: r.bucketId,
        classifyReason: r.reason,
        classifyModel: r.model,
        classifyStatus: "classified",
        classifyError: undefined,
      });
    }
  },
});

export const markClassificationFailed = internalMutation({
  args: {
    emailIds: v.array(v.id("emails")),
    error: v.string(),
  },
  handler: async (ctx, { emailIds, error }) => {
    for (const id of emailIds) {
      const email = await ctx.db.get(id);
      if (!email) continue;
      // If we already have a good classification, keep it. A failed
      // re-classify is almost always transient (rate limit, network blip)
      // and the prior bucket assignment is still useful. We just record
      // the error and reset status to "classified" so the UI doesn't
      // light up red on every transient hiccup.
      if (email.bucketId) {
        await ctx.db.patch(id, {
          classifyStatus: "classified",
          classifyError: error,
        });
      } else {
        await ctx.db.patch(id, {
          classifyStatus: "failed",
          classifyError: error,
        });
      }
    }
  },
});

// ----- Gmail bulk fetch ----------------------------------------------------

type GmailListResponse = {
  threads?: Array<{ id: string }>;
  nextPageToken?: string;
};

type GmailMessage = {
  id: string;
  threadId: string;
  snippet?: string;
  internalDate?: string;
  payload?: { headers?: Array<{ name: string; value: string }> };
};

type GmailThread = {
  id: string;
  messages?: GmailMessage[];
};

const FETCH_CONCURRENCY = 10;

async function listThreadIds(
  accessToken: string,
  maxResults: number,
): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  while (ids.length < maxResults) {
    const url = new URL(
      "https://gmail.googleapis.com/gmail/v1/users/me/threads",
    );
    url.searchParams.set(
      "maxResults",
      String(Math.min(100, maxResults - ids.length)),
    );
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(
        `Gmail threads.list failed: ${res.status} ${await res.text()}`,
      );
    }
    const body = (await res.json()) as GmailListResponse;
    for (const t of body.threads ?? []) ids.push(t.id);
    pageToken = body.nextPageToken;
    if (!pageToken) break;
  }
  return ids.slice(0, maxResults);
}

async function fetchThreadMetadata(
  accessToken: string,
  threadId: string,
): Promise<{
  gmailThreadId: string;
  gmailMessageId: string;
  subject: string;
  snippet: string;
  from: string;
  to: string | undefined;
  date: number;
} | null> {
  const url = new URL(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}`,
  );
  url.searchParams.set("format", "metadata");
  url.searchParams.append("metadataHeaders", "Subject");
  url.searchParams.append("metadataHeaders", "From");
  url.searchParams.append("metadataHeaders", "To");
  url.searchParams.append("metadataHeaders", "Date");
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    // Skip individual thread failures rather than aborting the whole sync.
    console.warn(
      `Gmail thread.get ${threadId} failed: ${res.status} ${await res.text()}`,
    );
    return null;
  }
  const thread = (await res.json()) as GmailThread;
  // Use the most recent message in the thread for display (last in messages[]).
  const msg = thread.messages?.[thread.messages.length - 1];
  if (!msg) return null;
  const headers = msg.payload?.headers ?? [];
  const headerOf = (name: string) =>
    headers.find((h) => h.name === name)?.value;
  const subject = headerOf("Subject") ?? "(no subject)";
  const from = headerOf("From") ?? "(unknown)";
  const to = headerOf("To");
  const dateHeader = headerOf("Date");
  const dateMs = msg.internalDate
    ? Number(msg.internalDate)
    : dateHeader
      ? Date.parse(dateHeader)
      : Date.now();
  return {
    gmailThreadId: thread.id,
    gmailMessageId: msg.id,
    subject,
    snippet: msg.snippet ?? "",
    from,
    to,
    date: Number.isFinite(dateMs) ? dateMs : Date.now(),
  };
}

// Pull the last `maxThreads` Gmail threads for the signed-in user. Returns
// the number of new emails inserted (existing thread ids are skipped). Does
// not classify — the workflow kicked off elsewhere handles that.
export const syncInbox = action({
  args: { maxThreads: v.optional(v.number()) },
  handler: async (
    ctx,
    args,
  ): Promise<{ inserted: number; skipped: number; total: number }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in");

    // Ensure default buckets exist (cheap, idempotent).
    await ctx.runMutation(internal.inbox.seedDefaultBuckets, { userId });

    const accessToken = await getValidAccessToken(ctx, userId);
    const max = args.maxThreads ?? 200;
    const threadIds = await listThreadIds(accessToken, max);

    // Fetch thread metadata in parallel batches.
    const fetched: Awaited<ReturnType<typeof fetchThreadMetadata>>[] = [];
    for (let i = 0; i < threadIds.length; i += FETCH_CONCURRENCY) {
      const batch = threadIds.slice(i, i + FETCH_CONCURRENCY);
      const results = await Promise.all(
        batch.map((id) => fetchThreadMetadata(accessToken, id)),
      );
      fetched.push(...results);
    }

    // Drop any nulls (individual failures), then upsert.
    const ok = fetched.filter(
      (e): e is NonNullable<typeof e> => e !== null,
    );
    let inserted = 0;
    let skipped = 0;
    const UPSERT_BATCH = 50;
    for (let i = 0; i < ok.length; i += UPSERT_BATCH) {
      const r = (await ctx.runMutation(internal.inbox.upsertEmailsBatch, {
        userId,
        emails: ok.slice(i, i + UPSERT_BATCH),
      })) as { inserted: number; skipped: number };
      inserted += r.inserted;
      skipped += r.skipped;
    }
    return { inserted, skipped, total: threadIds.length };
  },
});
