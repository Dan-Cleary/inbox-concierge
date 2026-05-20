import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const BUCKETS = ["Important", "Can wait", "Auto-archive", "Newsletter"] as const;

const BUCKET_TINT: Record<string, string> = {
  Important: "bg-red-50 text-red-700 ring-red-200",
  "Can wait": "bg-amber-50 text-amber-700 ring-amber-200",
  "Auto-archive": "bg-neutral-100 text-neutral-600 ring-neutral-200",
  Newsletter: "bg-blue-50 text-blue-700 ring-blue-200",
};

export default function DatasetTable({
  datasetId,
  locked,
}: {
  datasetId: Id<"evalDatasets">;
  locked: boolean;
}) {
  const emails = useQuery(api.evalsDb.getDatasetEmails, { datasetId });
  const updateEmail = useMutation(api.evalsDb.updateDatasetEmail);
  const markReviewed = useMutation(api.evalsDb.markDatasetReviewed);
  const lockDataset = useMutation(api.evalsDb.lockDataset);
  const unlockDataset = useMutation(api.evalsDb.unlockDataset);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (emails === undefined) return <p className="text-sm text-neutral-500">Loading…</p>;

  const reviewedCount = emails.filter((e) => e.reviewed).length;

  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Dataset ({emails.length} emails · {reviewedCount} reviewed)
          {locked && (
            <span className="ml-2 rounded bg-neutral-900 px-1.5 py-0.5 text-xs font-medium text-white">
              LOCKED
            </span>
          )}
        </h2>
        <div className="flex gap-2">
          {!locked && (
            <button
              type="button"
              onClick={() => markReviewed({ datasetId })}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
            >
              Mark reviewed
            </button>
          )}
          {locked ? (
            <button
              type="button"
              onClick={() => {
                if (
                  confirm(
                    "Unlock dataset? Editing labels after this will invalidate prior benchmark comparisons.",
                  )
                )
                  unlockDataset({ datasetId });
              }}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
            >
              Unlock
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (
                  confirm(
                    "Lock this dataset? Labels will be frozen and no new datasets can be generated until you unlock.",
                  )
                )
                  lockDataset({ datasetId });
              }}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Lock dataset
            </button>
          )}
        </div>
      </div>
      <div className="mt-3 overflow-hidden rounded-md border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-3 py-2 w-8"></th>
              <th className="px-3 py-2">From</th>
              <th className="px-3 py-2">Subject / snippet</th>
              <th className="px-3 py-2 w-44">Expected</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {emails.map((e) => (
              <tr key={e._id} className={e.reviewed ? "bg-white" : "bg-yellow-50/40"}>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={e.reviewed}
                    disabled={busyId === e._id || locked}
                    onChange={async () => {
                      setBusyId(e._id);
                      await updateEmail({
                        emailId: e._id,
                        reviewed: !e.reviewed,
                      });
                      setBusyId(null);
                    }}
                  />
                </td>
                <td className="px-3 py-2 align-top text-neutral-600">
                  {e.from}
                </td>
                <td className="px-3 py-2 align-top">
                  <div className="font-medium text-neutral-900">
                    {e.subject}
                  </div>
                  <div className="text-neutral-500">{e.snippet}</div>
                  {e.rationale && (
                    <div className="mt-1 text-xs italic text-neutral-400">
                      label rationale: {e.rationale}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 align-top">
                  <select
                    value={e.expectedBucket}
                    disabled={busyId === e._id || locked}
                    onChange={async (ev) => {
                      setBusyId(e._id);
                      await updateEmail({
                        emailId: e._id,
                        expectedBucket: ev.target.value,
                        reviewed: true,
                      });
                      setBusyId(null);
                    }}
                    className={`rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                      BUCKET_TINT[e.expectedBucket] ??
                      "bg-neutral-100 text-neutral-700 ring-neutral-200"
                    }`}
                  >
                    {BUCKETS.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
