// Label color palette. Canonical names from the classifier are kept as-is
// in the UI — no display-name mapping. Only colors are mapped, so the
// sidebar dots, inline pills, and chart legends share one source of truth.

const LABEL_COLOR: Record<string, string> = {
  Important: "#A33A2E",
  "Can wait": "#7A6B43",
  "Auto-archive": "#6E7068",
  Newsletter: "#3D5B6E",
  "Production alerts": "#A33A2E",
  Outreach: "#5B6E47",
};

const CUSTOM_PALETTE = [
  "#3F5A3A",
  "#5B6E47",
  "#7A6B43",
  "#3D5B6E",
  "#6B4A3A",
  "#5C4E7A",
];

export function labelColorFor(
  canonical: string,
  customIndex: number = 0,
): string {
  return (
    LABEL_COLOR[canonical] ??
    CUSTOM_PALETTE[customIndex % CUSTOM_PALETTE.length]
  );
}

// Back-compat exports so I don't have to chase every import.
export const roomColorFor = labelColorFor;
export function roomNameFor(canonical: string): string {
  return canonical;
}
