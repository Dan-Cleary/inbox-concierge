import { describe, expect, it } from "vitest";
import {
  computeAccuracy,
  computePerBucketAccuracy,
  type EvalResult,
} from "./evalScoring";

const mk = (
  expected: string,
  predicted: string,
): EvalResult => ({
  expectedBucket: expected,
  predictedBucket: predicted,
  correct: expected === predicted,
});

describe("computeAccuracy", () => {
  it("returns 0 for empty input (avoids NaN in dashboards)", () => {
    expect(computeAccuracy([])).toBe(0);
  });

  it("computes correct / total", () => {
    const r = [mk("A", "A"), mk("A", "B"), mk("B", "B"), mk("C", "C")];
    expect(computeAccuracy(r)).toBe(0.75);
  });

  it("returns 1 when every prediction is correct", () => {
    expect(computeAccuracy([mk("A", "A"), mk("B", "B")])).toBe(1);
  });

  it("returns 0 when every prediction is wrong", () => {
    expect(computeAccuracy([mk("A", "B"), mk("B", "A")])).toBe(0);
  });
});

describe("computePerBucketAccuracy", () => {
  it("returns 0 for buckets with no expected emails (no NaN)", () => {
    const r = [mk("A", "A")];
    const scores = computePerBucketAccuracy(r, ["A", "B", "C"]);
    expect(scores).toEqual({ A: 1, B: 0, C: 0 });
  });

  it("scores each bucket independently of others", () => {
    // A: 2/2 correct, B: 1/2 correct
    const r = [mk("A", "A"), mk("A", "A"), mk("B", "B"), mk("B", "A")];
    const scores = computePerBucketAccuracy(r, ["A", "B"]);
    expect(scores).toEqual({ A: 1, B: 0.5 });
  });

  it("ignores predictions when bucket is not in the list (catches taxonomy drift)", () => {
    // C is not in the bucket list — must not appear in output
    const r = [mk("A", "A"), mk("C", "A")];
    const scores = computePerBucketAccuracy(r, ["A", "B"]);
    expect(scores).toEqual({ A: 1, B: 0 });
    expect("C" in scores).toBe(false);
  });
});
