// Pure aggregation helpers used by the eval bench runner. Extracted so
// they can be unit-tested without spinning up Convex.

export type EvalResult = {
  expectedBucket: string;
  predictedBucket: string;
  correct: boolean;
};

// Overall accuracy = correct / total. Empty input → 0 (defensible default,
// won't divide-by-zero in the dashboard).
export function computeAccuracy(results: EvalResult[]): number {
  if (results.length === 0) return 0;
  const correct = results.filter((r) => r.correct).length;
  return correct / results.length;
}

// Per-bucket accuracy keyed by expected label name. Each bucket score =
// correct-in-bucket / total-in-bucket. Buckets with no expected emails
// get 0 so the chart doesn't render NaN.
export function computePerBucketAccuracy(
  results: EvalResult[],
  buckets: string[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of buckets) {
    const inBucket = results.filter((r) => r.expectedBucket === b);
    out[b] =
      inBucket.length === 0
        ? 0
        : inBucket.filter((r) => r.correct).length / inBucket.length;
  }
  return out;
}
