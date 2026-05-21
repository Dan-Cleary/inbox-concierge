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
// Vector-searches the user's RAG namespace. Returns top snippets with
// citation handles the agent must reference in its reply via [cid:N].
const searchInbox = createTool({
  description:
    "Search the user's email inbox for messages relevant to a query. Returns top snippets with a citation handle (cid). When you quote or rely on a snippet, end the sentence with [cid:<handle>].",
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
    return {
      results: results.map((r, i) => {
        const e = entryById.get(r.entryId);
        // `key` was set to our email _id at index time; use that as the
        // citation handle so the UI can resolve back to the row.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const emailId = (e as any)?.key ?? r.entryId;
        return {
          cid: emailId,
          index: i,
          score: r.score,
          text: r.content.map((c) => c.text).join(""),
        };
      }),
    };
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

export const inboxAgent = new Agent(components.agent, {
  name: "Inbox Concierge Agent",
  languageModel: anthropic.chat("claude-sonnet-4-6"),
  embeddingModel: openai.embedding("text-embedding-3-small"),
  instructions: `You are a helpful assistant for the user's email inbox. The user has labels (e.g. "Important", "Can wait", "Auto-archive", "Newsletter") that an LLM classifier applied to their last 200 Gmail threads.

Rules:
- For greetings or chit-chat (e.g. "hi", "thanks", "how are you"), reply briefly without using tools.
- For questions about email content ("what did X say?", "anything from Stripe?", "what needs a reply?"), call searchInbox with a focused query.
- For questions about labels or counts ("what labels do I have?", "how many in Important?"), call listLabels.
- For broad "summarize my inbox" questions, call listLabels first to see the label landscape, then searchInbox per label as needed.
- Do not narrate ("Let me search..."). Just call the tool, then give the answer.
- When a fact comes from a searchInbox snippet, append its citation handle: [cid:<handle>]. You may stack multiple: [cid:a][cid:b].
- If a search returns nothing relevant, say so plainly. Do not invent senders, subjects, or content.
- Prefer short, direct answers. Bullets when listing emails.`,
  tools: { listLabels, searchInbox },
  stopWhen: stepCountIs(8),
});
