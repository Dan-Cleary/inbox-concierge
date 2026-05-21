import { useEffect, useRef } from "react";

// Custom confirm modal so we never hit the OS-styled `window.confirm`.
// Headless API: callers pass `open`, `onConfirm`, `onCancel` and the
// dialog handles backdrop click, Escape key, and focus management.

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

  const confirmClass =
    variant === "danger"
      ? "bg-red-600 hover:bg-red-700 focus-visible:ring-red-300"
      : "bg-neutral-900 hover:bg-neutral-800 focus-visible:ring-neutral-400";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-lg bg-white shadow-xl"
      >
        <div className="px-5 pt-5 pb-3">
          <h3
            id="confirm-title"
            className="text-base font-semibold text-neutral-900"
          >
            {title}
          </h3>
          {message && (
            <p className="mt-1.5 text-sm text-neutral-600">{message}</p>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-neutral-100 px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtn}
            type="button"
            onClick={onConfirm}
            className={`rounded-md px-3 py-1.5 text-sm font-medium text-white focus-visible:outline-none focus-visible:ring-2 ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// Convenience hook for the common pattern: open + callback.
// Returns a function `confirm(opts)` that resolves to true/false.
import { useState } from "react";

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
};

export function useConfirm() {
  const [state, setState] = useState<
    | (ConfirmOptions & { resolve: (ok: boolean) => void })
    | null
  >(null);

  const confirm = (opts: ConfirmOptions): Promise<boolean> =>
    new Promise((resolve) => setState({ ...opts, resolve }));

  const node = (
    <ConfirmDialog
      open={state !== null}
      title={state?.title ?? ""}
      message={state?.message}
      confirmLabel={state?.confirmLabel}
      cancelLabel={state?.cancelLabel}
      variant={state?.variant}
      onConfirm={() => {
        state?.resolve(true);
        setState(null);
      }}
      onCancel={() => {
        state?.resolve(false);
        setState(null);
      }}
    />
  );

  return { confirm, dialog: node };
}
