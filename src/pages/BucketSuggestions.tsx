import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export default function BucketSuggestions() {
  const suggestions = useQuery(api.agentsDb.listPendingSuggestions);
  const accept = useMutation(api.agentsDb.acceptSuggestion);
  const dismiss = useMutation(api.agentsDb.dismissSuggestion);
  const [busy, setBusy] = useState<Id<"bucketSuggestions"> | null>(null);

  if (!suggestions || suggestions.length === 0) return null;

  return (
    <div className="mb-3 border border-[var(--rule)] bg-[var(--card)] px-3 py-2.5">
      <p className="kicker mb-2 flex items-center gap-1.5 text-[var(--moss)]">
        <SparkleIcon />
        Suggested labels
      </p>
      <ul className="space-y-1">
        {suggestions.map((s) => (
          <SuggestionRow
            key={s._id}
            suggestion={s}
            busy={busy === s._id}
            onAccept={async () => {
              setBusy(s._id);
              try {
                await accept({ suggestionId: s._id });
              } finally {
                setBusy(null);
              }
            }}
            onDismiss={async () => {
              setBusy(s._id);
              try {
                await dismiss({ suggestionId: s._id });
              } finally {
                setBusy(null);
              }
            }}
          />
        ))}
      </ul>
    </div>
  );
}

type Suggestion = {
  _id: Id<"bucketSuggestions">;
  name: string;
  rationale: string;
  samples: Array<{ subject: string; from: string }>;
};

function SuggestionRow({
  suggestion: s,
  busy,
  onAccept,
  onDismiss,
}: {
  suggestion: Suggestion;
  busy: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border border-[var(--rule)] bg-[var(--bg)]">
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={open}
          title={s.rationale}
        >
          <Chevron open={open} />
          <span className="truncate text-[13px] font-medium text-[var(--ink)]">
            {s.name}
          </span>
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onAccept}
          className="shrink-0 border border-[var(--ink)] bg-[var(--ink)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--bg)] hover:bg-[var(--ink-soft)] disabled:opacity-50"
        >
          {busy ? "…" : "Accept"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onDismiss}
          className="shrink-0 border border-[var(--rule)] bg-[var(--bg)] px-2 py-0.5 text-[11px] text-[var(--mute)] hover:border-[var(--ink)] hover:text-[var(--ink)] disabled:opacity-50"
          aria-label="Dismiss suggestion"
        >
          ✕
        </button>
      </div>
      {open && (
        <div className="border-t border-[var(--rule)] px-2.5 py-2 text-[12px]">
          <p className="text-[var(--mute)]">{s.rationale}</p>
          <p className="kicker mt-2">Examples</p>
          <ul className="mt-1 space-y-0.5 text-[var(--ink-soft)]">
            {s.samples.slice(0, 3).map((e, i) => (
              <li key={i} className="truncate">
                · {e.subject}
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-3 w-3 shrink-0 text-[var(--mute)] transition-transform ${
        open ? "rotate-90" : ""
      }`}
    >
      <path d="M9 6l6 6-6 6" />
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
      className="h-3 w-3"
    >
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" />
      <path d="M19 17l.7 2 2 .7-2 .7L19 23l-.7-2-2-.7 2-.7z" />
    </svg>
  );
}
