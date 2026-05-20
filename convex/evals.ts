"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { DEFAULT_BUCKETS } from "./prompts";

// Generate a synthetic eval dataset using Claude. Produces roughly evenly
// distributed examples across the default buckets, plus a few intentionally
// ambiguous cases that test the tie-breaking rules in the system prompt.
//
// The dataset is written to evalDatasets + evalDatasetEmails. Dan reviews
// the labels via the UI and marks the dataset as reviewed.
export const generateDataset = action({
  args: {
    targetSize: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ datasetId: string; emailCount: number }> => {
    const perBucket = Math.floor(args.targetSize / DEFAULT_BUCKETS.length);
    const ambiguous = Math.max(4, args.targetSize - perBucket * DEFAULT_BUCKETS.length);

    const emailSchema = z.object({
      subject: z.string(),
      from: z.string(),
      snippet: z.string(),
      expectedBucket: z.enum(
        DEFAULT_BUCKETS.map((b) => b.name) as [string, ...string[]],
      ),
      rationale: z.string(),
    });
    const schema = z.object({
      emails: z.array(emailSchema),
    });

    const bucketTaxonomy = DEFAULT_BUCKETS.map(
      (b) => `- ${b.name}: ${b.description}`,
    ).join("\n");

    const prompt = `Generate ${perBucket * DEFAULT_BUCKETS.length + ambiguous} synthetic emails for an inbox classification evaluation dataset.

The taxonomy is:
${bucketTaxonomy}

Requirements:
- About ${perBucket} emails per bucket, distributed naturally.
- Include ~${ambiguous} intentionally ambiguous emails that sit on the boundary between two buckets (e.g. a payment notification that's borderline between Important and Can wait, a newsletter that contains personal commentary, etc.) — label these with your best judgment and explain in the rationale.
- Use a wide variety of realistic senders: real-sounding company names, individual names, no-reply addresses, etc. Avoid using "example.com".
- Subjects and snippets should look like real Gmail content. Snippets are 1-2 sentences from the email body.
- For each email return: subject, from (sender display + email), snippet, expectedBucket (exact name from the taxonomy), rationale (one sentence explaining the label).
- Do not repeat the same sender across more than 2 emails.
- Cover a variety of common cases: cold sales, calendar invites, security alerts, receipts, shipping, newsletters of different flavors (editorial vs marketing), spam-adjacent stuff, friend/family casual, etc.

Return a JSON object with an "emails" array.`;

    const { object } = await generateObject({
      model: anthropic("claude-sonnet-4-6"),
      schema,
      prompt,
    });

    const datasetId: string = await ctx.runMutation(
      internal.evalsDb.createDataset,
      {
        notes: args.notes,
        emails: object.emails,
      },
    );

    return { datasetId, emailCount: object.emails.length };
  },
});
