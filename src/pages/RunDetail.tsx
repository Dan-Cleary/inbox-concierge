import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const BUCKET_TINT: Record<string, string> = {
  Important: "bg-red-50 text-red-700",
  "Can wait": "bg-amber-50 text-amber-700",
  "Auto-archive": "bg-neutral-100 text-neutral-700",
  Newsletter: "bg-blue-50 text-blue-700",
};

export default function RunDetail({ runId }: { runId: Id<"evalRuns"> }) {
  const results = useQuery(api.evalsDb.getRunResults, { runId });
  const [filter, setFilter] = useState<"all" | "wrong" | "right">("wrong");
  if (results === undefined) return null;

  const wrong = results.filter((r) => !r.correct);
  const filtered =
    filter === "all"
      ? results
      : filter === "wrong"
        ? wrong
        : results.filter((r) => r.correct);

  return (
    <div className="mt-3 rounded-md border-2 border-blue-200 bg-blue-50/30 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          Per-email results · {wrong.length} mistakes / {results.length} total
        </h3>
        <div className="flex gap-1 text-xs">
          {(["wrong", "right", "all"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded px-2 py-1 ${
                filter === f
                  ? "bg-neutral-900 text-white"
                  : "bg-white text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      {filtered.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">Nothing to show.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {filtered.map((r) => (
            <li
              key={r._id}
              className="rounded-md border border-neutral-200 bg-white p-3 text-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-neutral-900">
                    {r.email?.subject ?? "(missing)"}
                  </div>
                  <div className="truncate text-xs text-neutral-500">
                    {r.email?.from ?? ""}
                  </div>
                  <div className="mt-1 text-xs text-neutral-600">
                    {r.email?.snippet ?? ""}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                  <span className="text-neutral-400">expected</span>
                  <span
                    className={`rounded px-1.5 py-0.5 font-medium ${
                      BUCKET_TINT[r.expectedBucket] ?? "bg-neutral-100"
                    }`}
                  >
                    {r.expectedBucket}
                  </span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                  <span className="text-neutral-400">predicted</span>
                  <span
                    className={`rounded px-1.5 py-0.5 font-medium ${
                      r.correct
                        ? BUCKET_TINT[r.predictedBucket] ?? "bg-neutral-100"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {r.predictedBucket}
                  </span>
                </div>
              </div>
              {r.reason && (
                <p className="mt-2 text-xs italic text-neutral-500">
                  reason: {r.reason}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
