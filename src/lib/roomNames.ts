// Garden voice: buckets are "rooms" with botanical/spatial names. The
// classifier still uses the internal canonical names (Important / Can wait
// / etc.) — this is a display-only mapping so renaming doesn't invalidate
// the prompt history or eval dataset.

export const ROOM_DISPLAY: Record<
  string,
  { name: string; note: string; color: string }
> = {
  Important: { name: "For you", note: "Reply today.", color: "#A33A2E" },
  "Can wait": { name: "Pending", note: "Sit with these.", color: "#7A6B43" },
  "Auto-archive": {
    name: "Filed",
    note: "I'll archive at 2.",
    color: "#6E7068",
  },
  Newsletter: {
    name: "Reading",
    note: "For your coffee.",
    color: "#3D5B6E",
  },
  "Production alerts": {
    name: "Systems",
    note: "One still warm.",
    color: "#A33A2E",
  },
  Outreach: { name: "People", note: "Strangers and friends.", color: "#5B6E47" },
};

const CUSTOM_PALETTE = [
  "#3F5A3A",
  "#5B6E47",
  "#7A6B43",
  "#3D5B6E",
  "#6B4A3A",
  "#5C4E7A",
];

export function roomNameFor(canonical: string): string {
  return ROOM_DISPLAY[canonical]?.name ?? canonical;
}

export function roomColorFor(
  canonical: string,
  customIndex: number = 0,
): string {
  return (
    ROOM_DISPLAY[canonical]?.color ??
    CUSTOM_PALETTE[customIndex % CUSTOM_PALETTE.length]
  );
}

export function roomNoteFor(canonical: string): string {
  return ROOM_DISPLAY[canonical]?.note ?? "A custom room.";
}
