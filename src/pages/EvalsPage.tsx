import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import DatasetTable from "./DatasetTable";
import RunsPanel from "./RunsPanel";
import { useConfirm } from "../components/ConfirmDialog";

type Tab = "dataset" | "bench";

export default function EvalsPage() {
  const datasets = useQuery(api.evalsDb.listDatasets);
  const deleteDataset = useMutation(api.evalsDb.deleteDataset);

  const [explicitlySelected, setSelected] = useState<Id<"evalDatasets"> | null>(
    null,
  );
  const [tab, setTab] = useState<Tab>("bench");
  const { confirm, dialog } = useConfirm();

  if (datasets === undefined) {
    return <p className="text-sm text-neutral-500">Loading…</p>;
  }
  // Default to the newest dataset when the user hasn't picked one yet. Derive
  // this in render so we avoid a setState-in-effect dance.
  const selected: Id<"evalDatasets"> | null =
    explicitlySelected ?? datasets[0]?._id ?? null;

  if (datasets.length === 0) {
    return (
      <div className="rounded-md border-2 border-dashed border-neutral-300 bg-white py-16 text-center">
        <p className="text-neutral-600">No eval dataset yet.</p>
        <p className="mt-1 text-sm text-neutral-500">
          Run{" "}
          <code className="rounded bg-neutral-100 px-1 py-0.5 text-xs">
            npx convex run evals:generateDataset '&#123;"targetSize":40&#125;'
          </code>{" "}
          to seed one.
        </p>
      </div>
    );
  }

  const currentDataset = datasets.find((d) => d._id === selected) ?? datasets[0];

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-semibold">Evals</h2>
        {datasets.length > 1 && (
          <div className="flex flex-wrap gap-1">
            {datasets.map((d) => (
              <button
                key={d._id}
                type="button"
                onClick={() => setSelected(d._id)}
                className={`rounded-md border px-2 py-1 text-xs ${
                  selected === d._id || (selected === null && d._id === datasets[0]._id)
                    ? "border-neutral-900 bg-neutral-900 text-white"
                    : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"
                }`}
              >
                {d.version}
              </button>
            ))}
            <button
              type="button"
              onClick={async () => {
                const ok = await confirm({
                  title: "Delete this dataset?",
                  message: "All runs and results tied to it will be deleted too.",
                  confirmLabel: "Delete",
                  variant: "danger",
                });
                if (ok) {
                  await deleteDataset({ datasetId: currentDataset._id });
                  setSelected(null);
                }
              }}
              className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        )}
      </header>

      <nav className="flex gap-1 border-b border-neutral-200">
        <TabButton active={tab === "bench"} onClick={() => setTab("bench")}>
          Bench
        </TabButton>
        <TabButton active={tab === "dataset"} onClick={() => setTab("dataset")}>
          Dataset
        </TabButton>
      </nav>

      {tab === "dataset" && <DatasetTable datasetId={currentDataset._id} />}
      {tab === "bench" && <RunsPanel datasetId={currentDataset._id} />}
      {dialog}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? "border-neutral-900 text-neutral-900"
          : "border-transparent text-neutral-500 hover:text-neutral-800"
      }`}
    >
      {children}
    </button>
  );
}
