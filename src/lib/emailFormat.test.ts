import { describe, expect, it } from "vitest";
import { decodeEntities, extractName, formatEmailDate } from "./emailFormat";

describe("extractName", () => {
  it("pulls the display name out of a 'Name <email>' header", () => {
    expect(extractName("Dan Cleary <dan@example.com>")).toBe("Dan Cleary");
  });

  it("handles quoted display names", () => {
    expect(extractName('"Dan Cleary" <dan@example.com>')).toBe("Dan Cleary");
  });

  it("falls back to the raw string when there is no <email> portion", () => {
    expect(extractName("dan@example.com")).toBe("dan@example.com");
  });

  it("trims whitespace around the display name", () => {
    expect(extractName("  Dan   Cleary   <dan@example.com>")).toBe(
      "Dan   Cleary",
    );
  });

  it("preserves spaces inside the display name", () => {
    expect(extractName("The Sentry Team <noreply@sentry.io>")).toBe(
      "The Sentry Team",
    );
  });
});

describe("formatEmailDate", () => {
  const may19_2026 = new Date("2026-05-19T15:00:00Z").getTime();

  it("uses Mon Day format when the email is from the current year", () => {
    const now = new Date("2026-08-01T00:00:00Z").getTime();
    const out = formatEmailDate(may19_2026, now);
    // Locale formats vary by env, but month abbreviation should appear
    expect(out).toMatch(/May/);
  });

  it("uses full short date when the email is from a prior year", () => {
    const now = new Date("2027-01-15T00:00:00Z").getTime();
    const out = formatEmailDate(may19_2026, now);
    // Year should now appear since it's not the current year
    expect(out).toMatch(/2026/);
  });
});

describe("decodeEntities", () => {
  it("decodes &#39; to apostrophe", () => {
    expect(decodeEntities("we&#39;re shipping")).toBe("we're shipping");
  });

  it("decodes &amp; to ampersand", () => {
    expect(decodeEntities("AT&amp;T")).toBe("AT&T");
  });

  it("decodes the common HTML entities together", () => {
    expect(decodeEntities("&quot;hello&quot; &lt;world&gt;")).toBe(
      '"hello" <world>',
    );
  });

  it("returns the input unchanged when it has no entities (fast path)", () => {
    const plain = "no entities here, just text";
    expect(decodeEntities(plain)).toBe(plain);
  });

  it("returns empty string for empty input", () => {
    expect(decodeEntities("")).toBe("");
  });
});
