import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";

export function CreateLabelButton() {
  const capacity = useQuery(api.inbox.labelCapacity);
  const [open, setOpen] = useState(false);
  const atCap = capacity ? capacity.used >= capacity.max : false;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={atCap}
        title={
          atCap
            ? `Max ${capacity?.max} labels. Delete one to make room.`
            : "Create label"
        }
        aria-label="Create label"
        className="inline-flex h-5 w-5 items-center justify-center text-[var(--mute)] transition-colors hover:bg-[var(--card)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <PlusIcon />
      </button>
      {open && <CreateLabelModal onClose={() => setOpen(false)} />}
    </>
  );
}

export default function BucketCreator() {
  const capacity = useQuery(api.inbox.labelCapacity);
  const [open, setOpen] = useState(false);
  const atCap = capacity ? capacity.used >= capacity.max : false;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={atCap}
        className="flex w-full items-center justify-center gap-2 border border-[var(--ink)] bg-[var(--bg)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ink)] transition-colors hover:bg-[var(--card)] disabled:cursor-not-allowed disabled:opacity-50"
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
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0 && description.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-[rgba(22,34,26,0.45)] p-4 sm:items-center"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
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
            onClose();
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          } finally {
            setSubmitting(false);
          }
        }}
        className="w-full max-w-[440px] border border-[var(--ink)] bg-[var(--card-hi)]"
      >
        <header className="flex items-center justify-between border-b border-[var(--rule)] px-6 py-4">
          <h3 className="text-[18px] font-medium tracking-tight">
            Create label
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--mute)] hover:text-[var(--ink)]"
            aria-label="Close"
          >
            ✕
          </button>
        </header>
        <div className="space-y-4 px-6 py-5">
          <div>
            <label
              htmlFor="label-name"
              className="kicker mb-1.5 block text-[var(--mute)]"
            >
              Name
            </label>
            <input
              id="label-name"
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={30}
              placeholder="From investors"
              className="block w-full border-b border-[var(--ink)] bg-transparent py-1.5 text-[15px] text-[var(--ink)] placeholder:text-[var(--mute-dim)] focus:outline-none focus:border-b-2 focus:border-[var(--moss)] focus:py-[5px]"
            />
          </div>
          <div>
            <label
              htmlFor="label-desc"
              className="kicker mb-1.5 block text-[var(--mute)]"
            >
              What goes here?
            </label>
            <textarea
              id="label-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Emails from VCs about funding rounds, intros, or due diligence."
              className="block w-full resize-none border-b border-[var(--ink)] bg-transparent py-1.5 text-[13px] text-[var(--ink)] placeholder:text-[var(--mute-dim)] focus:outline-none focus:border-b-2 focus:border-[var(--moss)] focus:py-[5px]"
            />
          </div>
          {error && (
            <p className="text-[11px] text-[var(--alert)]">{error}</p>
          )}
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-[var(--rule)] px-6 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="border border-[var(--ink)] bg-[var(--bg)] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ink)] hover:bg-[var(--card)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className="border border-[var(--ink)] bg-[var(--ink)] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--bg)] hover:bg-[var(--ink-soft)] disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create"}
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
      className="h-3.5 w-3.5"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
