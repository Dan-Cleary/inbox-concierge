// Single source of truth for the default bucket taxonomy and the
// classification system prompt. Imported by the classifier, the eval-set
// generator, and the auto-bucket discovery agent so they all share the
// same definitions.

export type DefaultBucketName =
  | "Important"
  | "Can wait"
  | "Auto-archive"
  | "Newsletter";

export const DEFAULT_BUCKETS: ReadonlyArray<{
  name: DefaultBucketName;
  description: string;
}> = [
  {
    name: "Important",
    description:
      "Personal or work email from a real human that needs a response, a decision, or attention soon. Direct messages from colleagues, customers, friends, family. Calendar invites or meeting changes. Anything time-sensitive, security-related (e.g. login alerts to a new device), or money-related (invoices, contract changes, fraud alerts). When in doubt between Important and Can wait, prefer Important — the cost of missing a real message is higher than the cost of seeing one extra.",
  },
  {
    name: "Can wait",
    description:
      "Real correspondence or notifications that matter but aren't time-sensitive. Receipts and order confirmations, shipping updates, routine account notifications, social network notifications, low-priority work updates (FYI threads, broadcast announcements), automated reports the user opted into. The user wants to see these but doesn't need to act today.",
  },
  {
    name: "Auto-archive",
    description:
      "Email that has no value beyond having been delivered. Cold sales pitches and recruiter spam, transactional 'your code is 123456' messages older than a few minutes, password reset emails the user already used, calendar polls that have been answered, expired promo codes, generic confirmations of actions the user already knows happened. If the user would never re-open it, it belongs here.",
  },
  {
    name: "Newsletter",
    description:
      "Bulk content the user subscribed to or got subscribed to: editorial newsletters (Stratechery, Morning Brew, company blogs), product update emails, marketing campaigns, digest emails from communities. The defining trait is one-to-many editorial or marketing content, even if the user finds it valuable. Distinguish from 'Can wait' by content type: a newsletter is something the user reads, a Can wait item is something the user processes.",
  },
];

// Few-shot examples disambiguate the trickiest edges. Keep these in sync
// with the bucket descriptions above — every example here is a case we
// expect the classifier to get right.
export const CLASSIFICATION_EXAMPLES = [
  {
    subject: "Re: revised contract draft — can you take a look today?",
    from: "lawyer@firm.com",
    snippet:
      "Hi Dan, attaching the updated MSA with the indemnity changes we discussed. Need your sign-off by EOD if possible.",
    bucket: "Important",
    reason: "Direct ask from a human with same-day deadline.",
  },
  {
    subject: "Your Amazon order has shipped",
    from: "auto-confirm@amazon.com",
    snippet:
      "Estimated delivery: Friday May 23. Track your package.",
    bucket: "Can wait",
    reason:
      "Real notification the user opted into, but no action required.",
  },
  {
    subject: "Quick question about your tech stack",
    from: "sdr@randomvendor.com",
    snippet:
      "Hey Dan, noticed you're using Postgres at Converge — wanted to share how we help teams like yours...",
    bucket: "Auto-archive",
    reason: "Cold sales outreach with no prior relationship.",
  },
  {
    subject: "The 5 hardest problems in AI inference (this week)",
    from: "newsletter@somenewsletter.com",
    snippet:
      "Welcome back. This week we cover speculative decoding, KV cache reuse, and...",
    bucket: "Newsletter",
    reason: "Editorial digest the user is subscribed to.",
  },
  {
    subject: "Stripe payout for $4,231.00 sent to your bank",
    from: "noreply@stripe.com",
    snippet: "Your payout has been initiated and will arrive in 1-2 days.",
    bucket: "Can wait",
    reason:
      "Money-related notification but routine and informational — no action needed.",
  },
] as const;

// Classification prompt template. Bucket definitions are injected so the
// same prompt works for default buckets, custom buckets, or a mix.
export function buildClassificationSystemPrompt(
  buckets: ReadonlyArray<{ name: string; description: string }>,
): string {
  return `You classify emails into exactly one of the user's buckets.

The user's buckets are:

${buckets
  .map((b, i) => `${i + 1}. ${b.name} — ${b.description}`)
  .join("\n\n")}

Rules:
- Choose exactly one bucket per email.
- Use only the bucket NAMES above. Do not invent new buckets.
- If an email could plausibly fit two buckets, prefer the bucket the user is more likely to want to see first (lean toward action-required over informational).
- Base your decision only on the subject, sender, and snippet you're given. Do not assume content you can't see.

For each email, return a JSON object with two fields:
- "bucket": the exact bucket name (one of the names above)
- "reason": one short sentence (max 15 words) explaining why

Return a JSON array, one object per input email, in the same order.`;
}

// Shorthand for the common case: default buckets only.
export const DEFAULT_CLASSIFICATION_SYSTEM_PROMPT =
  buildClassificationSystemPrompt(DEFAULT_BUCKETS);
