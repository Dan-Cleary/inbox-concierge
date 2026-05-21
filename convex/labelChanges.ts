import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const RECLASSIFY_DEBOUNCE_MS = 1500;

// Schedule a reclassify for `userId` after a short debounce, cancelling
// any previously-scheduled reclassify so back-to-back label changes
// collapse into one workflow run.
//
// Callers: createBucket, deleteBucket, acceptSuggestion — anything that
// changes the bucket set in a way that affects existing classifications.
export async function scheduleDebouncedReclassify(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<void> {
  const existing = await ctx.db
    .query("reclassifyJobs")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  if (existing) {
    // Best-effort cancel; if the job already started, this is a no-op
    // and the new schedule still wins.
    try {
      await ctx.scheduler.cancel(existing.scheduledFnId);
    } catch {
      // Already ran or doesn't exist — fine, we'll overwrite.
    }
    await ctx.db.delete(existing._id);
  }
  const scheduledFnId = await ctx.scheduler.runAfter(
    RECLASSIFY_DEBOUNCE_MS,
    internal.workflows.runReclassifyForUser,
    { userId },
  );
  await ctx.db.insert("reclassifyJobs", { userId, scheduledFnId });
}
