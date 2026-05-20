import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";

const DEFAULT_TEMPLATE = `You classify emails into exactly one of the user's buckets.

The user's buckets are:

{{BUCKETS}}

Rules:
- Choose exactly one bucket per email.
- Use only the bucket NAMES above. Do not invent new buckets.
- If an email could plausibly fit two buckets, prefer the bucket the user is more likely to want to see first (lean toward action-required over informational).
- Base your decision only on the subject, sender, and snippet you're given. Do not assume content you can't see.

For each email, return a JSON object with two fields:
- "bucket": the exact bucket name (one of the names above)
- "reason": one short sentence (max 15 words) explaining why

Return a JSON array, one object per input email, in the same order.`;

export default function PromptEditor({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const versions = useQuery(api.promptVersions.list);
  const create = useMutation(api.promptVersions.create);

  const latest = versions?.[0];
  const [label, setLabel] = useState("");
  const [template, setTemplate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTemplate(latest?.template ?? DEFAULT_TEMPLATE);
    setLabel(
      latest ? `v${(versions?.length ?? 0) + 1}` : "v1",
    );
    setNotes("");
    setError(null);
  }, [open, latest, versions?.length]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-6">
      <div className="flex max-h-full w-full max-w-3xl flex-col rounded-lg bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
          <div>
            <h3 className="text-lg font-semibold">Edit classification prompt</h3>
            <p className="text-xs text-neutral-500">
              Each save creates a new version. Future runs use the latest;
              past runs stay tied to whichever version they ran with.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-700"
          >
            ✕
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">
          <label className="block text-xs font-medium text-neutral-600">
            Label
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="mt-1 block w-48 rounded border border-neutral-300 px-2 py-1 text-sm"
            />
          </label>
          <label className="mt-3 block text-xs font-medium text-neutral-600">
            Template{" "}
            <span className="font-normal text-neutral-400">
              (must include the{" "}
              <code className="rounded bg-neutral-100 px-1">{`{{BUCKETS}}`}</code>{" "}
              placeholder)
            </span>
            <textarea
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              rows={18}
              className="mt-1 block w-full rounded border border-neutral-300 px-3 py-2 font-mono text-xs leading-5"
            />
          </label>
          <label className="mt-3 block text-xs font-medium text-neutral-600">
            Notes <span className="font-normal text-neutral-400">(optional)</span>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. 'tightened Important criteria for cold sales'"
              className="mt-1 block w-full rounded border border-neutral-300 px-2 py-1 text-sm"
            />
          </label>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
        <footer className="flex items-center justify-between border-t border-neutral-200 px-5 py-3">
          <div className="text-xs text-neutral-500">
            {versions?.length ?? 0} saved version
            {versions?.length === 1 ? "" : "s"}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                setError(null);
                try {
                  await create({
                    label: label.trim() || `v${(versions?.length ?? 0) + 1}`,
                    template,
                    notes: notes.trim() || undefined,
                  });
                  onClose();
                } catch (err) {
                  setError(err instanceof Error ? err.message : String(err));
                } finally {
                  setSaving(false);
                }
              }}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save version"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
