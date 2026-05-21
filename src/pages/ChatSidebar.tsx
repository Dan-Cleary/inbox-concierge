import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export default function ChatSidebar({
  open,
  onClose,
  onCitationClick,
}: {
  open: boolean;
  onClose: () => void;
  onCitationClick?: (emailId: Id<"emails">) => void;
}) {
  const messages = useQuery(api.chatDb.listMessages);
  const me = useQuery(api.inbox.currentUser);
  const ask = useAction(api.chat.askInbox);
  const clearChat = useMutation(api.chatDb.clearChat);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!open || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open]);

  // Autosize the textarea up to a max so multi-line questions feel natural.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [input]);

  if (!open) return null;

  const submit = async () => {
    const q = input.trim();
    if (!q || submitting) return;
    setInput("");
    setSubmitting(true);
    setError(null);
    try {
      await ask({ question: q });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const empty = !messages || messages.length === 0;
  const firstName = (me?.name ?? "").trim().split(/\s+/)[0] || "there";

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/20 lg:hidden"
        onClick={onClose}
      />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-neutral-200 bg-white shadow-2xl">
        <header className="flex items-center justify-end gap-1 px-3 py-3 text-neutral-400">
          {!empty && (
            <button
              type="button"
              onClick={() => {
                if (confirm("Clear chat history?")) clearChat();
              }}
              className="rounded px-2 py-1 text-xs font-medium hover:bg-neutral-100 hover:text-neutral-700"
              aria-label="Clear chat"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 hover:bg-neutral-100 hover:text-neutral-700"
            aria-label="Close chat"
          >
            <CloseIcon />
          </button>
        </header>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-5 pb-3"
        >
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
              {messages.map((m) => (
                <MessageBubble
                  key={m._id}
                  message={m}
                  onCitationClick={onCitationClick}
                />
              ))}
            </div>
          )}
        </div>

        <div className="px-4 pb-4 pt-2">
          {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
          <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm transition-colors focus-within:border-neutral-400">
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
              placeholder="Ask a question"
              rows={1}
              disabled={submitting}
              className="block w-full resize-none rounded-2xl border-0 bg-transparent px-4 py-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
            />
            <div className="flex items-center justify-end gap-1 px-2 pb-2">
              <button
                type="button"
                onClick={() => void submit()}
                disabled={!input.trim() || submitting}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-neutral-900 text-white transition-opacity hover:bg-neutral-800 disabled:bg-neutral-200 disabled:text-neutral-400"
                aria-label="Send"
              >
                {submitting ? <Spinner /> : <ArrowUp />}
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

const SUGGESTIONS: Array<{ icon: React.ReactNode; label: string }> = [
  { icon: <SearchIcon />, label: "What's most important in my inbox right now?" },
  { icon: <MailIcon />, label: "Show me anything from Sentry this week." },
  { icon: <SparkleIcon />, label: "Are there any cold sales emails I can ignore?" },
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
      <h2 className="text-xl font-semibold tracking-tight text-neutral-900">
        Hi {firstName}, how can I help?
      </h2>
      <div className="mt-5 space-y-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => onPick(s.label)}
            className="flex w-full items-center gap-3 rounded-full bg-neutral-50 px-4 py-3 text-left text-sm text-neutral-800 transition-colors hover:bg-neutral-100"
          >
            <span className="shrink-0 text-neutral-500">{s.icon}</span>
            <span className="truncate">{s.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

type Message = {
  _id: Id<"chatMessages">;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
  error?: string;
  citations?: Array<{
    _id: Id<"emails">;
    subject: string;
    from: string;
  }>;
};

function MessageBubble({
  message,
  onCitationClick,
}: {
  message: Message;
  onCitationClick?: (emailId: Id<"emails">) => void;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-neutral-900 px-3 py-2 text-sm text-white">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[95%] space-y-2">
        <div className="text-sm leading-relaxed text-neutral-900">
          {message.pending ? (
            <span className="inline-flex items-center gap-1">
              <Dot delay={0} />
              <Dot delay={150} />
              <Dot delay={300} />
            </span>
          ) : (
            renderWithCitations(
              message.content,
              message.citations ?? [],
              onCitationClick,
            )
          )}
        </div>
        {!message.pending &&
          message.citations &&
          message.citations.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {message.citations.map((c) => (
                <button
                  key={c._id}
                  type="button"
                  onClick={() => onCitationClick?.(c._id)}
                  className="max-w-full truncate rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-700 transition-colors hover:border-neutral-400 hover:bg-neutral-50"
                  title={`${c.from} — ${c.subject}`}
                >
                  <span className="font-medium">{extractName(c.from)}:</span>{" "}
                  {c.subject}
                </button>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}

function renderWithCitations(
  content: string,
  citations: Array<{ _id: Id<"emails"> }>,
  onCitationClick?: (emailId: Id<"emails">) => void,
): React.ReactNode {
  const indexById = new Map<string, number>();
  citations.forEach((c, i) => indexById.set(c._id, i + 1));
  const parts: React.ReactNode[] = [];
  let last = 0;
  const re = /\[([a-z0-9]{8,})\]/gi;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(content)) !== null) {
    const id = m[1];
    const n = indexById.get(id);
    if (n === undefined) continue;
    parts.push(content.slice(last, m.index));
    parts.push(
      <button
        key={key++}
        type="button"
        onClick={() => onCitationClick?.(id as Id<"emails">)}
        className="mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded bg-neutral-900 px-1 text-[10px] font-bold text-white hover:bg-neutral-700"
        title="Jump to email"
      >
        {n}
      </button>,
    );
    last = m.index + m[0].length;
  }
  parts.push(content.slice(last));
  return <>{parts}</>;
}

function extractName(from: string): string {
  const match = from.match(/^"?([^"<]+?)"?\s*<.+>$/);
  return match?.[1]?.trim() ?? from;
}

function Dot({ delay }: { delay: number }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400"
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
