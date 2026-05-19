# Inbox Concierge

LLM-powered Gmail inbox classifier. Take-home build for Tenex.

**Stack:** React + Vite + TypeScript + Tailwind, Convex (Agent, RAG, Workflow components), Convex Auth (Google OAuth with Gmail read scope), Anthropic + OpenAI providers via `ai` SDK.

## Architecture (one paragraph)

A Convex Workflow durably classifies 200 Gmail threads into user-defined buckets via an LLM batch pipeline (20 emails per call, 3 batches concurrent). Reactive Convex queries stream the results into the UI as they land — emails visibly reflow into their bucket as the workflow completes each batch. Creating a custom bucket triggers the workflow to re-classify all 200 against the updated bucket set. Three "wow" features layered on top: (1) a **model arena + eval harness** — a synthetic-but-human-reviewed dataset evaluates every candidate model on accuracy, cost, and latency, with persisted runs; (2) **auto-bucket discovery** — a Convex Agent proposes buckets it sees in the inbox after first classification; (3) **chat with your inbox** — a sidebar that uses the RAG component to answer natural-language questions over the corpus with citations.

## Setup

### 1. Install deps

```bash
npm install
```

### 2. Create the Convex project

```bash
npx convex dev
```

This will:
- Prompt you to log in to Convex (opens browser).
- Create a new Convex deployment.
- Populate `.env.local` with `VITE_CONVEX_URL` and `CONVEX_DEPLOYMENT`.
- Generate `convex/_generated/`.
- Watch `convex/` and push changes to the dev deployment.

Leave this running in one terminal.

### 3. Set up Convex Auth

In another terminal:

```bash
npx @convex-dev/auth
```

This generates a JWT keypair and configures the necessary env vars on your Convex deployment (`JWT_PRIVATE_KEY`, `JWKS`, `SITE_URL`).

### 4. Create Google Cloud OAuth credentials

1. [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials).
2. Create (or pick) a project.
3. Enable the **Gmail API** under Library.
4. Configure the OAuth consent screen — External, mode "Testing", add yourself as a test user. Add the scope `.../auth/gmail.readonly`.
5. Create credentials → **OAuth client ID** → Web application.
6. Authorized redirect URIs:
   - Local dev: `<your-convex-deployment-site-url>/api/auth/callback/google`
     - Find it with `npx convex env get CONVEX_SITE_URL` or in the Convex dashboard. Looks like `https://acoustic-frog-123.convex.site`.
   - Production: same shape, against your prod Convex deployment.
7. Copy the **Client ID** and **Client secret**.

### 5. Set Google OAuth secrets on Convex

```bash
npx convex env set AUTH_GOOGLE_ID "<your client id>"
npx convex env set AUTH_GOOGLE_SECRET "<your client secret>"
```

### 6. Set LLM provider keys on Convex

```bash
npx convex env set OPENAI_API_KEY "$(security find-generic-password -s OPENAI_API_KEY -w)"
npx convex env set ANTHROPIC_API_KEY "<your anthropic key>"
```

### 7. Run

```bash
npm run dev
```

Open http://localhost:5173, sign in with Google (the same account you added as a test user in step 4), and click **Fetch one Gmail thread**. Subject + sender + snippet means the auth + Gmail integration probe is green.

## Code map

```
src/
  App.tsx              — sign-in + Gmail probe (current end-to-end gate)
  main.tsx             — ConvexAuthProvider + ConvexReactClient
convex/
  convex.config.ts     — registers Agent, RAG, Workflow components
  schema.ts            — authTables + emails / buckets / classificationRuns / evalRuns / evalDatasets / userSettings
  auth.ts              — Google provider with Gmail scope + token capture
  auth.config.ts       — JWT issuer config
  http.ts              — auth HTTP routes
  gmail.ts             — credential persistence + Gmail API probe action
```

## What's next (in build order)

1. ✅ Vite + Convex + Auth scaffold
2. ⬜ Gmail bulk fetch action (200 threads) + emails table population
3. ⬜ Email list UI
4. ⬜ Eval dataset generation + review UI
5. ⬜ Single-model classification workflow (4 default buckets)
6. ⬜ Custom bucket creation → re-classification workflow
7. ⬜ Eval harness page (multi-model)
8. ⬜ Embedding generation + RAG setup
9. ⬜ Chat sidebar
10. ⬜ Auto-bucket discovery agent
11. ⬜ Polish, README polish, video
