import { useAction, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import RunDetail from "./RunDetail";

type ModelInfo = {
  id: string;
  label: string;
  provider: string;
  inputUsdPerM: number;
  outputUsdPerM: number;
};

const BUCKETS = ["Important", "Can wait", "Auto-archive", "Newsletter"] as const;

const BUCKET_HEADER_TINT: Record<string, string> = {
  Important: "text-red-700",
  "Can wait": "text-amber-700",
  "Auto-archive": "text-neutral-600",
  Newsletter: "text-blue-700",
};

export default function RunsPanel({
  datasetId,
}: {
  datasetId: Id<"evalDatasets">;
}) {
  const runs = useQuery(api.evalsDb.listRuns, { datasetId });
  const runBench = useAction(api.evalRunner.runBench);
  const listModels = useAction(api.evalRunner.listModels);
  const [models, setModels] = useState<ModelInfo[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedRun, setExpandedRun] = useState<Id<"evalRuns"> | null>(null);

  useEffect(() => {
    (async () => {
      const ms = (await listModels({})) as ModelInfo[];
      setModels(ms);
      setSelected(new Set(ms.map((m) => m.id)));
    })();
  }, [listModels]);

  if (runs === undefined || models === null) return null;

  return (
    <section className="space-y-4">
      <div className="rounded-md border border-neutral-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-neutral-600">Models:</span>
          {models.map((m) => (
            <label
              key={m.id}
              className="flex items-center gap-1.5 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs"
            >
              <input
                type="checkbox"
                checked={selected.has(m.id)}
                onChange={(e) => {
                  const next = new Set(selected);
                  if (e.target.checked) next.add(m.id);
                  else next.delete(m.id);
                  setSelected(next);
                }}
              />
              <span className="font-medium">{m.label}</span>
              <span className="text-neutral-400">
                ${m.inputUsdPerM}/${m.outputUsdPerM} per M
              </span>
            </label>
          ))}
          <button
            type="button"
            disabled={running || selected.size === 0}
            onClick={async () => {
              setRunning(true);
              setError(null);
              try {
                await runBench({
                  datasetId,
                  modelIds: Array.from(selected),
                });
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
              } finally {
                setRunning(false);
              }
            }}
            className="ml-auto rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {running ? "Running…" : "Run bench"}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      <div className="overflow-hidden rounded-md border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-3 py-2">Model</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Accuracy</th>
              {BUCKETS.map((b) => (
                <th
                  key={b}
                  className={`px-3 py-2 ${BUCKET_HEADER_TINT[b] ?? ""}`}
                  title={`Per-bucket accuracy: ${b}`}
                >
                  {b}
                </th>
              ))}
              <th className="px-3 py-2">Avg latency</th>
              <th
                className="px-3 py-2"
                title="Total cost in USD for classifying the entire dataset"
              >
                Total $
              </th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {runs.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  className="px-3 py-4 text-center text-neutral-500"
                >
                  No runs yet.
                </td>
              </tr>
            )}
            {runs.map((r) => (
              <tr key={r._id}>
                <td className="px-3 py-2 font-medium">{r.model}</td>
                <td className="px-3 py-2">
                  <StatusPill status={r.status} />
                </td>
                <td className="px-3 py-2 font-semibold">
                  {r.accuracy !== undefined ? formatPct(r.accuracy) : "—"}
                </td>
                {BUCKETS.map((b) => (
                  <td key={b} className="px-3 py-2 text-xs">
                    {r.perBucketAccuracy && r.perBucketAccuracy[b] !== undefined
                      ? formatPct(r.perBucketAccuracy[b])
                      : "—"}
                  </td>
                ))}
                <td className="px-3 py-2">
                  {r.avgLatencyMs ? `${Math.round(r.avgLatencyMs)}ms` : "—"}
                </td>
                <td className="px-3 py-2">
                  {r.totalCostUsd !== undefined
                    ? `$${r.totalCostUsd.toFixed(4)}`
                    : "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  {r.status === "completed" && (
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedRun(expandedRun === r._id ? null : r._id)
                      }
                      className="text-xs text-blue-600 hover:underline"
                    >
                      {expandedRun === r._id ? "Hide" : "Inspect"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {expandedRun && <RunDetail runId={expandedRun} />}
    </section>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "completed"
      ? "bg-green-100 text-green-700"
      : status === "running"
        ? "bg-blue-100 text-blue-700"
        : status === "failed"
          ? "bg-red-100 text-red-700"
          : "bg-neutral-100 text-neutral-600";
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

function formatPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}
