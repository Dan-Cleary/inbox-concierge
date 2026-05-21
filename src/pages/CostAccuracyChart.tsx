import {
  CartesianGrid,
  Label,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

type Point = {
  id: string;
  label: string;
  cost: number;
  accuracy: number;
};

// Cost-vs-accuracy scatter. Log-scale on X (cost spans orders of magnitude),
// percent on Y. Pareto front (best-acc-at-any-given-cost) highlighted as a
// second scatter series in green so it pops without a separate line geometry.
export default function CostAccuracyChart({ points }: { points: Point[] }) {
  if (points.length === 0) return null;

  const sorted = [...points].sort((a, b) => a.cost - b.cost);
  const frontIds = new Set<string>();
  let bestAcc = -Infinity;
  for (const p of sorted) {
    if (p.accuracy > bestAcc) {
      frontIds.add(p.id);
      bestAcc = p.accuracy;
    }
  }

  const data = points.map((p) => ({
    ...p,
    accuracyPct: p.accuracy * 100,
    onFront: frontIds.has(p.id),
  }));

  const frontData = data.filter((d) => d.onFront);
  const restData = data.filter((d) => !d.onFront);

  const costs = points.map((p) => p.cost).filter((c) => c > 0);
  const minCost = Math.min(...costs);
  const maxCost = Math.max(...costs);
  const xDomain = [minCost * 0.6, maxCost * 1.6];

  const accuracies = points.map((p) => p.accuracy * 100);
  const minAcc = Math.min(...accuracies);
  const maxAcc = Math.max(...accuracies);
  const yPad = Math.max(2, (maxAcc - minAcc) * 0.2);
  const yDomain = [Math.max(0, Math.floor(minAcc - yPad)), Math.min(100, Math.ceil(maxAcc + yPad))];

  // Build log-scale ticks at every decade between min and max so the user
  // can read where each model sits — endpoint-only ticks make clustering
  // invisible (e.g. $0.0014 and $0.38 with no middle stops).
  const xTicks: number[] = [];
  const lo = Math.floor(Math.log10(minCost));
  const hi = Math.ceil(Math.log10(maxCost));
  for (let i = lo; i <= hi; i++) {
    const tick = Math.pow(10, i);
    if (tick >= xDomain[0] && tick <= xDomain[1]) xTicks.push(tick);
  }

  return (
    <div className="rounded-md border border-neutral-200 bg-white p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">Cost vs accuracy</h3>
        <span className="text-xs text-neutral-500">
          green = pareto-optimal · top-left wins
        </span>
      </div>
      <div className="mt-3 h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 24, bottom: 36, left: 16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis
              type="number"
              dataKey="cost"
              scale="log"
              domain={xDomain}
              ticks={xTicks}
              tickFormatter={(v: number) =>
                v < 0.01
                  ? `$${v.toFixed(4)}`
                  : v < 1
                    ? `$${v.toFixed(2)}`
                    : `$${v.toFixed(2)}`
              }
              tick={{ fontSize: 11, fill: "#6b7280" }}
              stroke="#9ca3af"
              allowDataOverflow={false}
            >
              <Label
                value="total cost per run (USD, log scale)"
                position="bottom"
                offset={12}
                style={{ fontSize: 11, fill: "#6b7280" }}
              />
            </XAxis>
            <YAxis
              type="number"
              dataKey="accuracyPct"
              domain={yDomain}
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fontSize: 11, fill: "#6b7280" }}
              stroke="#9ca3af"
              width={48}
            >
              <Label
                value="accuracy"
                angle={-90}
                position="left"
                offset={-2}
                style={{ fontSize: 11, fill: "#6b7280" }}
              />
            </YAxis>
            <ZAxis range={[80, 80]} />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              content={<CustomTooltip />}
            />
            <Scatter
              name="other models"
              data={restData}
              fill="#3b82f6"
              shape={(props: ScatterShapeProps) => (
                <LabeledDot {...props} color="#3b82f6" />
              )}
            />
            <Scatter
              name="pareto front"
              data={frontData}
              fill="#10b981"
              shape={(props: ScatterShapeProps) => (
                <LabeledDot {...props} color="#10b981" />
              )}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// Recharts passes lots of props through to shape renderers; we only care
// about cx/cy/payload, but the rest exist at runtime.
type ScatterShapeProps = {
  cx?: number;
  cy?: number;
  payload?: { label: string };
};

function LabeledDot({ cx, cy, payload, color }: ScatterShapeProps & { color: string }) {
  if (cx === undefined || cy === undefined || !payload) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={5} fill={color} stroke="white" strokeWidth={1.5} />
      <text
        x={cx + 8}
        y={cy - 6}
        fontSize={10}
        fill="#374151"
        style={{ pointerEvents: "none" }}
      >
        {payload.label}
      </text>
    </g>
  );
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    payload: { label: string; cost: number; accuracy: number; onFront: boolean };
  }>;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs shadow-sm">
      <div className="font-medium text-neutral-900">{p.label}</div>
      <div className="mt-1 text-neutral-600">
        {(p.accuracy * 100).toFixed(1)}% accuracy
      </div>
      <div className="text-neutral-600">${p.cost.toFixed(4)} / run</div>
      {p.onFront && (
        <div className="mt-1 font-medium text-green-700">pareto-optimal</div>
      )}
    </div>
  );
}
