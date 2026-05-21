import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

// How long to wait after the last accept before kicking off the
// reclassification. Lets the user accept multiple suggestions in a row
// and batches them into one workflow instead of N back-to-back.
const RECLASSIFY_DEBOUNCE_MS = 1500;

export default function BucketSuggestions() {
  const suggestions = useQuery(api.agentsDb.listPendingSuggestions);
  const accept = useMutation(api.agentsDb.acceptSuggestion);
  const dismiss = useMutation(api.agentsDb.dismissSuggestion);
  const startReclassification = useMutation(
    api.workflows.startReclassification,
  );
  const [busy, setBusy] = useState<Id<"bucketSuggestions"> | null>(null);

  // Debounce reclassify across rapid accepts. The timer holds while the user
  // is still picking; when it expires we fire one reclassify covering every
  // newly-created bucket.
  const reclassifyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueReclassify = () => {
    if (reclassifyTimer.current) clearTimeout(reclassifyTimer.current);
    reclassifyTimer.current = setTimeout(() => {
      reclassifyTimer.current = null;
      void startReclassification({});
    }, RECLASSIFY_DEBOUNCE_MS);
  };
  useEffect(
    () => () => {
      if (reclassifyTimer.current) clearTimeout(reclassifyTimer.current);
    },
    [],
  );

  if (!suggestions || suggestions.length === 0) return null;

  return (
    <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50/40 px-3 py-2 shadow-sm">
      <div className="mb-1.5 flex items-center gap-1.5">
        <SparkleIcon />
        <h3 className="text-xs font-semibold text-emerald-900">
          Suggested labels
        </h3>
      </div>
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
                // Debounce — wait briefly in case the user accepts more
                // suggestions, then fire one combined reclassify.
                queueReclassify();
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
    <li className="rounded-md border border-emerald-100 bg-white">
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={open}
          title={s.rationale}
        >
          <Chevron open={open} />
          <span className="truncate text-sm font-medium text-neutral-900">
            {s.name}
          </span>
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onAccept}
          className="shrink-0 rounded bg-neutral-900 px-2 py-0.5 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {busy ? "…" : "Accept"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onDismiss}
          className="shrink-0 rounded border border-neutral-300 bg-white px-2 py-0.5 text-xs text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
          aria-label="Dismiss suggestion"
        >
          ✕
        </button>
      </div>
      {open && (
        <div className="border-t border-emerald-100 px-2.5 py-2 text-xs">
          <p className="text-neutral-600">{s.rationale}</p>
          <p className="mt-2 text-[10px] uppercase tracking-wide text-neutral-400">
            Example emails
          </p>
          <ul className="mt-1 space-y-0.5 text-neutral-700">
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
      className={`h-3 w-3 shrink-0 text-neutral-400 transition-transform ${
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
      className="h-3.5 w-3.5 text-emerald-600"
    >
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" />
      <path d="M19 17l.7 2 2 .7-2 .7L19 23l-.7-2-2-.7 2-.7z" />
    </svg>
  );
}
