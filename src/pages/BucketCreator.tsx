import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";

export default function BucketCreator() {
  const createBucket = useMutation(api.inbox.createBucket);
  const startReclassification = useMutation(
    api.workflows.startReclassification,
  );
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-md border border-dashed border-neutral-300 px-3 py-2 text-sm text-neutral-600 hover:border-neutral-400 hover:text-neutral-800"
      >
        + Add custom bucket
      </button>
    );
  }

  const reset = () => {
    setName("");
    setDescription("");
    setError(null);
    setOpen(false);
  };

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim() || !description.trim()) {
          setError("Both fields are required");
          return;
        }
        setSubmitting(true);
        setError(null);
        try {
          await createBucket({
            name: name.trim(),
            description: description.trim(),
          });
          await startReclassification({});
          reset();
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          setSubmitting(false);
        }
      }}
      className="space-y-2 rounded-md border border-neutral-300 bg-white p-3"
    >
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Bucket name (e.g. From investors)"
        className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="When should an email land here? Plain English; this becomes the LLM's criterion."
        rows={3}
        className="w-full resize-none rounded border border-neutral-300 px-2 py-1 text-sm"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create + reclassify"}
        </button>
        <button
          type="button"
          onClick={reset}
          className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
