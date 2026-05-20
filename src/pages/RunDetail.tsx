import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export default function RunDetail({ runId }: { runId: Id<"evalRuns"> }) {
  const results = useQuery(api.evalsDb.getRunResults, { runId });
  if (results === undefined) return null;

  const wrong = results.filter((r) => !r.correct);

  return (
    <div className="mt-3 rounded-md border border-neutral-200 bg-white p-4">
      <h3 className="text-sm font-semibold">
        Per-email results · showing {wrong.length} mistakes out of{" "}
        {results.length}
      </h3>
      {wrong.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-500">Clean sweep.</p>
      ) : (
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="py-1">Email</th>
              <th className="py-1 w-32">Expected</th>
              <th className="py-1 w-32">Predicted</th>
              <th className="py-1">Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {wrong.map((r) => (
              <tr key={r._id}>
                <td className="py-2 pr-3 text-xs text-neutral-500">
                  {r.datasetEmailId.slice(0, 8)}
                </td>
                <td className="py-2 pr-3 text-xs text-green-700">
                  {r.expectedBucket}
                </td>
                <td className="py-2 pr-3 text-xs text-red-700">
                  {r.predictedBucket}
                </td>
                <td className="py-2 text-xs text-neutral-600">{r.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
