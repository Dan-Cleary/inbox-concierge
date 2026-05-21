import { useState } from "react";
import ConfirmDialog from "./ConfirmDialog";

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
};

// Imperative confirm pattern: callers `const { confirm, dialog } = useConfirm();`
// then `await confirm({ title, ... })` returns true/false. Render `{dialog}`
// somewhere in the tree so the modal can mount.
export function useConfirm() {
  const [state, setState] = useState<
    | (ConfirmOptions & { resolve: (ok: boolean) => void })
    | null
  >(null);

  const confirm = (opts: ConfirmOptions): Promise<boolean> =>
    new Promise((resolve) => setState({ ...opts, resolve }));

  const dialog = (
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

  return { confirm, dialog };
}
