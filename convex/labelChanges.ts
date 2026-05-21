import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";

// Label-change orchestration.
//
// Model: the user accumulates label changes (creates, deletes, accepted
// suggestions). Each change increments `pendingChangesCount` on the user's
// row. A persistent "Apply" banner in the UI surfaces the pending count;
// clicking Apply fires one reclassify covering all accumulated changes.
//
// This replaces the debounced auto-reclassify pattern, which fired too
// quickly for deliberate label work in a modal.

// Internal: called from createBucket / deleteBucket / acceptSuggestion.
// Bumps the user's pending-changes counter. Caller passes a short label
// describing what changed so the banner can display it.
export async function notePendingLabelChange(
  ctx: MutationCtx,
  userId: Id<"users">,
  summary: string,
): Promise<void> {
  const existing = await ctx.db
    .query("pendingLabelChanges")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, {
      changeCount: existing.changeCount + 1,
      summaries: [...existing.summaries, summary].slice(-6),
      updatedAt: Date.now(),
    });
  } else {
    await ctx.db.insert("pendingLabelChanges", {
      userId,
      changeCount: 1,
      summaries: [summary],
      updatedAt: Date.now(),
    });
  }
}

// Public: read the current pending state for the signed-in user.
export const pendingChanges = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return ctx.db
      .query("pendingLabelChanges")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
  },
});

// Public: commit pending changes — fires one reclassify and clears the row.
export const applyPendingChanges = mutation({
  args: {},
  handler: async (ctx): Promise<{ applied: number }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in");
    const pending = await ctx.db
      .query("pendingLabelChanges")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!pending) return { applied: 0 };
    const count = pending.changeCount;
    await ctx.db.delete(pending._id);
    await ctx.scheduler.runAfter(
      0,
      internal.workflows.runReclassifyForUser,
      { userId },
    );
    return { applied: count };
  },
});

// Public: discard the pending changes WITHOUT applying. Useful if the
// user adds a label, decides they don't want it after all, and deletes
// it. Net zero changes, no reclassify needed.
export const dismissPendingChanges = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return;
    const pending = await ctx.db
      .query("pendingLabelChanges")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (pending) await ctx.db.delete(pending._id);
  },
});

// Back-compat alias for callers we haven't migrated yet — does NOTHING.
// Renamed from scheduleDebouncedReclassify so legacy imports break loudly
// instead of silently scheduling.
export { notePendingLabelChange as scheduleDebouncedReclassify };
