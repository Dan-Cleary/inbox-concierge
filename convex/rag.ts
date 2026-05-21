"use node";

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { components } from "./_generated/api";
import { RAG } from "@convex-dev/rag";
import { openai } from "@ai-sdk/openai";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";

// RAG instance bound to the Convex RAG component. Per-user namespacing
// keeps one user's inbox out of another's search results.
export const rag = new RAG(components.rag, {
  textEmbeddingModel: openai.embedding("text-embedding-3-small"),
  embeddingDimension: 1536,
});

// Pull all not-yet-embedded emails for the user, generate embeddings via the
// RAG component, and mark each email as embedded so we never re-embed it.
//
// Called from the classification workflow after classification finishes.
// Safe to call again — it only operates on emails without an embeddingId.
// Public entry point so the UI can manually trigger embedding for an inbox
// that was classified before this feature existed (or recover from failures).
export const triggerEmbedInbox = action({
  args: {},
  handler: async (ctx): Promise<{ embedded: number; skipped: number }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in");
    return (await ctx.runAction(internal.rag.embedInbox, { userId })) as {
      embedded: number;
      skipped: number;
    };
  },
});

export const embedInbox = internalAction({
  args: { userId: v.id("users") },
  handler: async (
    ctx,
    args,
  ): Promise<{ embedded: number; skipped: number }> => {
    const emails = (await ctx.runQuery(internal.inbox.getEmailsForEmbedding, {
      userId: args.userId,
    })) as Array<{
      _id: Id<"emails">;
      subject: string;
      from: string;
      snippet: string;
    }>;
    if (emails.length === 0) return { embedded: 0, skipped: 0 };

    const namespace = `user:${args.userId}`;
    let embedded = 0;
    // We embed one email per rag.add call so each chunk is searchable on
    // its own and metadata round-trips cleanly. The component handles
    // batching the underlying embedding API calls.
    for (const e of emails) {
      const text = formatEmailForEmbedding(e);
      const { entryId } = await rag.add(ctx, {
        namespace,
        text,
        key: e._id,
        metadata: { emailId: e._id },
      });
      await ctx.runMutation(internal.inbox.markEmailEmbedded, {
        emailId: e._id,
        embeddingId: entryId,
      });
      embedded++;
    }
    return { embedded, skipped: 0 };
  },
});

function formatEmailForEmbedding(e: {
  subject: string;
  from: string;
  snippet: string;
}): string {
  // Concatenate the searchable fields with light structure so the embedding
  // captures sender semantics alongside subject and content.
  return `From: ${e.from}\nSubject: ${e.subject}\n\n${e.snippet}`;
}
