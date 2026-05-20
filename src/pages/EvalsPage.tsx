import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import DatasetTable from "./DatasetTable";
import RunsPanel from "./RunsPanel";

export default function EvalsPage() {
  const datasets = useQuery(api.evalsDb.listDatasets);
  const generateDataset = useAction(api.evals.generateDataset);
  const deleteDataset = useMutation(api.evalsDb.deleteDataset);

  const [selected, setSelected] = useState<Id<"evalDatasets"> | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetSize, setTargetSize] = useState(40);

  useEffect(() => {
    if (selected || !datasets || datasets.length === 0) return;
    setSelected(datasets[0]._id);
  }, [datasets, selected]);

  if (datasets === undefined) {
    return <p className="text-sm text-neutral-500">Loading…</p>;
  }

  const anyLocked = datasets.some((d) => d.locked);
  const selectedDataset = datasets.find((d) => d._id === selected);

  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Eval datasets</h2>
          <div className="flex items-center gap-2">
            <label className="text-sm text-neutral-600">
              Size
              <input
                type="number"
                min={8}
                max={200}
                value={targetSize}
                onChange={(e) => setTargetSize(Number(e.target.value))}
                className="ml-2 w-20 rounded border border-neutral-300 px-2 py-1 text-sm"
              />
            </label>
            <button
              type="button"
              disabled={generating || anyLocked}
              title={
                anyLocked
                  ? "A locked dataset already exists. Unlock or delete it first."
                  : undefined
              }
              onClick={async () => {
                if (
                  datasets.length > 0 &&
                  !confirm(
                    "Generate a new dataset? You already have one — runs against the new one won't be comparable to the old.",
                  )
                ) {
                  return;
                }
                setGenerating(true);
                setError(null);
                try {
                  const { datasetId } = await generateDataset({
                    targetSize,
                  });
                  setSelected(datasetId as Id<"evalDatasets">);
                } catch (err) {
                  setError(err instanceof Error ? err.message : String(err));
                } finally {
                  setGenerating(false);
                }
              }}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {generating ? "Generating…" : "Generate dataset"}
            </button>
          </div>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        {datasets.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">
            No datasets yet. Generate one to start.
          </p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {datasets.map((d) => (
              <li key={d._id}>
                <button
                  type="button"
                  onClick={() => setSelected(d._id)}
                  className={`rounded-md border px-3 py-1.5 text-sm ${
                    selected === d._id
                      ? "border-neutral-900 bg-neutral-900 text-white"
                      : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"
                  }`}
                >
                  {d.version} · {new Date(d.generatedAt).toLocaleString()}
                  {d.locked && " 🔒"}
                  {!d.locked && d.reviewedAt && " ✓"}
                </button>
              </li>
            ))}
            {selected && (
              <li>
                <button
                  type="button"
                  onClick={async () => {
                    if (
                      !confirm("Delete this dataset and all its runs/results?")
                    )
                      return;
                    await deleteDataset({ datasetId: selected });
                    setSelected(null);
                  }}
                  className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                >
                  Delete selected
                </button>
              </li>
            )}
          </ul>
        )}
      </section>

      {selected && selectedDataset && (
        <>
          <DatasetTable datasetId={selected} locked={selectedDataset.locked} />
          <RunsPanel datasetId={selected} />
        </>
      )}
    </div>
  );
}
