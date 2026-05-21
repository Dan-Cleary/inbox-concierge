import { useAction, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import RunDetail from "./RunDetail";
import CostAccuracyChart from "./CostAccuracyChart";
import PromptEditor from "./PromptEditor";
import { roomNameFor } from "../lib/roomNames";
import Select from "../components/Select";

type ModelInfo = {
  id: string;
  label: string;
  provider: string;
  inputUsdPerM: number;
  outputUsdPerM: number;
};

type SortKey =
  | "model"
  | "prompt"
  | "status"
  | "accuracy"
  | "Important"
  | "Can wait"
  | "Auto-archive"
  | "Newsletter"
  | "avgLatencyMs"
  | "totalCostUsd"
  | "startedAt";

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
  const promptVersions = useQuery(api.promptVersions.list);
  const runBench = useAction(api.evalRunner.runBench);
  const listModels = useAction(api.evalRunner.listModels);
  const [models, setModels] = useState<ModelInfo[] | null>(null);
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [explicitlySelectedPromptVersionId, setSelectedPromptVersionId] =
    useState<Id<"promptVersions"> | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedRun, setExpandedRun] = useState<Id<"evalRuns"> | null>(null);
  const [promptEditorOpen, setPromptEditorOpen] = useState(false);
  const [sort, setSort] = useState<{
    key: SortKey;
    dir: "asc" | "desc";
  }>({ key: "startedAt", dir: "desc" });

  useEffect(() => {
    (async () => {
      const ms = (await listModels({})) as ModelInfo[];
      setModels(ms);
      setSelectedModels(new Set(ms.map((m) => m.id)));
    })();
  }, [listModels]);

  if (runs === undefined || models === null) return null;

  // Default the prompt selector to the latest version when the user hasn't
  // explicitly picked one. Derived in render so we don't setState in effect.
  const selectedPromptVersionId: Id<"promptVersions"> | null =
    explicitlySelectedPromptVersionId ?? promptVersions?.[0]?._id ?? null;

  const promptVersionLabelById = new Map(
    (promptVersions ?? []).map((p) => [p._id, p.label]),
  );

  // Scatter shows only the latest completed run per model so re-runs don't
  // pile up duplicate dots. `runs` is already sorted newest-first by listRuns.
  const latestRunByModel = new Map<string, (typeof runs)[number]>();
  for (const r of runs) {
    if (r.status === "completed" && !latestRunByModel.has(r.model)) {
      latestRunByModel.set(r.model, r);
    }
  }
  const chartPoints = Array.from(latestRunByModel.values()).map((r) => ({
    id: r._id,
    label: r.model,
    cost: r.totalCostUsd ?? 0,
    accuracy: r.accuracy ?? 0,
  }));

  return (
    <section className="space-y-4">
      <div className="border border-[var(--rule)] bg-[var(--card)] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-neutral-600">Models:</span>
          {models.map((m) => {
            const checked = selectedModels.has(m.id);
            return (
              <label
                key={m.id}
                className={`flex cursor-pointer items-center gap-1.5 border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  checked
                    ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--bg)]"
                    : "border-[var(--rule)] bg-[var(--bg)] text-[var(--ink)] hover:border-[var(--ink)]"
                }`}
                title={`${m.label} · $${m.inputUsdPerM}/$${m.outputUsdPerM} per 1M tokens`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    const next = new Set(selectedModels);
                    if (e.target.checked) next.add(m.id);
                    else next.delete(m.id);
                    setSelectedModels(next);
                  }}
                  className="sr-only"
                />
                {checked && (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-3 w-3"
                  >
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                )}
                {m.label}
              </label>
            );
          })}
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="flex flex-1 items-center gap-2">
            <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mute)]">
              Prompt
            </span>
            <Select
              value={selectedPromptVersionId ?? ""}
              onChange={(next) =>
                setSelectedPromptVersionId(
                  (next || null) as Id<"promptVersions"> | null,
                )
              }
              placeholder="latest"
              options={(promptVersions ?? []).map((p, i) => ({
                value: p._id as string,
                label: p.label,
                hint: i === 0 ? "latest" : undefined,
              }))}
            />
            <button
              type="button"
              onClick={() => setPromptEditorOpen(true)}
              className="shrink-0 border border-[var(--ink)] bg-[var(--bg)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ink)] hover:bg-[var(--card)]"
            >
              Edit
            </button>
          </div>
          <button
            type="button"
            disabled={running || selectedModels.size === 0}
            onClick={async () => {
              setRunning(true);
              setError(null);
              try {
                await runBench({
                  datasetId,
                  modelIds: Array.from(selectedModels),
                  promptVersionId: selectedPromptVersionId ?? undefined,
                });
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
              } finally {
                setRunning(false);
              }
            }}
            className="w-full shrink-0 border border-[var(--ink)] bg-[var(--ink)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--bg)] hover:bg-[var(--ink-soft)] disabled:opacity-50 sm:ml-auto sm:w-auto"
          >
            {running ? "Running…" : "Run bench"}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      <div className="overflow-x-auto border border-[var(--rule)] bg-[var(--bg)]">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <SortableHeader sort={sort} setSort={setSort} k="model">
                Model
              </SortableHeader>
              <SortableHeader sort={sort} setSort={setSort} k="prompt">
                Prompt
              </SortableHeader>
              <SortableHeader sort={sort} setSort={setSort} k="status">
                Status
              </SortableHeader>
              <SortableHeader sort={sort} setSort={setSort} k="accuracy">
                Accuracy
              </SortableHeader>
              {BUCKETS.map((b) => (
                <SortableHeader
                  key={b}
                  sort={sort}
                  setSort={setSort}
                  k={b}
                  className={BUCKET_HEADER_TINT[b] ?? ""}
                  title={`Per-bucket accuracy: ${roomNameFor(b)}`}
                >
                  {roomNameFor(b)}
                </SortableHeader>
              ))}
              <SortableHeader sort={sort} setSort={setSort} k="avgLatencyMs">
                Avg latency
              </SortableHeader>
              <SortableHeader
                sort={sort}
                setSort={setSort}
                k="totalCostUsd"
                title="Total cost in USD for classifying the entire dataset"
              >
                Total $
              </SortableHeader>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {runs.length === 0 && (
              <tr>
                <td
                  colSpan={10}
                  className="px-3 py-4 text-center text-neutral-500"
                >
                  No runs yet.
                </td>
              </tr>
            )}
            {sortRuns(runs, sort, promptVersionLabelById).map((r) => {
              const isExpanded = expandedRun === r._id;
              return (
                <tr
                  key={r._id}
                  className={
                    isExpanded
                      ? "bg-[var(--card-hi)] ring-1 ring-inset ring-[var(--moss)]"
                      : ""
                  }
                >
                  <td className="whitespace-nowrap px-3 py-2 font-medium">
                    {r.model}
                  </td>
                  <td className="px-3 py-2 text-xs text-neutral-500">
                    {r.promptVersionId
                      ? (promptVersionLabelById.get(r.promptVersionId) ??
                        "deleted")
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <StatusPill status={r.status} />
                  </td>
                  <td className="px-3 py-2 font-semibold">
                    {r.accuracy !== undefined ? formatPct(r.accuracy) : "—"}
                  </td>
                  {BUCKETS.map((b) => (
                    <td key={b} className="px-3 py-2 text-xs">
                      {r.perBucketAccuracy &&
                      r.perBucketAccuracy[b] !== undefined
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
                          setExpandedRun(isExpanded ? null : r._id)
                        }
                        className="text-xs text-blue-600 hover:underline"
                      >
                        {isExpanded ? "Hide" : "Inspect"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {expandedRun && <RunDetail runId={expandedRun} />}

      <CostAccuracyChart points={chartPoints} />

      <PromptEditor
        open={promptEditorOpen}
        onClose={() => setPromptEditorOpen(false)}
      />
    </section>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "completed"
      ? "bg-[var(--card)] text-[var(--moss)] border-[var(--moss)]"
      : status === "running"
        ? "bg-[var(--card)] text-[var(--ink)] border-[var(--ink)]"
        : status === "failed"
          ? "bg-[var(--card)] text-[var(--alert)] border-[var(--alert)]"
          : "bg-[var(--card)] text-[var(--mute)] border-[var(--rule)]";
  return (
    <span
      className={`border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${cls}`}
    >
      {status}
    </span>
  );
}

function formatPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

function SortableHeader({
  k,
  sort,
  setSort,
  children,
  className,
  title,
}: {
  k: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" };
  setSort: (s: { key: SortKey; dir: "asc" | "desc" }) => void;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  const active = sort.key === k;
  return (
    <th
      onClick={() =>
        setSort({
          key: k,
          dir: active ? (sort.dir === "asc" ? "desc" : "asc") : "desc",
        })
      }
      className={`cursor-pointer select-none px-3 py-2 hover:text-neutral-800 ${
        className ?? ""
      } ${active ? "text-neutral-900" : ""}`}
      title={title}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {active && (
          <span aria-hidden="true">{sort.dir === "asc" ? "↑" : "↓"}</span>
        )}
      </span>
    </th>
  );
}

type Run = {
  _id: Id<"evalRuns">;
  model: string;
  promptVersionId?: Id<"promptVersions">;
  status: string;
  accuracy?: number;
  perBucketAccuracy?: Record<string, number>;
  avgLatencyMs?: number;
  totalCostUsd?: number;
  startedAt: number;
};

function sortRuns(
  runs: Run[],
  sort: { key: SortKey; dir: "asc" | "desc" },
  promptLabels: Map<Id<"promptVersions">, string>,
): Run[] {
  const out = [...runs];
  const mul = sort.dir === "asc" ? 1 : -1;
  out.sort((a, b) => {
    const va = getSortValue(a, sort.key, promptLabels);
    const vb = getSortValue(b, sort.key, promptLabels);
    if (va === undefined && vb === undefined) return 0;
    if (va === undefined) return 1; // undefined always sorts last
    if (vb === undefined) return -1;
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * mul;
    return String(va).localeCompare(String(vb)) * mul;
  });
  return out;
}

function getSortValue(
  r: Run,
  k: SortKey,
  promptLabels: Map<Id<"promptVersions">, string>,
): string | number | undefined {
  switch (k) {
    case "model":
      return r.model;
    case "prompt":
      return r.promptVersionId ? promptLabels.get(r.promptVersionId) : "";
    case "status":
      return r.status;
    case "accuracy":
      return r.accuracy;
    case "Important":
    case "Can wait":
    case "Auto-archive":
    case "Newsletter":
      return r.perBucketAccuracy?.[k];
    case "avgLatencyMs":
      return r.avgLatencyMs;
    case "totalCostUsd":
      return r.totalCostUsd;
    case "startedAt":
      return r.startedAt;
  }
}
