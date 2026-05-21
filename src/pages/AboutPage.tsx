// Submission walkthrough page — surfaced at /about so it can be flipped to
// during the video demo. Mirrors the prompt's structure (bar, checklist,
// video sections) so a reviewer can verify each criterion against the app.

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl py-2">
      <header className="mb-8">
        <p className="kicker text-[var(--moss)]">Take-home submission</p>
        <h1 className="mt-2 text-[28px] font-medium leading-tight tracking-tight">
          Inbox Concierge — for Tenex.
        </h1>
      </header>

      <Section
        kicker="The bar"
        title=""
        body=""
      >
        <CriterionList
          items={[
            {
              label: "Production quality",
              body: "Modular, linted, edge-case aware (error handling, rate limits).",
              evidence: [
                "Modular: convex/ is split by bounded context — inbox, workflows, inboxAgent, rag, evals, classify — each file owns one job and is independently testable",
                "Linted: TS strict + ESLint, 0 errors on `npm run lint`; CI gates every push (lint → build → test)",
                "Tested: 66 vitest tests, convex-test integration tests for label mutations, RTL for components",
                "Error handling: classifier failures retry with exponential backoff; on permanent failure, the email's prior label is preserved (most failures are transient)",
                "Rate limits: Gmail 429s caught with exponential backoff in the sync action; LLM provider retries are handled by the AI SDK; classification workflow caps concurrency at 3 to avoid spiking provider quota",
                "Durable: Convex Workflow for classification survives action timeouts (10-min limit) — 200 emails in batches of 10, resumable",
              ],
            },
            {
              label: "AI-native speed",
              body: "Used AI to build ~10× faster — and verified the output instead of trusting it.",
              evidence: [
                "Speed: ~2 days, part-time, end-to-end with Claude Code + gstack skills (planning, design review, QA loops)",
                "Verified — visible state: every LLM-assigned label renders on every email row so drift is observable, not buried in a confidence score",
                "Verified — eval harness: locked GPT-5.5 dataset benchmarks every model on the same examples; cost-vs-accuracy scatter shipped in the app, not a notebook",
                "Verified — tests: 66 vitest + convex-test cases cover bucket CRUD, the pending-changes accumulator, default-label guards, and label-cap enforcement",
                "Verified — local CI gate: lint + build + test runs locally before every push (lesson learned the hard way)",
                "Refined — every prompt change is checked against the locked dataset before merging; classifier prompts iterated 4-5 times this way",
              ],
            },
            {
              label: "Wow factors",
              body: "High-leverage extensions beyond the spec.",
              evidence: [
                "Eval harness — pick any of 8 models, scatter cost vs. accuracy on a locked dataset",
                "Chat with your inbox — RAG + Agent with 6 tools (search, list, create/delete label, reclassify)",
                "Auto-bucket discovery — Agent reads a sample of your inbox and suggests custom labels",
              ],
            },
          ]}
        />
      </Section>

      <Section
        kicker="LLM usage"
        title="Where AI shows up in the product."
        body="Three distinct LLM surfaces, each picked for what it actually needs."
      >
        <div className="space-y-4">
          <UsageRow
            surface="Classification"
            lib="AI SDK · generateObject() with a Zod schema"
            body="One-shot, structured output, no tool calls, no streaming. Send a batch of 10 emails, get back 10 {bucketName, confidence} pairs. The Agent component would be ceremony here — generateObject is exactly the right primitive."
          />
          <UsageRow
            surface="Dataset generation (evals)"
            lib="AI SDK · generateObject() with GPT-5.5"
            body="Same shape as classification: ask a strong model to label a sample so we have a locked dataset to benchmark cheaper models against. One call, structured output."
          />
          <UsageRow
            surface="Chat with inbox"
            lib="Convex Agent component (wraps AI SDK)"
            body="Multi-turn, tool calls, streamed deltas, persisted threads. The Agent component gives me thread storage, syncStreams for the React hook, tool-call retries, and step bounds out of the box. Reimplementing that on raw ai-sdk would re-build the same thing worse."
          />
          <UsageRow
            surface="Bucket discovery"
            lib="Convex Agent · generateObject()"
            body="One-shot structured output, but I used the Agent variant so the call inherits the same model config and observability as chat. The Agent component supports both shapes."
          />
        </div>
        <p className="mt-4 text-[12px] text-[var(--mute)]">
          Provider routing goes through Anthropic, OpenAI, and Google directly via their AI SDK packages. Models tested: Sonnet 4.6, Haiku 4.5, Opus 4.7, GPT-5.5/mini/nano, Gemini 3.5 Flash.
        </p>
      </Section>

      <Section
        kicker="Agent tools"
        title="What chat can actually do."
        body="The chat agent has six tools. Each is scoped to the signed-in user's data via ctx.userId — no cross-tenant access."
      >
        <div className="grid gap-2">
          <ToolRow
            name="searchInbox"
            body="RAG search over the user's email corpus. Returns hits with citation handles the UI renders as chips."
          />
          <ToolRow
            name="listEmails"
            body="Date-ordered listing with optional label filter. Added after the agent hallucinated 'the latest important email' from RAG snippets — this gives it a deterministic path for 'most recent X'."
          />
          <ToolRow
            name="listLabels"
            body="Returns all of the user's labels with current email counts. The agent uses this to ground references like 'the From investors one'."
          />
          <ToolRow
            name="createLabel"
            body="Creates a new label. Enforces the same MAX_LABELS=12 cap and dupe check as the UI button. Queues a pending change."
          />
          <ToolRow
            name="deleteLabel"
            body="Deletes a custom label and unassigns its emails. Refuses to delete the four default labels (Important / Can wait / Newsletter / Auto-archive)."
          />
          <ToolRow
            name="runReclassify"
            body="Kicks off the classification workflow over the user's 200 emails and clears the pending-changes banner. Saves the user a trip to the Apply button."
          />
        </div>
      </Section>

      <Section
        kicker="Architecture decisions"
        title="The non-obvious calls."
        body=""
      >
        <div className="space-y-5">
          <Decision
            title="Convex as the whole backend"
            body="Sync engine + Agent + RAG + Workflow as one platform means I write zero glue: queries are reactive in React without a state library, the agent's tools are just Convex mutations, RAG is a component with per-user namespacing, and the classification pipeline is a durable workflow that survives action timeouts. The alternative (Next.js API routes + Postgres + a queue + a separate vector DB + WebSocket layer) would have eaten the whole 2 days on plumbing."
          />
          <Decision
            title="Pending-changes accumulator instead of debounce"
            body="My first cut debounced reclassification 1.5s after a label edit. That breaks the moment label creation takes 30–60s (modal + LLM-generated description), so every keystroke would race the timer. Replaced with an explicit 'Apply & re-sort' banner that accumulates label changes and runs reclassify once on commit. Same number of clicks, predictable behavior."
          />
          <Decision
            title="Per-user RAG namespacing"
            body="The RAG component is namespaced by `user:${userId}`. Embeddings are isolated per inbox so a chat query can't accidentally retrieve another user's content even if the userId filter on the action were ever wrong. Defense in depth."
          />
          <Decision
            title="Reviewer-link auth path"
            body="Google OAuth in Testing mode blocks anyone not added as a test user, which would have meant collecting reviewer emails before the demo. Built a ConvexCredentials provider keyed on a shared secret in the URL that signs in as a designated demo user. The reviewer hits a link and lands in a fully-populated inbox — no coordination needed."
          />
          <Decision
            title="Locked eval dataset, not synthetic on every run"
            body="The eval harness pins one GPT-5.5-generated dataset and benchmarks every other model against it. Without pinning, you can't compare runs across time — the dataset is the y-axis. Cost-vs-accuracy scatter only means something when the x-axis is fixed."
          />
        </div>
      </Section>

      <Section
        kicker="Trade-offs"
        title="What I cut, and what I'd do next."
        body=""
      >
        <div className="space-y-5">
          <Decision
            title="Cut: write actions on Gmail (archive, label, reply)"
            body="The spec is read-only, and write actions widen the OAuth scope, the consent screen, and the blast radius of a bug. The agent's tools mutate Convex state only. If this shipped for real, the next step is a 'sync labels back to Gmail' opt-in — but verify-the-classification UX first, then write."
          />
          <Decision
            title="Cut: multi-account / shared inbox"
            body="One Google account per Convex user. Multi-account would mean credentials as a list, a per-account picker in the UI, and a cross-account dedup story. Out of scope for a 2-day build, and a real product decision (do you merge inboxes or keep them separate?) not just engineering."
          />
          <Decision
            title="Cut: per-bucket prompt overrides"
            body="The classifier prompt is one global system prompt. A real version would let power users tweak the description of 'Important' for their domain (e.g. a fundraiser vs. a recruiter) and re-eval against the dataset. The eval harness is the half I built; the per-user override is the half I didn't."
          />
          <Decision
            title="Production-ize: model routing + cost guardrails"
            body="Today the model is a constant (gpt-5.4-mini). In prod I'd route by signal — cheap+fast model for obvious newsletters, fall back to a stronger model on low-confidence batches — and put a per-user daily cost ceiling in front of it. The eval data already shows where the cost/accuracy knee is."
          />
          <Decision
            title="Production-ize: observability + eval-driven prompt iteration"
            body="Right now I read Convex logs and the in-app eval scatter. In prod I'd wire LangSmith-style traces on every classification + agent call, alert on accuracy drift against the locked dataset, and turn the eval harness into a pre-merge gate (no prompt change without a benchmark)."
          />
          <Decision
            title="Production-ize: rate limits + Gmail backoff"
            body="The Gmail sync action handles 429s with exponential backoff but doesn't checkpoint mid-sync — a 200-thread pull restarts from zero if it fails late. For larger inboxes, paginate sync into a workflow with resumable cursors."
          />
        </div>
      </Section>

      <Section
        kicker="Video walkthrough"
        title="Sections, in order."
        body="Per the prompt: 10–20 min. Product demo is <50% of the runtime."
      >
        <ol className="space-y-3">
          <VideoSection
            num={1}
            title="Product demo"
            body="What I built, why, business impact. Sign-in → 200 threads auto-load and classify → add a custom label → reclassify → chat with the inbox."
          />
          <VideoSection
            num={2}
            title="Tech stack"
            body="React 19 + Vite + Tailwind v4 on the front; Convex (Agent, RAG, Workflow components) + AI SDK v6 on the back; Anthropic / OpenAI / Google through one interface."
          />
          <VideoSection
            num={3}
            title="Architectural decisions"
            body="Why Convex (sync engine collapses state mgmt); why ai-sdk for one-shot classification but Agent component for chat; per-user RAG namespacing; pending-changes accumulator vs. debounce; reviewer-link auth path."
          />
          <VideoSection
            num={4}
            title="Trade-offs"
            body="What I chose not to do (per-bucket reranking, multi-account, write actions in Gmail), and the production path: rate-limit handling, observability, model routing, eval-driven prompt iteration."
          />
        </ol>
      </Section>

      <Section
        kicker="Code map"
        title="Where to look."
        body="The repo is small enough to skim, but here's the spine."
      >
        <dl className="grid grid-cols-[180px_1fr] gap-x-6 gap-y-2 text-[13px]">
          <FileRow path="convex/workflows.ts" desc="Durable classification — Convex Workflow, batch+concurrency tuned" />
          <FileRow path="convex/inboxAgent.ts" desc="Chat agent + 6 tools" />
          <FileRow path="convex/rag.ts" desc="Per-user RAG namespacing for inbox search" />
          <FileRow path="convex/evalRunner.ts" desc="Eval harness — fire-and-forget per-model" />
          <FileRow path="convex/auth.ts" desc="Google OAuth + reviewer-link credentials provider" />
          <FileRow path="src/pages/InboxView.tsx" desc="Inbox UI, auto-sync on first load" />
          <FileRow path="src/pages/ChatSidebar.tsx" desc="Streaming chat with tool-call indicators" />
          <FileRow path="src/pages/EvalsPage.tsx" desc="Cost-vs-accuracy benchmark UI" />
        </dl>
      </Section>

      <Section
        kicker="Links"
        title=""
        body=""
      >
        <ul className="space-y-2 text-[13px]">
          <LinkRow label="Repo" href="https://github.com/Dan-Cleary/inbox-concierge" />
          <LinkRow label="Live app" href="https://inbox-concierge-dan.vercel.app" />
        </ul>
      </Section>
    </div>
  );
}

