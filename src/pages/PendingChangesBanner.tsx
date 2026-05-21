import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";

// Banner that surfaces accumulated label changes (creates / deletes /
// accepted suggestions). One Apply click commits everything into a
// single reclassify — replaces the auto-debounced pattern that fired
// too quickly for deliberate modal-based label work.
export default function PendingChangesBanner() {
  const pending = useQuery(api.labelChanges.pendingChanges);
  const apply = useMutation(api.labelChanges.applyPendingChanges);
  const dismiss = useMutation(api.labelChanges.dismissPendingChanges);
  const [busy, setBusy] = useState(false);

  if (!pending || pending.changeCount === 0) return null;

  const label =
    pending.changeCount === 1
      ? "1 label change pending"
      : `${pending.changeCount} label changes pending`;

  return (
    <div className="mb-3 flex items-start justify-between gap-3 border border-[var(--ink)] bg-[var(--card-hi)] px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="kicker text-[var(--moss)]">{label}</p>
        <p className="mt-1 truncate text-[12px] text-[var(--ink)]">
          {pending.summaries.join(" · ")}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await dismiss({});
            } finally {
              setBusy(false);
            }
          }}
          className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--mute)] hover:text-[var(--ink)] disabled:opacity-50"
        >
          Dismiss
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await apply({});
            } finally {
              setBusy(false);
            }
          }}
          className="border border-[var(--ink)] bg-[var(--ink)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--bg)] hover:bg-[var(--ink-soft)] disabled:opacity-50"
        >
          {busy ? "Working…" : "Apply & re-sort"}
        </button>
      </div>
    </div>
  );
}
