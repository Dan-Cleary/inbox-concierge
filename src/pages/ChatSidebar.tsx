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
  const ask = useAction(api.chat.askInbox);
  const clearChat = useMutation(api.chatDb.clearChat);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll on new messages or while streaming.
  useEffect(() => {
    if (!open || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 lg:hidden"
        onClick={onClose}
      />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-neutral-200 bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold">Ask your inbox</h3>
            <p className="text-xs text-neutral-500">
              Search across your 200 threads with natural language.
            </p>
          </div>
          <div className="flex items-center gap-1">
            {!empty && (
              <button
                type="button"
                onClick={() => {
                  if (confirm("Clear all messages?")) clearChat();
                }}
                className="rounded p-1 text-xs text-neutral-500 hover:bg-neutral-100"
                title="Clear chat"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
              aria-label="Close chat"
            >
              ✕
            </button>
          </div>
        </header>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
        >
          {empty ? (
            <ExamplePrompts onPick={(p) => setInput(p)} />
          ) : (
            messages.map((m) => (
              <MessageBubble
                key={m._id}
                message={m}
                onCitationClick={onCitationClick}
              />
            ))
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="border-t border-neutral-200 p-3"
        >
          {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="What's in my inbox from Stripe?"
              className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
              disabled={submitting}
            />
            <button
              type="submit"
              disabled={!input.trim() || submitting}
              className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              Ask
            </button>
          </div>
        </form>
      </aside>
    </>
  );
}

const EXAMPLES = [
  "What did Sentry say recently?",
  "Any cold sales emails this week?",
  "Show me anything finance-related.",
  "What needs a reply today?",
];

function ExamplePrompts({ onPick }: { onPick: (s: string) => void }) {
  return (
    <div className="space-y-3 pt-4">
      <p className="text-xs text-neutral-500">Try one of these:</p>
      {EXAMPLES.map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => onPick(e)}
          className="block w-full rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-left text-sm text-neutral-700 hover:border-neutral-300 hover:bg-neutral-100"
        >
          {e}
        </button>
      ))}
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
      <div className="max-w-[90%] space-y-2">
        <div className="rounded-2xl rounded-bl-md bg-neutral-100 px-3 py-2 text-sm text-neutral-900">
          {message.pending ? (
            <span className="inline-flex gap-1">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400 [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400 [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400" />
            </span>
          ) : (
            renderWithCitations(message.content, message.citations ?? [], onCitationClick)
          )}
        </div>
        {!message.pending && message.citations && message.citations.length > 0 && (
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
  // Replace [emailId] inline citations with superscript numbers tied to the
  // chip list below. Keeps the prose readable but lets users jump to a
  // specific cite.
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
    if (n === undefined) continue; // unknown citation — leave in place
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
