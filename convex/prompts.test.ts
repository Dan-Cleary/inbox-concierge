import { describe, expect, it } from "vitest";
import {
  DEFAULT_BUCKETS,
  DEFAULT_CLASSIFICATION_SYSTEM_PROMPT,
  buildClassificationSystemPrompt,
  renderBucketTaxonomy,
} from "./prompts";

describe("renderBucketTaxonomy", () => {
  it("formats one bucket per numbered line with name and description", () => {
    const out = renderBucketTaxonomy([
      { name: "A", description: "first" },
      { name: "B", description: "second" },
    ]);
    expect(out).toBe("1. A — first\n\n2. B — second");
  });

  it("returns empty string for no buckets", () => {
    expect(renderBucketTaxonomy([])).toBe("");
  });
});

describe("buildClassificationSystemPrompt", () => {
  it("substitutes the rendered taxonomy into the default template", () => {
    const prompt = buildClassificationSystemPrompt([
      { name: "X", description: "lorem" },
    ]);
    expect(prompt).toContain("1. X — lorem");
    // The {{BUCKETS}} placeholder must be gone after substitution
    expect(prompt).not.toContain("{{BUCKETS}}");
    // Core rules from the default template should be present
    expect(prompt).toContain("Choose exactly one bucket per email");
  });

  it("accepts a custom template with the {{BUCKETS}} placeholder", () => {
    const tmpl = "ROLE\n\n{{BUCKETS}}\n\nEND";
    const prompt = buildClassificationSystemPrompt(
      [{ name: "X", description: "lorem" }],
      tmpl,
    );
    expect(prompt).toBe("ROLE\n\n1. X — lorem\n\nEND");
  });

  it("leaves text untouched when there is no placeholder", () => {
    // No {{BUCKETS}} → replace() is a no-op
    const prompt = buildClassificationSystemPrompt(
      [{ name: "X", description: "lorem" }],
      "no placeholder here",
    );
    expect(prompt).toBe("no placeholder here");
  });
});

describe("DEFAULT_CLASSIFICATION_SYSTEM_PROMPT", () => {
  it("is pre-rendered with the four default buckets", () => {
    expect(DEFAULT_BUCKETS).toHaveLength(4);
    for (const b of DEFAULT_BUCKETS) {
      expect(DEFAULT_CLASSIFICATION_SYSTEM_PROMPT).toContain(b.name);
    }
    expect(DEFAULT_CLASSIFICATION_SYSTEM_PROMPT).not.toContain("{{BUCKETS}}");
  });

  it("names all four canonical default labels", () => {
    const names = DEFAULT_BUCKETS.map((b) => b.name);
    expect(names).toEqual([
      "Important",
      "Can wait",
      "Auto-archive",
      "Newsletter",
    ]);
  });
});
