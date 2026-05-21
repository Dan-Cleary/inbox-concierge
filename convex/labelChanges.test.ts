import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

// Helper: seed a user + the default buckets so each test starts from a
// realistic post-signup state.
async function seedUser(
  t: ReturnType<typeof convexTest>,
): Promise<Id<"users">> {
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Test User",
      email: "test@example.com",
    });
    await ctx.runMutation(internal.inbox.seedDefaultBuckets, { userId });
    return userId;
  });
}

describe("createBucket (public mutation)", () => {
  // We can't actually call the public mutation via withIdentity here
  // because Convex Auth stamps a `tokenIdentifier` we don't replicate.
  // Test the agent-facing internal variant instead — same code path
  // minus auth resolution.

  it("rejects duplicate names (case-insensitive)", async () => {
    const t = convexTest(schema);
    const userId = await seedUser(t);

    // Default labels include "Important" — try to add a custom dupe
    await expect(
      t.mutation(internal.inbox.createBucketForUser, {
        userId,
        name: "important", // lowercased — should still collide
        description: "should collide with default Important",
      }),
    ).rejects.toThrow(/already exists/);
  });

  it("enforces the MAX_LABELS cap", async () => {
    const t = convexTest(schema);
    const userId = await seedUser(t);

    // Add 8 customs to reach cap (4 defaults + 8 = 12)
    for (let i = 0; i < 8; i++) {
      await t.mutation(internal.inbox.createBucketForUser, {
        userId,
        name: `Custom ${i}`,
        description: `bucket ${i}`,
      });
    }
    // 13th attempt should bounce
    await expect(
      t.mutation(internal.inbox.createBucketForUser, {
        userId,
        name: "Overflow",
        description: "one too many",
      }),
    ).rejects.toThrow(/at most 12 labels/);
  });

  it("records a pending change after creation", async () => {
    const t = convexTest(schema);
    const userId = await seedUser(t);
    await t.mutation(internal.inbox.createBucketForUser, {
      userId,
      name: "From investors",
      description: "VC outreach about funding rounds",
    });

    const pending = await t.run((ctx) =>
      ctx.db
        .query("pendingLabelChanges")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique(),
    );
    expect(pending).not.toBeNull();
    expect(pending?.changeCount).toBe(1);
    expect(pending?.summaries[0]).toMatch(/From investors/);
  });
});

describe("deleteBucketForUser (agent tool)", () => {
  it("refuses to delete a default label", async () => {
    const t = convexTest(schema);
    const userId = await seedUser(t);
    await expect(
      t.mutation(internal.inbox.deleteBucketForUser, {
        userId,
        bucketName: "Important",
      }),
    ).rejects.toThrow(/default label/);
  });

  it("deletes a custom label and unassigns any emails that were in it", async () => {
    const t = convexTest(schema);
    const userId = await seedUser(t);

    // Add a custom label
    const bucketId = await t.mutation(internal.inbox.createBucketForUser, {
      userId,
      name: "Newsroom",
      description: "Newsletters from specific publishers",
    });

    // Plant an email assigned to that label
    const emailId = await t.run((ctx) =>
      ctx.db.insert("emails", {
        userId,
        gmailThreadId: "t1",
        gmailMessageId: "m1",
        subject: "Hello",
        snippet: "...",
        from: "test@example.com",
        date: Date.now(),
        classifyStatus: "classified",
        bucketId,
      }),
    );

    await t.mutation(internal.inbox.deleteBucketForUser, {
      userId,
      bucketName: "Newsroom",
    });

    // Label gone
    const found = await t.run((ctx) => ctx.db.get(bucketId));
    expect(found).toBeNull();

    // Email kept but unassigned
    const email = await t.run((ctx) => ctx.db.get(emailId));
    expect(email).not.toBeNull();
    expect(email?.bucketId).toBeUndefined();
  });

  it("errors on unknown label name (catches typos before they propagate)", async () => {
    const t = convexTest(schema);
    const userId = await seedUser(t);
    await expect(
      t.mutation(internal.inbox.deleteBucketForUser, {
        userId,
        bucketName: "Does not exist",
      }),
    ).rejects.toThrow(/No label named/);
  });
});

describe("pendingLabelChanges accumulator", () => {
  it("increments changeCount across multiple label mutations", async () => {
    const t = convexTest(schema);
    const userId = await seedUser(t);

    await t.mutation(internal.inbox.createBucketForUser, {
      userId,
      name: "A",
      description: "first added",
    });
    await t.mutation(internal.inbox.createBucketForUser, {
      userId,
      name: "B",
      description: "second added",
    });
    await t.mutation(internal.inbox.deleteBucketForUser, {
      userId,
      bucketName: "A",
    });

    const pending = await t.run((ctx) =>
      ctx.db
        .query("pendingLabelChanges")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique(),
    );
    expect(pending?.changeCount).toBe(3);
    expect(pending?.summaries).toEqual([
      expect.stringMatching(/A/),
      expect.stringMatching(/B/),
      expect.stringMatching(/Removed.*A/),
    ]);
  });

  it("trims summaries to the last 6 entries (UI never reads more)", async () => {
    const t = convexTest(schema);
    const userId = await seedUser(t);

    for (let i = 0; i < 8; i++) {
      await t.mutation(internal.inbox.createBucketForUser, {
        userId,
        name: `Label ${i}`,
        description: `bucket ${i}`,
      });
    }
    const pending = await t.run((ctx) =>
      ctx.db
        .query("pendingLabelChanges")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique(),
    );
    expect(pending?.changeCount).toBe(8);
    expect(pending?.summaries).toHaveLength(6);
    // Most recent change must be present (we keep the tail)
    expect(pending?.summaries[5]).toMatch(/Label 7/);
  });
});
