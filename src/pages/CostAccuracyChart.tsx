// Tiny scatter chart: x = cost (log scale), y = accuracy. Pareto-front
// shows up clearly at the top-left. Used below the bench table.
type Point = {
  id: string;
  label: string;
  cost: number;
  accuracy: number;
};

export default function CostAccuracyChart({ points }: { points: Point[] }) {
  if (points.length === 0) return null;

  const W = 520;
  const H = 200;
  const PAD_L = 50;
  const PAD_R = 16;
  const PAD_T = 16;
  const PAD_B = 32;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const costs = points.map((p) => p.cost).filter((c) => c > 0);
  const minCost = Math.min(...costs);
  const maxCost = Math.max(...costs);
  const minLogCost = Math.log10(minCost);
  const maxLogCost = Math.log10(maxCost);
  const xRange = Math.max(0.0001, maxLogCost - minLogCost);

  const xOf = (cost: number) => {
    if (cost <= 0) return PAD_L;
    const t = (Math.log10(cost) - minLogCost) / xRange;
    return PAD_L + t * plotW;
  };
  const yOf = (acc: number) => PAD_T + (1 - acc) * plotH;

  // Pareto front: best accuracy at each cost-or-better.
  const sorted = [...points].sort((a, b) => a.cost - b.cost);
  const front: Point[] = [];
  let bestAcc = -Infinity;
  for (const p of sorted) {
    if (p.accuracy > bestAcc) {
      front.push(p);
      bestAcc = p.accuracy;
    }
  }

  const accTicks = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0];

  return (
    <div className="rounded-md border border-neutral-200 bg-white p-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">Cost vs accuracy</h3>
        <span className="text-xs text-neutral-500">log-scale cost · top-left wins</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full">
        {/* Accuracy gridlines + ticks */}
        {accTicks.map((t) => (
          <g key={t}>
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={yOf(t)}
              y2={yOf(t)}
              stroke="#f3f4f6"
            />
            <text
              x={PAD_L - 6}
              y={yOf(t) + 4}
              fontSize="10"
              fill="#9ca3af"
              textAnchor="end"
            >
              {Math.round(t * 100)}%
            </text>
          </g>
        ))}
        {/* X axis cost ticks */}
        {(() => {
          const ticks: number[] = [];
          const lo = Math.floor(minLogCost);
          const hi = Math.ceil(maxLogCost);
          for (let i = lo; i <= hi; i++) ticks.push(Math.pow(10, i));
          return ticks.map((c) => (
            <g key={c}>
              <line
                x1={xOf(c)}
                x2={xOf(c)}
                y1={PAD_T}
                y2={H - PAD_B}
                stroke="#f3f4f6"
              />
              <text
                x={xOf(c)}
                y={H - PAD_B + 14}
                fontSize="10"
                fill="#9ca3af"
                textAnchor="middle"
              >
                {c < 0.01 ? `$${c.toFixed(4)}` : c < 1 ? `$${c.toFixed(2)}` : `$${c}`}
              </text>
            </g>
          ));
        })()}
        {/* Axis labels */}
        <text
          x={PAD_L + plotW / 2}
          y={H - 4}
          fontSize="10"
          fill="#6b7280"
          textAnchor="middle"
        >
          total cost per run (USD, log scale)
        </text>
        {/* Pareto-front line */}
        {front.length >= 2 && (
          <polyline
            points={front
              .map((p) => `${xOf(p.cost)},${yOf(p.accuracy)}`)
              .join(" ")}
            fill="none"
            stroke="#10b981"
            strokeWidth={1.5}
            strokeDasharray="3 3"
          />
        )}
        {/* Points */}
        {points.map((p) => {
          const isFront = front.includes(p);
          return (
            <g key={p.id}>
              <circle
                cx={xOf(p.cost)}
                cy={yOf(p.accuracy)}
                r={isFront ? 5 : 4}
                fill={isFront ? "#10b981" : "#3b82f6"}
                opacity={0.85}
              />
              <text
                x={xOf(p.cost) + 8}
                y={yOf(p.accuracy) - 4}
                fontSize="10"
                fill="#374151"
              >
                {p.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
