// gmail.ts reads OAuth env vars (AUTH_GOOGLE_ID/SECRET) via process.env from
// the Convex Node runtime. The convex/ tsconfig has node types enabled, but
// the frontend's tsconfig.app.json (which transitively type-checks this file
// via the api.d.ts re-export) does not — so we declare the minimal shape
// locally to keep both build paths green.
declare const process: { env: Record<string, string | undefined> };

import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  internalAction,
  action,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";

// ----- Credential persistence (called from convex/auth.ts) ----------------

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

// ----- Token refresh -------------------------------------------------------

// Google access tokens expire after ~1 hour. We refresh proactively when
// less than this many seconds remain so a long classification workflow
// doesn't half-finish before the token dies.
const REFRESH_SAFETY_WINDOW_SEC = 5 * 60;

type GoogleRefreshResponse = {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
  // Google does NOT return a new refresh_token on refresh; the original one
  // stays valid until revoked.
};

// Exchange the stored refresh_token for a fresh access_token and persist it.
// Returns the new access_token. Throws if no refresh_token is stored or if
// Google rejects the refresh.
export const refreshAccessToken = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }): Promise<string> => {
    const creds = await ctx.runQuery(internal.gmail.getCredentialsForUser, {
      userId,
    });
    if (!creds?.refreshToken) {
      throw new Error(
        "No refresh_token stored for this user. Sign out and sign back in to re-grant Gmail access.",
      );
    }
    const clientId = process.env.AUTH_GOOGLE_ID;
    const clientSecret = process.env.AUTH_GOOGLE_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error(
        "AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET not set on this Convex deployment.",
      );
    }
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: creds.refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) {
      throw new Error(
        `Gmail token refresh failed: ${res.status} ${await res.text()}`,
      );
    }
    const data = (await res.json()) as GoogleRefreshResponse;
    await ctx.runMutation(internal.gmail.upsertCredentials, {
      userId,
      accessToken: data.access_token,
      refreshToken: creds.refreshToken,
      expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
      scope: data.scope ?? creds.scope,
    });
    return data.access_token;
  },
});

// Get a valid Gmail access_token for the user, refreshing via the stored
// refresh_token when the current one is close to expiring. Throws if the
// user has no credentials at all (which means they need to re-auth).
//
// Exported so any action that hits the Gmail API can share one refresh path.
// ctx is intentionally typed loosely — both V8 and Node action contexts call
// this and they have slightly different generic shapes; what matters is that
// runQuery/runAction exist with the expected behavior.
export async function getValidAccessToken(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  userId: Id<"users">,
): Promise<string> {
  const creds = (await ctx.runQuery(internal.gmail.getCredentialsForUser, {
    userId,
  })) as {
    accessToken: string;
    expiresAt?: number;
  } | null;
  if (!creds) {
    throw new Error(
      "No Gmail credentials stored for user — sign out and sign in again.",
    );
  }
  const nowSec = Math.floor(Date.now() / 1000);
  const expiresAt = creds.expiresAt ?? 0;
  if (expiresAt - REFRESH_SAFETY_WINDOW_SEC > nowSec) {
    return creds.accessToken;
  }
  return (await ctx.runAction(internal.gmail.refreshAccessToken, {
    userId,
  })) as string;
}

// ----- Gmail integration probe --------------------------------------------

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
export const probeFirstThread = action({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ subject: string; from: string; snippet: string } | null> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    let accessToken: string;
    try {
      accessToken = await getValidAccessToken(ctx, userId);
    } catch {
      return null;
    }

    const listRes = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/threads?maxResults=1",
      { headers: { Authorization: `Bearer ${accessToken}` } },
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
      { headers: { Authorization: `Bearer ${accessToken}` } },
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
