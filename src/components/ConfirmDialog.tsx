import { useEffect, useRef } from "react";

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmBtn = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    confirmBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const confirmBgClass =
    variant === "danger"
      ? "bg-[var(--alert)] border-[var(--alert)] hover:opacity-90"
      : "bg-[var(--ink)] border-[var(--ink)] hover:bg-[var(--ink-soft)]";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(22,34,26,0.45)] p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[420px] border border-[var(--ink)] bg-[var(--card-hi)]"
      >
        <div className="px-7 pt-6 pb-4">
          <h3
            id="confirm-title"
            className="text-[18px] font-medium tracking-tight text-[var(--ink)]"
          >
            {title}
          </h3>
          {message && (
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--mute)]">
              {message}
            </p>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[var(--rule)] px-7 py-3.5">
          <button
            type="button"
            onClick={onCancel}
            className="border border-[var(--ink)] bg-[var(--bg)] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ink)] hover:bg-[var(--card)]"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtn}
            type="button"
            onClick={onConfirm}
            className={`border px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--bg)] ${confirmBgClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// useConfirm() lives in ./useConfirm.tsx — split out so this file only
// exports the component (React fast-refresh compatibility).
