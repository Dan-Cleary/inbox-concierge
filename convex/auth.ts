import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";

const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

// Google provider configured to request Gmail read access AND a refresh_token
// so we can hit the Gmail API from Convex actions long after sign-in.
//
// access_type=offline + prompt=consent are required to get a refresh_token back
// on every sign-in — without them, Google only returns a refresh_token on the
// very first authorization, which is fragile during dev.
//
// The `profile` override is where we capture the OAuth tokens returned by
// Google. @auth/core passes the raw token response as the second argument; we
// stash it on the profile object so afterUserCreatedOrUpdated can persist it.
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
          // Smuggle tokens through the profile object so we can pick them up
          // in afterUserCreatedOrUpdated below. These fields aren't persisted
          // on the users table — they're only used during this one callback.
          _gmailAccessToken: tokens.access_token,
          _gmailRefreshToken: tokens.refresh_token,
          _gmailExpiresAt: tokens.expires_at,
          _gmailScope: tokens.scope,
        } as never;
      },
    }),
  ],
  callbacks: {
    async afterUserCreatedOrUpdated(ctx, args) {
      const profile = args.profile as {
        _gmailAccessToken?: string;
        _gmailRefreshToken?: string;
        _gmailExpiresAt?: number;
        _gmailScope?: string;
      };
      if (!profile?._gmailAccessToken) return;
      await ctx.runMutation(internal.gmail.upsertCredentials, {
        userId: args.userId,
        accessToken: profile._gmailAccessToken,
        refreshToken: profile._gmailRefreshToken,
        expiresAt: profile._gmailExpiresAt,
        scope: profile._gmailScope ?? GMAIL_READONLY_SCOPE,
      });
    },
  },
});
