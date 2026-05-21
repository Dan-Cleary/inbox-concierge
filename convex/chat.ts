"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { getAuthUserId } from "@convex-dev/auth/server";
import { rag } from "./rag";
import type { Id } from "./_generated/dataModel";

const CHAT_MODEL = "claude-sonnet-4-6";
const RAG_TOP_K = 8;

const SYSTEM_PROMPT = `You are an assistant that answers questions about the user's email inbox. You have access to retrieved emails relevant to each question.

Rules:
- Ground every answer in the retrieved emails. If the emails don't contain the answer, say so plainly.
- Be specific: name senders, reference subject lines, quote short snippets when useful.
- Keep answers tight. Bullets when listing multiple emails; prose when summarizing.
- Cite emails by their bracketed [id] tags inline at the end of the relevant sentence, like [k1234abcd]. Use the exact id from the retrieved email block.
- Never fabricate senders, subjects, or content not present in the retrieved emails.`;

// Public: ask a question about the user's inbox.
//
// Flow: persist the user message + a placeholder assistant message, run RAG
// search, call the LLM with retrieved emails as context, parse citations,
// patch the assistant message with the final content + citations.
export const askInbox = action({
  args: { question: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ assistantMessageId: Id<"chatMessages"> }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in");
    const question = args.question.trim();
    if (!question) throw new Error("Empty question");

    const { assistantMessageId } = (await ctx.runMutation(
      internal.chatDb.insertUserAndAssistantPlaceholder,
      { userId, question },
    )) as { assistantMessageId: Id<"chatMessages"> };

    try {
      // 1. Retrieve top-K emails from the user's namespace.
      const namespace = `user:${userId}`;
      const search = await rag.search(ctx, {
        namespace,
        query: question,
        limit: RAG_TOP_K,
        vectorScoreThreshold: 0.25,
      });

      const retrievedEmailIds = search.results
        .map((r) => {
          // metadata is the object we passed at rag.add() time; emailId is
          // the canonical pointer back to our emails table. It lives under
          // each content chunk in the new RAG API.
          const md = r.content[0]?.metadata as
            | { emailId?: Id<"emails"> }
            | undefined;
          return md?.emailId;
        })
        .filter((id): id is Id<"emails"> => Boolean(id));

      // 2. Hydrate the actual email content so the LLM has full context
      // (RAG returns chunked text; we want the canonical record).
      const emails = (await ctx.runQuery(
        internal.inbox.getEmailsByIdPreservingOrder,
        { emailIds: retrievedEmailIds },
      )) as Array<{
        _id: Id<"emails">;
        subject: string;
        from: string;
        snippet: string;
        date: number;
      }>;

      if (emails.length === 0) {
        await ctx.runMutation(internal.chatDb.finalizeAssistantMessage, {
          messageId: assistantMessageId,
          content:
            "I couldn't find any emails matching that question in your inbox.",
          citations: [],
        });
        return { assistantMessageId };
      }

      const contextBlock = emails
        .map(
          (e) =>
            `[${e._id}] From: ${e.from} | ${formatDateForPrompt(e.date)}\nSubject: ${e.subject}\nSnippet: ${e.snippet}`,
        )
        .join("\n\n");

      const userPrompt = `Question: ${question}\n\nRetrieved emails:\n\n${contextBlock}`;

      const { text } = await generateText({
        model: anthropic(CHAT_MODEL),
        system: SYSTEM_PROMPT,
        prompt: userPrompt,
      });

      // 3. Extract bracketed [id] citations from the response. Order
      // matters: we want first-mention order, deduped.
      const citations = extractCitations(text, retrievedEmailIds);

      await ctx.runMutation(internal.chatDb.finalizeAssistantMessage, {
        messageId: assistantMessageId,
        content: text,
        citations,
      });

      return { assistantMessageId };
    } catch (err) {
      await ctx.runMutation(internal.chatDb.failAssistantMessage, {
        messageId: assistantMessageId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  },
});

function extractCitations(
  text: string,
  retrievedIds: Array<Id<"emails">>,
): Id<"emails">[] {
  const known = new Set(retrievedIds as string[]);
  const seen = new Set<string>();
  const out: Id<"emails">[] = [];
  // Match anything that looks like a Convex id inside square brackets.
  // We don't try to validate the shape — we restrict to ids we actually
  // sent to the LLM, which prevents hallucinated citations.
  const re = /\[([a-z0-9]{8,})\]/gi;
  for (const m of text.matchAll(re)) {
    const candidate = m[1];
    if (known.has(candidate) && !seen.has(candidate)) {
      seen.add(candidate);
      out.push(candidate as Id<"emails">);
    }
  }
  return out;
}

function formatDateForPrompt(ms: number): string {
  const d = new Date(ms);
  return d.toISOString().slice(0, 10);
}
