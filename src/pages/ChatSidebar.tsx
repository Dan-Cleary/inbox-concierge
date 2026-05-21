import { useAction, useMutation, useQuery } from "convex/react";
import { useThreadMessages, toUIMessages } from "@convex-dev/agent/react";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useConfirm } from "../components/ConfirmDialog";

// Friendly labels for tool calls — surfaced as "Searching inbox…" /
// "Listing labels…" while the agent runs them.
const TOOL_LABELS: Record<string, string> = {
  searchInbox: "Searching inbox",
  listLabels: "Reading your labels",
};

// Chat sidebar backed by the Convex Agent component. We don't run our
// own message table — Agent owns thread + message persistence + token
// streaming. UI uses useThreadMessages (subscribes to the thread + merges
// stream deltas) and toUIMessages (flattens Agent's message graph).

export default function ChatSidebar({
  open,
  onClose,
  onCitationClick,
}: {
  open: boolean;
  onClose: () => void;
  onCitationClick?: (emailId: Id<"emails">) => void;
}) {
  const me = useQuery(api.inbox.currentUser);
  const getOrCreateChat = useAction(api.chats.getOrCreateChat);
  const sendMessage = useAction(api.chats.sendMessage);
  const clearChat = useMutation(api.chats.clearChat);
  const { confirm, dialog } = useConfirm();

  const [threadId, setThreadId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Optimistic user message shown immediately on submit; cleared once
  // the server stream surfaces the same text.
  const [pending, setPending] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Lazily create the thread when the sidebar first opens.
  useEffect(() => {
    if (!open || threadId) return;
    let cancelled = false;
    getOrCreateChat({})
      .then((r) => {
        if (!cancelled) setThreadId(r.threadId);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, threadId, getOrCreateChat]);

  const messagesQuery = useThreadMessages(
    api.chats.listThreadMessages,
    threadId ? { threadId } : "skip",
    { initialNumItems: 50, stream: true },
  );

  // Keep all messages including empty assistants so we can inspect their
  // tool state for the bottom indicator. The render loop filters empty
  // assistants out separately.
  const allMessages = useMemo(
    () => toUIMessages(messagesQuery.results ?? []),
    [messagesQuery.results],
  );

  // Only render assistant bubbles once they have real text — avoids the
  // empty-grey-bubble flash while a tool call is in flight.
  const renderableMessages = useMemo(
    () =>
      allMessages.filter((m) => {
        if (m.role !== "assistant") return true;
        return textOf(m).trim().length > 0;
      }),
    [allMessages],
  );

  // Bottom "agent state" indicator — shown when the most recent message
  // visible to the user is NOT a live streaming assistant with text.
  // Replaces my earlier per-bubble dots + pills, which were strobing
  // when an empty assistant turned into a streaming assistant.
  const lastRendered = renderableMessages[renderableMessages.length - 1];
  const lastIsLiveAssistant =
    lastRendered?.role === "assistant" &&
    "status" in lastRendered &&
    lastRendered.status === "streaming";

  const lastAll = allMessages[allMessages.length - 1];
  const activeTool =
    lastAll?.role === "assistant" && "status" in lastAll &&
    lastAll.status === "streaming"
      ? activeToolOf(lastAll)
      : null;

  // We show the indicator if:
  // - a request is in flight, OR
  // - an empty streaming assistant exists (still calling tools / about to emit)
  const showIndicator =
    (submitting || pending !== null || (lastAll?.role === "assistant" && "status" in lastAll && lastAll.status === "streaming" && textOf(lastAll).trim().length === 0)) &&
    !lastIsLiveAssistant;
  const uiMessages = renderableMessages;

  // Clear optimistic pending message once the server confirms.
  useEffect(() => {
    if (!pending) return;
    const seen = uiMessages.some(
      (m) => m.role === "user" && textOf(m) === pending,
    );
    if (seen) setPending(null);
  }, [uiMessages, pending]);

  // Auto-scroll on new content.
  useEffect(() => {
    if (!open || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [
    uiMessages.length,
    uiMessages[uiMessages.length - 1]?.parts?.length,
    pending,
    open,
  ]);

  // Autosize textarea.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [input]);

  if (!open) return null;

  const empty = uiMessages.length === 0 && !pending;
  const firstName = (me?.name ?? "").trim().split(/\s+/)[0] || "there";

  const submit = async () => {
    const prompt = input.trim();
    if (!prompt || submitting || !threadId) return;
    setInput("");
    setPending(prompt);
    setSubmitting(true);
    setError(null);
    try {
      await sendMessage({ threadId, prompt });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPending(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-[rgba(22,34,26,0.2)] lg:hidden"
        onClick={onClose}
      />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-[var(--ink)] bg-[var(--bg)]">
        <header className="flex items-center justify-between gap-2 border-b border-[var(--rule)] px-4 py-3">
          <p className="kicker text-[var(--moss)]">Your inbox</p>
          <div className="flex items-center gap-1">
            {!empty && (
              <button
                type="button"
                onClick={async () => {
                  const ok = await confirm({
                    title: "Clear chat history?",
                    message:
                      "Starts a new thread. Old messages stay in Convex but aren't shown anymore.",
                    confirmLabel: "Clear",
                    variant: "danger",
                  });
                  if (!ok) return;
                  await clearChat();
                  setThreadId(null);
                  setPending(null);
                }}
                className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--mute)] hover:text-[var(--ink)]"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-[var(--mute)] hover:text-[var(--ink)]"
              aria-label="Close chat"
            >
              <CloseIcon />
            </button>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 pb-3">
          {empty ? (
            <EmptyState
              firstName={firstName}
              onPick={(p) => {
                setInput(p);
                inputRef.current?.focus();
              }}
            />
          ) : (
            <div className="space-y-4 pt-2">
              {uiMessages.map((m) => (
                <MessageBubble
                  key={m.key}
                  role={m.role as "user" | "assistant"}
                  text={textOf(m)}
                  streaming={"status" in m && m.status === "streaming"}
                  onCitationClick={onCitationClick}
                />
              ))}
              {pending && (
                <MessageBubble
                  role="user"
                  text={pending}
                  streaming={false}
                />
              )}
              {showIndicator && <AgentIndicator tool={activeTool} />}
            </div>
          )}
        </div>

        <div className="border-t border-[var(--rule)] px-4 py-3">
          {error && (
            <p className="mb-2 text-[11px] text-[var(--alert)]">{error}</p>
          )}
          <div className="border border-[var(--ink)] bg-[var(--card-hi)] focus-within:border-[var(--moss)]">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder="Ask your inbox"
              rows={1}
              disabled={submitting || !threadId}
              className="block w-full resize-none border-0 bg-transparent px-3 py-2.5 text-[13px] text-[var(--ink)] placeholder:text-[var(--mute-dim)] focus:outline-none"
            />
            <div className="flex items-center justify-end gap-1 border-t border-[var(--rule-soft)] px-2 py-1.5">
              <button
                type="button"
                onClick={() => void submit()}
                disabled={!input.trim() || submitting || !threadId}
                className="inline-flex h-7 w-7 items-center justify-center bg-[var(--ink)] text-[var(--bg)] transition-opacity hover:bg-[var(--ink-soft)] disabled:bg-[var(--rule)] disabled:text-[var(--mute-dim)]"
                aria-label="Send"
              >
                {submitting ? <Spinner /> : <ArrowUp />}
              </button>
            </div>
          </div>
        </div>
      </aside>
      {dialog}
    </>
  );
}

const SUGGESTIONS: Array<{ icon: React.ReactNode; label: string }> = [
  { icon: <SearchIcon />, label: "What's most important in my inbox right now?" },
  { icon: <MailIcon />, label: "Anything from Sentry this week?" },
  { icon: <SparkleIcon />, label: "Are there cold sales emails I can ignore?" },
  { icon: <ClockIcon />, label: "What needs a reply today?" },
];

function EmptyState({
  firstName,
  onPick,
}: {
  firstName: string;
  onPick: (s: string) => void;
}) {
  return (
    <div className="pt-6">
      <h2 className="text-[22px] font-medium leading-tight tracking-tight text-[var(--ink)]">
        Hi {firstName}, how can I help?
      </h2>
      <div className="mt-5 space-y-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => onPick(s.label)}
            className="flex w-full items-center gap-3 border border-[var(--rule)] bg-[var(--card)] px-3 py-2.5 text-left text-[13px] text-[var(--ink)] transition-colors hover:border-[var(--ink)] hover:bg-[var(--card-hi)]"
          >
            <span className="shrink-0 text-[var(--mute)]">{s.icon}</span>
            <span className="truncate">{s.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({
  role,
  text,
  streaming,
  onCitationClick,
}: {
  role: "user" | "assistant";
  text: string;
  streaming: boolean;
  onCitationClick?: (emailId: Id<"emails">) => void;
}) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap border border-[var(--ink)] bg-[var(--ink)] px-3 py-2 text-[13px] text-[var(--bg)]">
          {text}
        </div>
      </div>
    );
  }

  // Assistant rows only render once they have text (filter upstream).
  // Blinking caret while still streaming.
  return (
    <div className="flex justify-start">
      <div className="max-w-[95%] text-[13px] leading-relaxed text-[var(--ink)]">
        <AssistantText text={text} onCitationClick={onCitationClick} />
        {streaming && (
          <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse bg-[var(--ink)] align-middle" />
        )}
      </div>
    </div>
  );
}

// Bottom-of-list indicator. One source of truth for "the agent is doing
// something but hasn't started talking yet." Replaces per-bubble dots and
// pills that were strobing on rapid empty→tool→streaming transitions.
function AgentIndicator({ tool }: { tool: string | null }) {
  const label = tool ? TOOL_LABELS[tool] ?? tool : null;
  return (
    <div className="flex items-center gap-2 px-1 py-1 text-[var(--mute)]">
      <span className="inline-flex items-center gap-1">
        <Dot delay={0} />
        <Dot delay={150} />
        <Dot delay={300} />
      </span>
      {label && <span className="kicker">{label}</span>}
    </div>
  );
}

// Renders assistant text as markdown, with [cid:emailId] markers
// extracted and replaced inline with numbered citation chips.
function AssistantText({
  text,
  onCitationClick,
}: {
  text: string;
  onCitationClick?: (emailId: Id<"emails">) => void;
}) {
  // First pass: extract citations, replace each [cid:X] with a unique
  // placeholder token (CITE-N) that markdown won't touch. We re-substitute
  // after markdown renders.
  const handleToIndex = new Map<string, number>();
  const replaced = text.replace(/\[cid:([a-z0-9]+)\]/gi, (_, cid: string) => {
    let idx = handleToIndex.get(cid);
    if (idx === undefined) {
      idx = handleToIndex.size + 1;
      handleToIndex.set(cid, idx);
    }
    return `{{CITE-${idx}-${cid}}}`;
  });

  const renderChild = (children: React.ReactNode): React.ReactNode => {
    if (typeof children === "string") return splitCitations(children);
    if (Array.isArray(children)) return children.map(renderChild);
    return children;
  };

  const splitCitations = (s: string): React.ReactNode => {
    const re = /\{\{CITE-(\d+)-([a-z0-9]+)\}\}/gi;
    const out: React.ReactNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    let key = 0;
    while ((m = re.exec(s)) !== null) {
      if (m.index > last) out.push(s.slice(last, m.index));
      const idx = m[1];
      const cid = m[2];
      out.push(
        <button
          key={key++}
          type="button"
          onClick={() => onCitationClick?.(cid as Id<"emails">)}
          className="mx-0.5 inline-flex h-4 min-w-4 items-center justify-center bg-[var(--moss)] px-1 text-[10px] font-bold text-white hover:bg-[var(--ink)]"
          title="Jump to email"
        >
          {idx}
        </button>,
      );
      last = m.index + m[0].length;
    }
    if (last < s.length) out.push(s.slice(last));
    return out;
  };

  return (
    <div className="prose-chat">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => (
            <p className="my-1 leading-relaxed">{renderChild(children)}</p>
          ),
          ul: ({ children }) => (
            <ul className="my-1.5 list-disc space-y-0.5 pl-5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-1.5 list-decimal space-y-0.5 pl-5">{children}</ol>
          ),
          li: ({ children }) => <li>{renderChild(children)}</li>,
          strong: ({ children }) => (
            <strong className="font-semibold">{renderChild(children)}</strong>
          ),
          em: ({ children }) => <em>{renderChild(children)}</em>,
          code: ({ children }) => (
            <code className="bg-[var(--card)] px-1 py-px text-[12px] font-mono">
              {children}
            </code>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-[var(--moss)] underline"
            >
              {renderChild(children)}
            </a>
          ),
        }}
      >
        {replaced}
      </ReactMarkdown>
    </div>
  );
}

// Extract concatenated text from a UIMessage's parts array.
type Part = {
  type: string;
  text?: string;
  state?: string;
  toolName?: string;
};
type UIMessageLike = {
  parts?: Part[];
};
function textOf(m: UIMessageLike): string {
  return (m.parts ?? [])
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text!)
    .join("");
}

// Find the currently-active tool call on a message, if any. Tool parts
// in ai-sdk v6 are typed as `tool-${name}`; we surface the name so the
// UI can show "Searching inbox…" while the call is in flight.
function activeToolOf(m: UIMessageLike): string | null {
  const parts = m.parts ?? [];
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    if (typeof p.type !== "string") continue;
    if (!p.type.startsWith("tool-")) continue;
    // Skip completed tool parts — we only want in-flight ones.
    if (p.state === "output-available" || p.state === "error") continue;
    return p.type.slice("tool-".length);
  }
  return null;
}

function Dot({ delay }: { delay: number }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--mute)]"
      style={{ animationDelay: `${delay}ms` }}
    />
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function ArrowUp() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5 animate-spin"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
    >
      <circle cx="12" cy="12" r="9" opacity="0.25" />
      <path d="M21 12a9 9 0 0 1-9 9" strokeLinecap="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" />
      <path d="M19 17l.7 2 2 .7-2 .7L19 23l-.7-2-2-.7 2-.7z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
