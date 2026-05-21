"use node";

import { v } from "convex/values";
import { internalAction, action } from "./_generated/server";
import { internal } from "./_generated/api";
import { components } from "./_generated/api";
import { Agent } from "@convex-dev/agent";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";

// Convex Agent that proposes new buckets after looking at the user's
// already-classified inbox. One-shot use (no thread) — we just need
// structured output, but routing through the Agent component keeps
// orchestration consistent with the chat feature.
const bucketDiscoveryAgent = new Agent(components.agent, {
  name: "bucket-discovery",
  languageModel: anthropic("claude-sonnet-4-6"),
  instructions: `You analyze a user's classified email inbox and propose new buckets that would meaningfully improve their organization.

Look for natural clusters of emails that:
- Don't fit cleanly into any existing bucket
- Are large enough to be worth a bucket of their own (at least ~5 emails)
- Represent a workflow or sender-category the user clearly cares about (recurring sender, specific topic, repeating pattern)

Do NOT propose buckets that overlap with existing ones. Do NOT propose generic buckets like "Misc" or "Other". Each suggestion must be concrete and immediately useful.

Output 0-3 suggestions. Quality over quantity: propose only buckets you are confident about. If the existing buckets already cover everything well, return an empty array.`,
});

const suggestionSchema = z.object({
  suggestions: z
    .array(
      z.object({
        name: z
          .string()
          .describe(
            "Concise bucket name (2-3 words max), e.g. 'Production alerts' or 'From investors'",
          ),
        description: z
          .string()
          .describe(
            "Plain-English criterion (1-2 sentences) that will be fed back to the classifier so it knows when to put an email here.",
          ),
        rationale: z
          .string()
          .max(120)
          .describe(
            "ONE punchy phrase (max 12 words) explaining why. Examples: 'Triage prod alerts away from human messages.' or 'Group 40+ Loopsbot contact alerts.'",
          ),
        sampleEmailIds: z
          .array(z.string())
          .min(2)
          .max(5)
          .describe(
            "2-5 email IDs from the inbox that exemplify this bucket. Use the exact id strings from the input.",
          ),
      }),
    )
    .max(3),
});

// Public entry point: trigger discovery for the signed-in user.
export const triggerDiscovery = action({
  args: {},
  handler: async (ctx): Promise<{ created: number; skipped: number }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in");
    return (await ctx.runAction(internal.agents.discoverBuckets, {
      userId,
    })) as { created: number; skipped: number };
  },
});

export const discoverBuckets = internalAction({
  args: { userId: v.id("users") },
  handler: async (
    ctx,
    args,
  ): Promise<{ created: number; skipped: number }> => {
    const emails = (await ctx.runQuery(
      internal.agentsDb.getClassifiedInboxForAgent,
      { userId: args.userId },
    )) as Array<{
      _id: string;
      subject: string;
      from: string;
      snippet: string;
      bucket: string;
    }>;
    if (emails.length < 30) {
      // Not enough signal yet.
      return { created: 0, skipped: 0 };
    }
    const buckets = (await ctx.runQuery(internal.inbox.getBuckets, {
      userId: args.userId,
    })) as Array<{ name: string; description: string }>;

    const existingNames = buckets.map((b) => b.name);
    const inboxSummary = emails
      .map(
        (e) =>
          `id: ${e._id} | bucket: ${e.bucket} | from: ${e.from} | subject: ${e.subject}`,
      )
      .join("\n");

    const prompt = `Existing buckets the user already has:
${buckets.map((b) => `- ${b.name}: ${b.description}`).join("\n")}

Here is the user's current classified inbox (${emails.length} emails):
${inboxSummary}

Propose 0-3 new buckets that would improve organization beyond the existing ones (${existingNames.join(", ")}). For each, include 2-5 sampleEmailIds drawn from the list above whose ids you can verify exist in the input.`;

    const { object } = await bucketDiscoveryAgent.generateObject(
      ctx,
      { userId: args.userId },
      {
        schema: suggestionSchema,
        prompt,
      },
    );

    // Validate that proposed sampleEmailIds are real ids from the inbox we
    // sent; the LLM occasionally hallucinates.
    const validEmailIds = new Set(emails.map((e) => e._id));
    let created = 0;
    let skipped = 0;
    for (const s of object.suggestions) {
      // Reject if the LLM proposed an existing-bucket name.
      if (existingNames.some((n) => n.toLowerCase() === s.name.toLowerCase())) {
        skipped++;
        continue;
      }
      const samples = s.sampleEmailIds
        .filter((id) => validEmailIds.has(id))
        .slice(0, 5);
      if (samples.length < 2) {
        skipped++;
        continue;
      }
      await ctx.runMutation(internal.agentsDb.insertSuggestion, {
        userId: args.userId,
        name: s.name,
        description: s.description,
        rationale: s.rationale,
        sampleEmailIds: samples as Id<"emails">[],
      });
      created++;
    }
    return { created, skipped };
  },
});
