import { useEffect, useRef, useState } from "react";

export type SelectOption<T extends string> = {
  value: T;
  label: string;
  // Optional swatch shown left of the label (used for label-color dots).
  color?: string;
  // Optional caption shown right of the label in muted color.
  hint?: string;
};

// Garden-styled <select> replacement. Avoids OS-native chrome. Click
// outside or Escape closes. Selected option gets a moss left bar.
export default function Select<T extends string>({
  value,
  options,
  onChange,
  disabled,
  placeholder,
  align = "left",
  buttonClassName,
}: {
  value: T;
  options: SelectOption<T>[];
  onChange: (next: T) => void;
  disabled?: boolean;
  placeholder?: string;
  align?: "left" | "right";
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex min-w-0 items-center gap-1.5 border border-[var(--rule)] bg-[var(--bg)] px-2 py-1 text-[12px] text-[var(--ink)] transition-colors hover:border-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-50 ${
          open ? "border-[var(--ink)]" : ""
        } ${buttonClassName ?? ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {current?.color && (
          <span
            className="inline-block h-2 w-2 shrink-0"
            style={{ background: current.color }}
          />
        )}
        <span className="truncate">
          {current?.label ?? placeholder ?? "Select…"}
        </span>
        <Chevron open={open} />
      </button>
      {open && (
        <div
          role="listbox"
          className={`absolute z-50 mt-1 min-w-full border border-[var(--ink)] bg-[var(--card-hi)] shadow-lg ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <ul className="max-h-72 overflow-y-auto py-0.5">
            {options.map((o) => {
              const active = o.value === value;
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] transition-colors ${
                      active
                        ? "bg-[var(--card)] text-[var(--ink)]"
                        : "text-[var(--ink)] hover:bg-[var(--card)]"
                    }`}
                  >
                    <span
                      className="inline-block w-0.5 self-stretch shrink-0"
                      style={{
                        background: active ? "var(--moss)" : "transparent",
                      }}
                    />
                    {o.color !== undefined && (
                      <span
                        className="inline-block h-2 w-2 shrink-0"
                        style={{ background: o.color }}
                      />
                    )}
                    <span className="flex-1 truncate">{o.label}</span>
                    {o.hint && (
                      <span className="kicker shrink-0">{o.hint}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-3 w-3 shrink-0 transition-transform ${
        open ? "rotate-180" : ""
      }`}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
