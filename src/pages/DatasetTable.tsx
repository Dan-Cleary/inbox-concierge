import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { labelColorFor } from "../lib/roomNames";
import Select from "../components/Select";

const BUCKETS = ["Important", "Can wait", "Auto-archive", "Newsletter"] as const;
type DefaultBucket = (typeof BUCKETS)[number];

export default function DatasetTable({
  datasetId,
}: {
  datasetId: Id<"evalDatasets">;
}) {
  const emails = useQuery(api.evalsDb.getDatasetEmails, { datasetId });
  const updateEmail = useMutation(api.evalsDb.updateDatasetEmail);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (emails === undefined)
    return <p className="text-[12px] text-[var(--mute)]">Loading…</p>;

  return (
    <section>
      <div className="overflow-x-auto border border-[var(--rule)] bg-[var(--bg)]">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead className="border-b border-[var(--ink)] bg-[var(--card)] text-left">
            <tr>
              <th className="kicker px-3 py-2">From</th>
              <th className="kicker px-3 py-2">Subject / snippet</th>
              <th className="kicker w-48 px-3 py-2">Expected</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--rule-soft)]">
            {emails.map((e) => {
              return (
                <tr key={e._id}>
                  <td className="px-3 py-3 align-top text-[12px] text-[var(--mute)]">
                    {e.from}
                  </td>
                  <td className="px-3 py-3 align-top">
                    <div className="font-medium text-[var(--ink)]">
                      {e.subject}
                    </div>
                    <div className="text-[12px] text-[var(--mute)]">
                      {e.snippet}
                    </div>
                    {e.rationale && (
                      <div className="kicker mt-1 normal-case text-[var(--mute-dim)]">
                        rationale: {e.rationale}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 align-top">
                    <Select<DefaultBucket>
                      value={e.expectedBucket as DefaultBucket}
                      disabled={busyId === e._id}
                      options={BUCKETS.map((b) => ({
                        value: b,
                        label: b,
                        color: labelColorFor(b, 0),
                      }))}
                      onChange={async (next) => {
                        setBusyId(e._id);
                        try {
                          await updateEmail({
                            emailId: e._id,
                            expectedBucket: next,
                          });
                        } finally {
                          setBusyId(null);
                        }
                      }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
