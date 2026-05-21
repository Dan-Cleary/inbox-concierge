import { describe, expect, it } from "vitest";
import { labelColorFor, roomNameFor } from "./roomNames";

describe("labelColorFor", () => {
  it("returns the canonical color for each default bucket", () => {
    expect(labelColorFor("Important")).toBe("#A33A2E");
    expect(labelColorFor("Can wait")).toBe("#7A6B43");
    expect(labelColorFor("Auto-archive")).toBe("#6E7068");
    expect(labelColorFor("Newsletter")).toBe("#3D5B6E");
  });

  it("cycles the custom palette by index for unknown labels", () => {
    const first = labelColorFor("From investors", 0);
    const second = labelColorFor("Recruiters", 1);
    expect(first).not.toBe(second);
    // Same index should yield the same color
    expect(labelColorFor("Anything", 0)).toBe(first);
  });

  it("wraps the custom palette modulo its length", () => {
    // 6 custom palette colors → index 6 wraps to index 0
    const at0 = labelColorFor("a", 0);
    const at6 = labelColorFor("b", 6);
    expect(at0).toBe(at6);
  });

  it("ignores customIndex for known default labels", () => {
    expect(labelColorFor("Important", 5)).toBe(labelColorFor("Important", 0));
  });
});

describe("roomNameFor (back-compat alias)", () => {
  it("returns the canonical name unchanged — no display mapping anymore", () => {
    expect(roomNameFor("Important")).toBe("Important");
    expect(roomNameFor("Newsletter")).toBe("Newsletter");
    expect(roomNameFor("From investors")).toBe("From investors");
  });
});
