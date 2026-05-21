import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export default function BucketSuggestions() {
  const suggestions = useQuery(api.agentsDb.listPendingSuggestions);
  const accept = useMutation(api.agentsDb.acceptSuggestion);
  const dismiss = useMutation(api.agentsDb.dismissSuggestion);
  const startReclassification = useMutation(
    api.workflows.startReclassification,
  );
  const [busy, setBusy] = useState<Id<"bucketSuggestions"> | null>(null);

  if (!suggestions || suggestions.length === 0) return null;

  return (
    <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <SparkleIcon />
        <h3 className="text-sm font-semibold text-neutral-800">
          {suggestions.length === 1
            ? "Found a bucket you might want"
            : `Found ${suggestions.length} buckets you might want`}
        </h3>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {suggestions.map((s) => (
          <div
            key={s._id}
            className="flex flex-col rounded-md border border-emerald-200 bg-white p-3 text-sm shadow-sm"
          >
            <div className="font-medium text-neutral-900">{s.name}</div>
            <p className="mt-1 text-xs text-neutral-500 italic">
              {s.rationale}
            </p>
            <ul className="mt-2 space-y-1 text-xs text-neutral-600">
              {s.samples.slice(0, 3).map((e, i) => (
                <li key={i} className="truncate">
                  · {e.subject}
                </li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={busy === s._id}
                onClick={async () => {
                  setBusy(s._id);
                  try {
                    await accept({ suggestionId: s._id });
                    await startReclassification({});
                  } finally {
                    setBusy(null);
                  }
                }}
                className="flex-1 rounded-md bg-neutral-900 px-2 py-1 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                {busy === s._id ? "Accepting…" : "Accept"}
              </button>
              <button
                type="button"
                disabled={busy === s._id}
                onClick={async () => {
                  setBusy(s._id);
                  try {
                    await dismiss({ suggestionId: s._id });
                  } finally {
                    setBusy(null);
                  }
                }}
                className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              >
                Dismiss
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
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
      className="h-4 w-4 text-emerald-600"
    >
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" />
      <path d="M19 17l.7 2 2 .7-2 .7L19 23l-.7-2-2-.7 2-.7z" />
    </svg>
  );
}
