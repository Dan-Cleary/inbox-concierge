// Pure citation parser used by the chat sidebar. Extracts [cid:emailId]
// markers from assistant text, dedupes by id, and returns a (cleanedText,
// citations[]) pair where markers are replaced with stable {{CITE-N-id}}
// placeholders for downstream rendering.

export type Citation = { id: string; index: number };

export function extractCitations(text: string): {
  cleaned: string;
  citations: Citation[];
} {
  const re = /\[cid:([a-z0-9]+)\]/gi;
  const idToIndex = new Map<string, number>();
  const citations: Citation[] = [];
  const cleaned = text.replace(re, (_, id: string) => {
    let idx = idToIndex.get(id);
    if (idx === undefined) {
      idx = idToIndex.size + 1;
      idToIndex.set(id, idx);
      citations.push({ id, index: idx });
    }
    return `{{CITE-${idx}-${id}}}`;
  });
  return { cleaned, citations };
}
