// Pure helpers used by inbox + chat rendering. Extracted so they can be
// unit-tested without spinning up React.

// Pull a human-readable sender name out of an RFC 5322-ish From header.
// "Dan Cleary <dan@example.com>"     -> "Dan Cleary"
// '"Dan Cleary" <dan@example.com>'   -> "Dan Cleary"
// "dan@example.com"                  -> "dan@example.com" (no display name)
export function extractName(from: string): string {
  const match = from.match(/^"?([^"<]+?)"?\s*<.+>$/);
  return match?.[1]?.trim() ?? from;
}

// Short date label: "May 19" for current year, full short date otherwise.
export function formatEmailDate(ms: number, now: number = Date.now()): string {
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return sameYear
    ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : d.toLocaleDateString();
}

// Decode HTML entities in Gmail snippets ("we&#39;re" -> "we're").
// Uses a textarea trick — only run in the browser.
let __decoder: HTMLTextAreaElement | null = null;
export function decodeEntities(s: string): string {
  if (!s) return "";
  if (!s.includes("&")) return s;
  if (typeof document === "undefined") {
    // Server-side fallback: handle the common entities directly.
    return s
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
  }
  if (!__decoder) __decoder = document.createElement("textarea");
  __decoder.innerHTML = s;
  return __decoder.value;
}
