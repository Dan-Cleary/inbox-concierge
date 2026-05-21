import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";

// Inline button + modal form. The trigger looks like a real CTA so users
// don't read it as disabled; the modal is a Gmail-style "Create label" flow:
// just a name and a one-line "what goes here", then Create.
export default function BucketCreator() {
  const capacity = useQuery(api.inbox.labelCapacity);
  const [open, setOpen] = useState(false);

  const atCap = capacity && capacity.used >= capacity.max;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={atCap}
        title={
          atCap
            ? `You can have at most ${capacity?.max} labels. Delete one to make room.`
            : undefined
        }
        className="flex w-full items-center justify-center gap-2 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 shadow-sm transition-colors hover:border-neutral-400 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <PlusIcon />
        Create label
      </button>
      {open && <CreateLabelModal onClose={() => setOpen(false)} />}
    </>
  );
}

function CreateLabelModal({ onClose }: { onClose: () => void }) {
  const createBucket = useMutation(api.inbox.createBucket);
  const startReclassification = useMutation(
    api.workflows.startReclassification,
  );
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0 && description.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 sm:items-center">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!canSubmit) return;
          setSubmitting(true);
          setError(null);
          try {
            await createBucket({
              name: name.trim(),
              description: description.trim(),
            });
            await startReclassification({});
            onClose();
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          } finally {
            setSubmitting(false);
          }
        }}
        className="w-full max-w-md rounded-lg bg-white shadow-xl"
      >
        <header className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
          <h3 className="text-base font-semibold">Create label</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-700"
            aria-label="Close"
          >
            ✕
          </button>
        </header>
        <div className="space-y-4 px-5 py-4">
          <div>
            <label
              htmlFor="label-name"
              className="block text-xs font-medium text-neutral-700"
            >
              Label name
            </label>
            <input
              id="label-name"
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={30}
              placeholder="From investors"
              className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
            />
          </div>
          <div>
            <label
              htmlFor="label-desc"
              className="block text-xs font-medium text-neutral-700"
            >
              What emails should go here?
            </label>
            <textarea
              id="label-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Emails from venture capitalists, angel investors, or fund staff about funding rounds, intros, or due diligence."
              className="mt-1 block w-full resize-none rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-neutral-500">
              Plain English. The clearer your description, the better the
              labeling.
            </p>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-neutral-200 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create label"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function PlusIcon() {
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
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