function Section({
  kicker,
  title,
  body,
  children,
}: {
  kicker: string;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10 border-t border-[var(--rule)] pt-6">
      <p className="kicker text-[var(--moss)]">{kicker}</p>
      {title && (
        <h2 className="mt-2 text-[20px] font-medium tracking-tight">{title}</h2>
      )}
      {body && <p className="mt-1 text-[13px] text-[var(--mute)]">{body}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function CriterionList({
  items,
}: {
  items: { label: string; body: string; evidence: string[] }[];
}) {
  return (
    <div className="space-y-5">
      {items.map((item) => (
        <div
          key={item.label}
          className="border border-[var(--rule)] bg-[var(--card-hi)] p-4"
        >
          <p className="text-[14px] font-medium">{item.label}</p>
          <p className="mt-1 text-[12px] text-[var(--mute)]">{item.body}</p>
          <ul className="mt-3 space-y-1.5">
            {item.evidence.map((line) => (
              <li
                key={line}
                className="flex gap-2 text-[12.5px] leading-snug text-[var(--ink)]"
              >
                <span className="text-[var(--moss)]">▸</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function VideoSection({
  num,
  title,
  body,
}: {
  num: number;
  title: string;
  body: string;
}) {
  return (
    <li className="flex gap-4 border border-[var(--rule)] bg-[var(--card-hi)] p-4">
      <div className="text-[20px] font-medium text-[var(--moss)]">
        {String(num).padStart(2, "0")}
      </div>
      <div>
        <p className="text-[14px] font-medium">{title}</p>
        <p className="mt-1 text-[12.5px] leading-snug text-[var(--mute)]">
          {body}
        </p>
      </div>
    </li>
  );
}

function UsageRow({
  surface,
  lib,
  body,
}: {
  surface: string;
  lib: string;
  body: string;
}) {
  return (
    <div className="border border-[var(--rule)] bg-[var(--card-hi)] p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-[14px] font-medium">{surface}</p>
        <p className="font-mono text-[11.5px] text-[var(--mute)]">{lib}</p>
      </div>
      <p className="mt-2 text-[12.5px] leading-snug text-[var(--ink)]">{body}</p>
    </div>
  );
}

function ToolRow({ name, body }: { name: string; body: string }) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-x-4 border border-[var(--rule)] bg-[var(--card-hi)] px-4 py-3">
      <div className="font-mono text-[12.5px] text-[var(--ink)]">{name}</div>
      <div className="text-[12.5px] leading-snug text-[var(--mute)]">
        {body}
      </div>
    </div>
  );
}

function Decision({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <p className="text-[14px] font-medium">{title}</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--mute)]">
        {body}
      </p>
    </div>
  );
}

function FileRow({ path, desc }: { path: string; desc: string }) {
  return (
    <>
      <dt className="font-mono text-[12px] text-[var(--ink)]">{path}</dt>
      <dd className="text-[12.5px] text-[var(--mute)]">{desc}</dd>
    </>
  );
}

function LinkRow({ label, href }: { label: string; href: string }) {
  return (
    <li className="flex gap-3">
      <span className="kicker w-16 shrink-0 text-[var(--mute)]">{label}</span>
      <a
        href={href}
        className="underline decoration-[var(--moss)] underline-offset-2"
      >
        {href}
      </a>
    </li>
  );
}
