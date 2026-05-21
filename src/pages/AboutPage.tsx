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
        <p className="mt-2 text-[13px] text-[var(--mute)]">
          Built by Dan Cleary. Live at{" "}
          <a
            href="https://inbox-concierge-dan.vercel.app"
            className="underline decoration-[var(--moss)] underline-offset-2"
          >
            inbox-concierge-dan.vercel.app
          </a>
          .
        </p>
      </header>

      <Section
        kicker="The bar"
        title="Systems, not demos."
        body="Tenex's brief: ship AI-native speed paired with elite-level engineering rigor. The three criteria below are taken verbatim from the prompt."
      >
        <CriterionList
          items={[
            {
              label: "Production quality",
              body: "Modular, linted, edge-case aware (error handling, rate limits).",
              evidence: [
                "TS strict + ESLint clean; 66 vitest tests + convex-test integration tests for label mutations",
                "GitHub Actions CI: lint → build → test on every push",
                "Durable Convex Workflow for classification (batch 10, concurrency 3) survives action timeouts",
                "Retry-with-backoff on transient classifier failures; prior label preserved on retry",
              ],
            },
            {
              label: "AI-native speed",
              body: "Used AI as a force multiplier — verified, not vibes.",
              evidence: [
                "Built end-to-end in ~3 days with Claude Code + gstack skills",
                "Every LLM-classified email is shown to the user with its bucket — drift is visible, not hidden",
                "Multi-model eval harness (8 models, real dataset) ships in the app, not a notebook",
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
