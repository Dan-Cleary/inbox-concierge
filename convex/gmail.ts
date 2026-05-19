import { v } from "convex/values";
import { internalMutation, action, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";

// Persist Gmail OAuth tokens for a user. Called from auth.ts after sign-in.
export const upsertCredentials = internalMutation({
  args: {
    userId: v.id("users"),
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    scope: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("gmailCredentials")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    if (existing) {
      // Only overwrite refresh_token if we got a new one — Google sometimes
      // omits it on re-auth and we don't want to wipe a valid token.
      await ctx.db.patch(existing._id, {
        accessToken: args.accessToken,
        refreshToken: args.refreshToken ?? existing.refreshToken,
        expiresAt: args.expiresAt,
        scope: args.scope,
      });
    } else {
      await ctx.db.insert("gmailCredentials", args);
    }
  },
});

export const getCredentialsForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return ctx.db
      .query("gmailCredentials")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
  },
});

type GmailListResponse = {
  threads?: Array<{ id: string }>;
  nextPageToken?: string;
};

type GmailMessage = {
  id: string;
  threadId: string;
  snippet?: string;
  internalDate?: string;
  payload?: { headers?: Array<{ name: string; value: string }> };
};

type GmailThread = {
  id: string;
  messages?: GmailMessage[];
};

// Integration probe: fetch one Gmail thread for the current user and return
// its subject + snippet. This is the "auth + Gmail end-to-end works" gate.
// Returns null if the user isn't signed in or has no Gmail credentials yet.
export const probeFirstThread = action({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ subject: string; from: string; snippet: string } | null> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const creds = await ctx.runQuery(internal.gmail.getCredentialsForUser, {
      userId,
    });
    if (!creds) return null;

    const listRes = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/threads?maxResults=1",
      { headers: { Authorization: `Bearer ${creds.accessToken}` } },
    );
    if (!listRes.ok) {
      throw new Error(
        `Gmail list failed: ${listRes.status} ${await listRes.text()}`,
      );
    }
    const list = (await listRes.json()) as GmailListResponse;
    const threadId = list.threads?.[0]?.id;
    if (!threadId) return null;

    const threadRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
      { headers: { Authorization: `Bearer ${creds.accessToken}` } },
    );
    if (!threadRes.ok) {
      throw new Error(
        `Gmail thread fetch failed: ${threadRes.status} ${await threadRes.text()}`,
      );
    }
    const thread = (await threadRes.json()) as GmailThread;
    const msg = thread.messages?.[0];
    const headers = msg?.payload?.headers ?? [];
    const subject =
      headers.find((h) => h.name === "Subject")?.value ?? "(no subject)";
    const from = headers.find((h) => h.name === "From")?.value ?? "(unknown)";
    return { subject, from, snippet: msg?.snippet ?? "" };
  },
});
