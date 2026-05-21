import { describe, expect, it } from "vitest";
import { MODELS, getModel } from "./models";

describe("model registry", () => {
  it("exposes at least the 6 bench candidates", () => {
    expect(MODELS.length).toBeGreaterThanOrEqual(6);
  });

  it("includes a candidate from each provider", () => {
    const providers = new Set(MODELS.map((m) => m.provider));
    expect(providers).toContain("anthropic");
    expect(providers).toContain("openai");
    expect(providers).toContain("google");
  });

  it("ids are unique", () => {
    const ids = MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every model has a positive output price (used for cost math)", () => {
    for (const m of MODELS) {
      expect(m.outputUsdPerM).toBeGreaterThan(0);
      expect(m.inputUsdPerM).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("getModel", () => {
  it("returns the matching config", () => {
    const m = getModel("claude-haiku-4-5");
    expect(m.provider).toBe("anthropic");
    expect(m.label).toBe("Claude Haiku 4.5");
  });

  it("throws on unknown id (prevents silent fallback to a wrong model)", () => {
    expect(() => getModel("nonsense-id")).toThrow(/Unknown model id/);
  });
});
