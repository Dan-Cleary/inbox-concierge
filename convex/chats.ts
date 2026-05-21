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
