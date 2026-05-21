import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { roomNameFor } from "../lib/roomNames";

const BUCKETS = ["Important", "Can wait", "Auto-archive", "Newsletter"] as const;

const BUCKET_TINT: Record<string, string> = {
  Important: "bg-red-50 text-red-700 ring-red-200",
  "Can wait": "bg-amber-50 text-amber-700 ring-amber-200",
  "Auto-archive": "bg-neutral-100 text-neutral-600 ring-neutral-200",
  Newsletter: "bg-blue-50 text-blue-700 ring-blue-200",
};

export default function DatasetTable({
  datasetId,
}: {
  datasetId: Id<"evalDatasets">;
}) {
  const emails = useQuery(api.evalsDb.getDatasetEmails, { datasetId });
  const updateEmail = useMutation(api.evalsDb.updateDatasetEmail);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (emails === undefined) return <p className="text-sm text-neutral-500">Loading…</p>;

  return (
    <section>
      <div className="overflow-x-auto rounded-md border border-neutral-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-3 py-2">From</th>
              <th className="px-3 py-2">Subject / snippet</th>
              <th className="px-3 py-2 w-44">Expected</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {emails.map((e) => (
              <tr key={e._id}>
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
                    disabled={busyId === e._id}
                    onChange={async (ev) => {
                      setBusyId(e._id);
                      try {
                        await updateEmail({
                          emailId: e._id,
                          expectedBucket: ev.target.value,
                        });
                      } finally {
                        setBusyId(null);
                      }
                    }}
                    className={`rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                      BUCKET_TINT[e.expectedBucket] ??
                      "bg-neutral-100 text-neutral-700 ring-neutral-200"
                    }`}
                  >
                    {BUCKETS.map((b) => (
                      <option key={b} value={b}>
                        {roomNameFor(b)}
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
