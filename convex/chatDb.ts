import { v } from "convex/values";
import {
  internalMutation,
  mutation,
  query,
} from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";

// Insert the user's question and a pending assistant placeholder atomically.
// The placeholder gets patched with the actual answer once generation
// completes (or marked failed on error).
export const insertUserAndAssistantPlaceholder = internalMutation({
  args: { userId: v.id("users"), question: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{
    userMessageId: Id<"chatMessages">;
    assistantMessageId: Id<"chatMessages">;
  }> => {
    const now = Date.now();
    const userMessageId = await ctx.db.insert("chatMessages", {
      userId: args.userId,
      role: "user",
      content: args.question,
      createdAt: now,
    });
    const assistantMessageId = await ctx.db.insert("chatMessages", {
      userId: args.userId,
      role: "assistant",
      content: "",
      pending: true,
      createdAt: now + 1, // ensure stable ordering after the user msg
    });
    return { userMessageId, assistantMessageId };
  },
});

export const finalizeAssistantMessage = internalMutation({
  args: {
    messageId: v.id("chatMessages"),
    content: v.string(),
    citations: v.array(v.id("emails")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      content: args.content,
      citations: args.citations,
      pending: false,
    });
  },
});

export const failAssistantMessage = internalMutation({
  args: { messageId: v.id("chatMessages"), error: v.string() },
  handler: async (ctx, { messageId, error }) => {
    await ctx.db.patch(messageId, {
      pending: false,
      error,
      content: "Sorry, something went wrong answering that.",
    });
  },
});

// Public: list chat messages for the signed-in user, oldest first so the
// UI can render them top-to-bottom. We hydrate citations into a lightweight
// shape so the chat sidebar doesn't need to fan out to a second query.
export const listMessages = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const msgs = await ctx.db
      .query("chatMessages")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    msgs.sort((a, b) => a.createdAt - b.createdAt);
    const out = [];
    for (const m of msgs) {
      const citations: Array<{
        _id: Id<"emails">;
        subject: string;
        from: string;
      }> = [];
      for (const id of m.citations ?? []) {
        const e = await ctx.db.get(id);
        if (e) {
          citations.push({ _id: e._id, subject: e.subject, from: e.from });
        }
      }
      out.push({ ...m, citations });
    }
    return out;
  },
});

export const clearChat = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return;
    const msgs = await ctx.db
      .query("chatMessages")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const m of msgs) await ctx.db.delete(m._id);
  },
});
