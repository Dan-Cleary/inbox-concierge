import { describe, expect, it } from "vitest";
import { extractCitations } from "./citations";

describe("extractCitations", () => {
  it("returns text unchanged when there are no markers", () => {
    const { cleaned, citations } = extractCitations("just text");
    expect(cleaned).toBe("just text");
    expect(citations).toEqual([]);
  });

  it("extracts a single citation and replaces with a numbered placeholder", () => {
    const { cleaned, citations } = extractCitations(
      "Stripe said hello [cid:abc123].",
    );
    expect(cleaned).toBe("Stripe said hello {{CITE-1-abc123}}.");
    expect(citations).toEqual([{ id: "abc123", index: 1 }]);
  });

  it("dedupes repeat references to the same email under one index", () => {
    const { cleaned, citations } = extractCitations(
      "see [cid:abc] and again [cid:abc]",
    );
    expect(citations).toEqual([{ id: "abc", index: 1 }]);
    // Both markers should share index 1
    expect(cleaned).toContain("{{CITE-1-abc}}");
    expect(cleaned.match(/CITE-1-abc/g)).toHaveLength(2);
  });

  it("assigns indices in first-seen order across distinct ids", () => {
    const { citations } = extractCitations("[cid:b] then [cid:a] then [cid:b]");
    expect(citations).toEqual([
      { id: "b", index: 1 },
      { id: "a", index: 2 },
    ]);
  });

  it("ignores malformed marker shapes", () => {
    // Missing colon, missing brackets, wrong prefix — none should match.
    const { cleaned, citations } = extractCitations(
      "[citXabc] [cid abc] (cid:abc) [cidabc]",
    );
    expect(citations).toEqual([]);
    expect(cleaned).toBe("[citXabc] [cid abc] (cid:abc) [cidabc]");
  });
});
