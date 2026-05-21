import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal, components } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Agent } from "@convex-dev/agent";
import type { Id } from "./_generated/dataModel";

// Lightweight Agent handle for thread-management calls (createThread,
// listMessages, syncStreams). The full agent with tools + model lives in
// convex/inboxAgent.ts as "use node" because tools pull in node-only
// ai-sdk providers; that file isn't safe to import from non-node code.
// This handle is the no-tools twin used purely to talk to the Agent
// component's storage layer.
const inboxAgentLight = new Agent(components.agent, {
  name: "Inbox Concierge Agent",
  // languageModel/embeddingModel aren't used here — we only call thread
  // management methods. The real config lives in inboxAgent.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  languageModel: undefined as any,
});

// Get or create the user's chat row + agent thread. One thread per user
// (no multi-thread UI in v1).
export const getOrCreateChat = action({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ chatId: Id<"chats">; threadId: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in");

    const existing = await ctx.runQuery(internal.chats.findChatForUser, {
      userId,
    });
    if (existing) {
      return { chatId: existing._id, threadId: existing.threadId };
    }

    const { threadId } = await inboxAgentLight.createThread(ctx, {
      userId,
    });
    const chatId: Id<"chats"> = await ctx.runMutation(
      internal.chats.insertChat,
      { userId, threadId },
    );
    return { chatId, threadId };
  },
});

export const findChatForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return ctx.db
      .query("chats")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
  },
});

export const insertChat = internalMutation({
  args: { userId: v.id("users"), threadId: v.string() },
  handler: async (ctx, args) => {
    return ctx.db.insert("chats", { ...args, createdAt: Date.now() });
  },
});

// Public: stream a user message to the active thread. The Agent component
// handles message persistence, tool calls, and streaming deltas; the UI
// subscribes via listThreadMessages below.
export const sendMessage = action({
  args: { threadId: v.string(), prompt: v.string() },
  handler: async (ctx, args): Promise<void> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in");
    // Lazy-import so non-node callers don't pay the cost.
    const { inboxAgent } = await import("./inboxAgent");
    // Attach userId onto ctx so the agent's tools can read it.
    const ctxWithUser = Object.assign({}, ctx, { userId });
    await inboxAgent.streamText(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ctxWithUser as any,
      { threadId: args.threadId },
      { prompt: args.prompt },
      { saveStreamDeltas: true },
    );
  },
});

// Public: list messages for the active thread, merging stream deltas.
// Shape is dictated by Agent's useThreadMessages hook contract.
export const listThreadMessages = query({
  args: {
    threadId: v.string(),
    paginationOpts: v.object({
      numItems: v.number(),
      cursor: v.union(v.string(), v.null()),
    }),
    streamArgs: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in");
    const chat = await ctx.db
      .query("chats")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!chat || chat.threadId !== args.threadId) {
      throw new Error("Chat not found");
    }
    const result = await inboxAgentLight.listMessages(ctx, {
      threadId: args.threadId,
      paginationOpts: args.paginationOpts,
    });
    const streams = args.streamArgs
      ? await inboxAgentLight.syncStreams(ctx, {
          threadId: args.threadId,
          streamArgs: args.streamArgs,
        })
      : undefined;
    return { ...result, streams };
  },
});

// Public: 4 starter prompts derived from the user's actual labels. We
// keep two universal openers (most-important / can-ignore) and template
// two more from the user's two most-populated labels so the suggestions
// hit something that actually exists in their inbox.
export const suggestedPrompts = query({
  args: {},
  handler: async (ctx): Promise<string[]> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [
        "What's most important in my inbox right now?",
        "What needs a reply today?",
        "What can I ignore?",
        "Summarize my inbox.",
      ];
    }
    const buckets = await ctx.db
      .query("buckets")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const emails = await ctx.db
      .query("emails")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const counts = new Map<string, number>();
    for (const e of emails) {
      if (e.bucketId) counts.set(e.bucketId, (counts.get(e.bucketId) ?? 0) + 1);
    }
    // Sort labels by count (most-populated first); prefer custom labels
    // over defaults so suggestions surface what the user has personalized.
    const ranked = [...buckets].sort((a, b) => {
      const ad = a.isDefault ? 1 : 0;
      const bd = b.isDefault ? 1 : 0;
      if (ad !== bd) return ad - bd;
      return (counts.get(b._id) ?? 0) - (counts.get(a._id) ?? 0);
    });
    const top = ranked.filter((b) => (counts.get(b._id) ?? 0) > 0).slice(0, 2);

    const prompts: string[] = [
      "What's most important in my inbox right now?",
    ];
    if (top[0]) prompts.push(`What's in ${top[0].name} this week?`);
    if (top[1]) prompts.push(`Summarize ${top[1].name}.`);
    prompts.push("What needs a reply today?");
    return prompts.slice(0, 4);
  },
});

// Public: clear the chat — delete the chat row + spawn a fresh thread.
// The Agent component's old thread/messages remain in its tables (which
// is fine; they're scoped to the dead threadId).
export const clearChat = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return;
    const chat = await ctx.db
      .query("chats")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (chat) await ctx.db.delete(chat._id);
  },
});
