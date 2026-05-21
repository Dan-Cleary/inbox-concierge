export default function AtriumMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
      className="shrink-0"
    >
      <rect
        x="3"
        y="3"
        width="58"
        height="58"
        fill="none"
        stroke="#16221A"
        strokeWidth="1.5"
      />
      <rect
        x="14"
        y="14"
        width="36"
        height="36"
        fill="none"
        stroke="#16221A"
        strokeWidth="1.5"
      />
      <rect x="24" y="24" width="16" height="16" fill="#3F5A3A" />
    </svg>
  );
}
