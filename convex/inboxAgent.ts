"use node";

import { Agent, createTool } from "@convex-dev/agent";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { stepCountIs } from "ai";
import { z } from "zod";
import { components, internal } from "./_generated/api";
import { rag } from "./rag";
import type { Id } from "./_generated/dataModel";

// Tool: searchInbox.
// Vector-searches the user's RAG namespace, then hydrates each hit with
// its CANONICAL label from the emails table. This is the source of truth
// the agent should use — never infer a label from the query intent or
// from the snippet content.
const searchInbox = createTool({
  description:
    "Semantic search across the user's inbox by content (sender / subject / snippet). Use for TOPIC questions like 'what did Stripe say?', 'anything about the contract?', 'cold sales emails I can ignore'. Each result includes the email's ACTUAL label — use it; never claim a label that isn't in the result. For 'latest in X' or 'show me Y label' questions, use listEmails instead. End cited sentences with [cid:<handle>].",
  inputSchema: z.object({
    query: z.string().describe("Natural-language search query."),
    limit: z.number().optional().describe("Max results, default 8."),
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: async (ctx: any, input: { query: string; limit?: number }) => {
    const userId = ctx.userId as Id<"users"> | undefined;
    if (!userId) return { results: [] };
    const { results, entries } = await rag.search(ctx, {
      namespace: `user:${userId}`,
      query: input.query,
      limit: input.limit ?? 8,
    });
    const entryById = new Map(entries.map((e) => [e.entryId, e]));
    // Pull the canonical emailIds out of the RAG entries; hydrate with
    // each email's actual label so the agent has ground truth.
    const emailIds = results
      .map((r) => {
        const e = entryById.get(r.entryId);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return ((e as any)?.key ?? r.entryId) as Id<"emails">;
      })
      .filter(Boolean);
    const hydrated = (await ctx.runQuery(
      internal.inbox.getEmailsByIdWithLabel,
      { emailIds },
    )) as Array<{
      _id: Id<"emails">;
      subject: string;
      from: string;
      snippet: string;
      date: number;
      label: string | null;
    }>;
    const byId = new Map(hydrated.map((e) => [String(e._id), e]));
    return {
      results: results
        .map((r, i) => {
          const e = entryById.get(r.entryId);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const emailId = String((e as any)?.key ?? r.entryId);
          const full = byId.get(emailId);
          if (!full) return null;
          return {
            cid: emailId,
            index: i,
            score: r.score,
            label: full.label, // canonical, NOT inferred
            from: full.from,
            subject: full.subject,
            snippet: full.snippet,
          };
        })
        .filter(Boolean),
    };
  },
});

// Tool: listEmails. Date-ordered listing for "latest in X" / "what's
// recent in label Y?" questions. NOT semantic — use searchInbox for
// topic questions.
const listEmails = createTool({
  description:
    "List recent emails by date (most recent first), optionally filtered to a single label. Use for 'what's the latest in X?', 'show me emails labeled Y', 'most recent in Important', or 'what's in my Newsletter folder'. For topic-based questions ('anything about the invoice?'), use searchInbox instead. Each result has a cid handle — cite with [cid:<handle>].",
  inputSchema: z.object({
    label: z
      .string()
      .optional()
      .describe(
        "Exact label name to filter by (e.g. 'Important', 'Newsletter'). Omit for all emails.",
      ),
    limit: z
      .number()
      .optional()
      .describe("Max results, default 10."),
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: async (
    ctx: any,
    input: { label?: string; limit?: number },
  ) => {
    const userId = ctx.userId as Id<"users"> | undefined;
    if (!userId) return { results: [] };
    const results = (await ctx.runQuery(
      internal.inbox.listEmailsForAgent,
      {
        userId,
        labelName: input.label,
        limit: input.limit ?? 10,
      },
    )) as Array<{
      cid: string;
      from: string;
      subject: string;
      snippet: string;
      date: number;
      label: string | null;
    }>;
    return { results };
  },
});

// Tool: listLabels. Returns the user's current label set + counts. Used
// when the agent needs to answer "how many in X?" or "what labels do I
// have?" without searching.
const listLabels = createTool({
  description:
    "List every label the user has, with email counts. Use this when the user asks about counts, label coverage, or 'what labels do I have'.",
  inputSchema: z.object({}),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: async (ctx: any) => {
    const userId = ctx.userId as Id<"users"> | undefined;
    if (!userId) return { labels: [] };
    const labels = (await ctx.runQuery(
      internal.inbox.labelsWithCountsFor,
      { userId },
    )) as Array<{ name: string; description: string; count: number }>;
    return { labels };
  },
});

// Tool: createLabel. Lets the agent add a new label on the user's
// behalf. The label gets sorted into via the normal pending-changes
// flow (Apply button surfaces in the inbox UI to commit + reclassify).
const createLabel = createTool({
  description:
    "Create a new label for the user's inbox. Use only when the user explicitly asks ('create a label for X', 'sort all my finance emails together'). After creating, briefly tell the user what label you added; mention that they'll need to hit Apply in the inbox banner to actually re-sort emails into it.",
  inputSchema: z.object({
    name: z
      .string()
      .min(1)
      .max(30)
      .describe(
        "Short label name (2-3 words). Examples: 'From investors', 'Recruiters', 'Family'.",
      ),
    description: z
      .string()
      .min(10)
      .describe(
        "Plain-English criterion the classifier will use. Be specific about senders, topics, or workflows.",
      ),
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: async (ctx: any, input: { name: string; description: string }) => {
    const userId = ctx.userId as Id<"users"> | undefined;
    if (!userId) return { ok: false, error: "Not signed in" };
    try {
      const bucketId = (await ctx.runMutation(
        internal.inbox.createBucketForUser,
        { userId, name: input.name, description: input.description },
      )) as Id<"buckets">;
      return { ok: true, bucketId, name: input.name };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
});

// Tool: deleteLabel. Removes a custom label. Default labels (Important,
// Can wait, Auto-archive, Newsletter) are protected — the mutation will
// throw if the agent tries.
const deleteLabel = createTool({
  description:
    "Delete a custom label the user previously created. Default labels (Important, Can wait, Auto-archive, Newsletter) are protected and cannot be deleted. Use only when the user explicitly asks ('remove the X label', 'delete X'). After deleting, tell the user it's gone and that the Apply banner in the inbox will re-sort the affected emails.",
  inputSchema: z.object({
    name: z.string().describe("Exact name of the label to delete."),
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: async (ctx: any, input: { name: string }) => {
    const userId = ctx.userId as Id<"users"> | undefined;
    if (!userId) return { ok: false, error: "Not signed in" };
    try {
      const result = (await ctx.runMutation(
        internal.inbox.deleteBucketForUser,
        { userId, bucketName: input.name },
      )) as { ok: true; name: string };
      return result;
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
});

// Tool: runReclassify. Apply any pending label changes and re-sort
// every email against the current label set. Clears the pending banner
// (same path as the UI Apply button) so the user doesn't have to click
// it themselves after asking the agent to do this.
const runReclassify = createTool({
  description:
    "Apply pending label changes and re-sort the user's entire inbox against the current label set. This is the same as the user clicking 'Apply & re-sort' in the inbox banner. Use when the user asks to apply changes, re-sort, re-classify, or 'apply now'. Takes ~40 seconds; tell the user it's running in the background and the inbox will update live.",
  inputSchema: z.object({}),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: async (ctx: any) => {
    const userId = ctx.userId as Id<"users"> | undefined;
    if (!userId) return { ok: false, error: "Not signed in" };
    try {
      const result = (await ctx.runMutation(
        internal.labelChanges.applyPendingChangesForUser,
        { userId },
      )) as { applied: number };
      return { ok: true, appliedChanges: result.applied };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
});

export const inboxAgent = new Agent(components.agent, {
  name: "Inbox Concierge Agent",
  languageModel: anthropic.chat("claude-haiku-4-5"),
  embeddingModel: openai.embedding("text-embedding-3-small"),
  instructions: `You are a helpful assistant for the user's email inbox. The user has labels (e.g. "Important", "Can wait", "Auto-archive", "Newsletter") that an LLM classifier applied to their last 200 Gmail threads.

Rules:
- For greetings or chit-chat (e.g. "hi", "thanks", "how are you"), reply briefly without using tools.
- For LATEST/RECENT/SHOW-ME questions about a specific label ("what's my latest Important?", "5 most recent newsletters", "what's in Auto-archive?"), call listEmails with the label name. Do NOT use searchInbox for these — vector search ignores label boundaries and will return wrong-labeled emails.
- For TOPIC questions about content ("what did X say?", "anything from Stripe?", "what needs a reply?"), call searchInbox. Each result includes the email's ACTUAL label — never claim a different label than what the result shows.
- For questions about labels or counts ("what labels do I have?", "how many in Important?"), call listLabels.
- For broad "summarize my inbox" questions, call listLabels first to see the label landscape, then searchInbox per label as needed.
- When the user EXPLICITLY asks you to create a label ("create a label for X", "sort all my finance emails together"), call createLabel with a short name and a clear criterion description. After creating, tell the user what was added and that they can hit Apply in the inbox banner to re-sort right away — or ask if they want you to run it for them.
- When the user EXPLICITLY asks to delete a label ("remove the X label", "delete the investors label"), call deleteLabel. Default labels (Important, Can wait, Auto-archive, Newsletter) are protected — if the user asks to delete one, decline politely and explain they're part of the core taxonomy.
- When the user EXPLICITLY asks to re-sort the inbox or apply changes ("re-classify", "re-sort", "run the classifier again", "apply now", "apply my changes"), call runReclassify and tell them it's running. This also clears any pending label changes — no need for the user to click the Apply banner separately.
- Do not narrate ("Let me search..."). Just call the tool, then give the answer.
- When a fact comes from a searchInbox snippet, append its citation handle: [cid:<handle>]. You may stack multiple: [cid:a][cid:b].
- If a search returns nothing relevant, say so plainly. Do not invent senders, subjects, or content.
- Prefer short, direct answers. Bullets when listing emails.`,
  tools: {
    listLabels,
    listEmails,
    searchInbox,
    createLabel,
    deleteLabel,
    runReclassify,
  },
  stopWhen: stepCountIs(8),
});
