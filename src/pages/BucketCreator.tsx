import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";

// Garden voice: "Build a room", not "Create label". The + button is small
// and sits inline with the sidebar's "Rooms" kicker.

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
            ? `You can have at most ${capacity?.max} rooms. Remove one to make room.`
            : "Build a room"
        }
        aria-label="Build a room"
        className="inline-flex h-5 w-5 items-center justify-center text-[var(--mute)] transition-colors hover:bg-[var(--card)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <PlusIcon />
      </button>
      {open && <BuildRoomModal onClose={() => setOpen(false)} />}
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
        Build a room
      </button>
      {open && <BuildRoomModal onClose={() => setOpen(false)} />}
    </>
  );
}

function BuildRoomModal({ onClose }: { onClose: () => void }) {
  const createBucket = useMutation(api.inbox.createBucket);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0 && description.trim().length > 0;

  const suggestions = [
    {
      name: "From investors",
      desc: "Emails from venture capitalists, angel investors, or funds about funding, intros, or due diligence.",
    },
    {
      name: "Finance",
      desc: "Invoices, payments, bank statements, expense reports, and other money-related correspondence.",
    },
    {
      name: "Recruiters",
      desc: "Cold and warm outreach from technical or executive recruiters about open roles.",
    },
    {
      name: "From the team",
      desc: "Messages from internal teammates about ongoing projects, reviews, and decisions.",
    },
  ];

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
        className="w-full max-w-[480px] border border-[var(--ink)] bg-[var(--card-hi)]"
      >
        <header className="flex items-center justify-between border-b border-[var(--rule)] px-8 py-5">
          <div>
            <p className="kicker text-[var(--moss)]">Build a room</p>
            <h3 className="mt-1 text-[22px] font-medium tracking-tight">
              What goes in here?
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--mute)] hover:text-[var(--ink)]"
            aria-label="Close"
          >
            ✕
          </button>
        </header>
        <div className="space-y-5 px-8 py-6">
          <div>
            <label
              htmlFor="room-name"
              className="kicker mb-1.5 block text-[var(--mute)]"
            >
              Name the room
            </label>
            <input
              id="room-name"
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
              htmlFor="room-desc"
              className="kicker mb-1.5 block text-[var(--mute)]"
            >
              Match these
            </label>
            <textarea
              id="room-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Emails from VCs, angel investors, or fund staff about funding rounds, intros, or due diligence."
              className="block w-full resize-none border-b border-[var(--ink)] bg-transparent py-1.5 text-[13px] text-[var(--ink)] placeholder:text-[var(--mute-dim)] focus:outline-none focus:border-b-2 focus:border-[var(--moss)] focus:py-[5px]"
            />
            <p className="mt-1 text-[11px] text-[var(--mute)]">
              Plain English. The clearer your description, the better the
              sorting.
            </p>
          </div>
          <div>
            <p className="kicker mb-2 text-[var(--mute)]">Suggestions</p>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => {
                    setName(s.name);
                    setDescription(s.desc);
                  }}
                  className="border border-[var(--rule)] bg-[var(--bg)] px-2 py-1 text-[11px] text-[var(--ink)] transition-colors hover:border-[var(--ink)] hover:bg-[var(--card)]"
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
          {error && (
            <p className="text-[11px] text-[var(--alert)]">{error}</p>
          )}
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-[var(--rule)] px-8 py-4">
          <button
            type="button"
            onClick={onClose}
            className="border border-[var(--ink)] bg-[var(--bg)] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ink)] hover:bg-[var(--card)]"
          >
            Back
          </button>
          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className="border border-[var(--ink)] bg-[var(--ink)] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--bg)] hover:bg-[var(--ink-soft)] disabled:opacity-50"
          >
            {submitting ? "Building…" : "Build room"}
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
