// Reads REVIEWER_SECRET / REVIEWER_USER_ID via process.env (Convex Node
// runtime). Same shim as convex/gmail.ts — the convex tsconfig has node
// types but the frontend's transitive check of api.d.ts doesn't.
declare const process: { env: Record<string, string | undefined> };

import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import type { Id } from "./_generated/dataModel";

const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

// Google provider configured to request Gmail read access AND a refresh_token
// so we can hit the Gmail API from Convex actions long after sign-in.
//
// access_type=offline + prompt=consent are required to get a refresh_token back
// on every sign-in; without them, Google only returns a refresh_token on the
// very first authorization, which is fragile during dev.
//
// The `profile` override captures the OAuth tokens returned by Google and
// stashes them on the profile object. `createOrUpdateUser` below picks them
// off before persisting the user, and writes them to gmailCredentials.
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Google({
      authorization: {
        params: {
          scope: `openid email profile ${GMAIL_READONLY_SCOPE}`,
          access_type: "offline",
          prompt: "consent",
        },
      },
      profile(profile, tokens) {
        return {
          id: profile.sub,
          name: profile.name,
          email: profile.email,
          image: profile.picture,
          gmailAccessToken: tokens.access_token,
          gmailRefreshToken: tokens.refresh_token,
          gmailExpiresAt: tokens.expires_at,
          gmailScope: tokens.scope,
        } as never;
      },
    }),
    // Reviewer-link sign-in. The take-home reviewer can't enroll as a
    // Google OAuth test user (we don't have their emails), so a magic-
    // link mode lets them sign in as a designated demo user (typically
    // Dan's own account) when they hit the app with ?reviewer=<secret>.
    //
    // Two env vars on the deployment, both required for the path to work:
    //   REVIEWER_SECRET   — the magic value embedded in the link
    //   REVIEWER_USER_ID  — the user document id to log them in as
    // If either is unset, sign-in fails closed (returns null).
    ConvexCredentials({
      id: "reviewer",
      authorize: async (credentials) => {
        const expected = process.env.REVIEWER_SECRET;
        const userId = process.env.REVIEWER_USER_ID as
          | Id<"users">
          | undefined;
        if (!expected || !userId) return null;
        if (credentials?.secret !== expected) return null;
        return { userId };
      },
    }),
  ],
  callbacks: {
    // The callback ctx is typed against a generic data model, so it doesn't
    // know about our custom tables (gmailCredentials) or the `email` index
    // on users. We cast db to any for the table/index lookups; the runtime
    // is fine because these are real Convex tables/indexes from our schema.
    async createOrUpdateUser(ctx, args) {
      // Reviewer-link path: the credentials provider returns { userId }
      // pointing at an existing user (REVIEWER_USER_ID). Don't try to
      // insert/patch — just hand that userId back to Convex Auth.
      if (args.type === "credentials") {
        const reviewerUserId = (args.profile as { userId?: Id<"users"> })
          .userId;
        if (reviewerUserId) return reviewerUserId;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = ctx.db as any;
      const {
        gmailAccessToken,
        gmailRefreshToken,
        gmailExpiresAt,
        gmailScope,
        ...userFields
      } = args.profile as {
        gmailAccessToken?: string;
        gmailRefreshToken?: string;
        gmailExpiresAt?: number;
        gmailScope?: string;
        email?: string;
        name?: string;
        image?: string;
      };

      // Step 1: upsert the user doc (without the smuggled token fields).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      type Q = any;
      let userId = args.existingUserId;
      if (userId) {
        await db.patch(userId, userFields);
      } else if (userFields.email) {
        const byEmail = await db
          .query("users")
          .withIndex("email", (q: Q) => q.eq("email", userFields.email))
          .unique();
        if (byEmail) {
          userId = byEmail._id;
          await db.patch(userId, userFields);
        } else {
          userId = await db.insert("users", userFields);
        }
      } else {
        userId = await db.insert("users", userFields);
      }
      if (!userId) throw new Error("Failed to upsert user");

      // Step 2: persist Gmail tokens if we got them.
      if (gmailAccessToken) {
        const existing = await db
          .query("gmailCredentials")
          .withIndex("by_user", (q: Q) => q.eq("userId", userId))
          .unique();
        const payload = {
          userId,
          accessToken: gmailAccessToken,
          // Google sometimes omits refresh_token on re-auth; keep the prior one.
          refreshToken: gmailRefreshToken ?? existing?.refreshToken,
          expiresAt: gmailExpiresAt,
          scope: gmailScope ?? GMAIL_READONLY_SCOPE,
        };
        if (existing) {
          await db.patch(existing._id, payload);
        } else {
          await db.insert("gmailCredentials", payload);
        }
      }

      return userId;
    },
  },
});
