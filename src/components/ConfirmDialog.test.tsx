import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ConfirmDialog from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  it("renders nothing when closed", () => {
    render(
      <ConfirmDialog
        open={false}
        title="Delete?"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders title + message when open", () => {
    render(
      <ConfirmDialog
        open
        title="Delete label?"
        message="This will re-sort affected emails."
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/Delete label\?/)).toBeInTheDocument();
    expect(
      screen.getByText(/This will re-sort affected emails/),
    ).toBeInTheDocument();
  });

  it("fires onConfirm when the confirm button is clicked", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Delete?"
        confirmLabel="Delete"
        onConfirm={onConfirm}
        onCancel={() => {}}
        variant="danger"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Delete/ }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("fires onCancel when the cancel button is clicked", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Delete?"
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Cancel/ }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("fires onCancel on Escape key (keyboard dismissal)", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Delete?"
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("fires onCancel when the backdrop is clicked", () => {
    const onCancel = vi.fn();
    const { container } = render(
      <ConfirmDialog
        open
        title="Delete?"
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    );
    // The backdrop is the outermost element with the onClick handler.
    // It's the first child of container.
    const backdrop = container.firstChild as HTMLElement;
    fireEvent.click(backdrop);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire onCancel when the dialog card itself is clicked (event bubble guard)", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Delete?"
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole("dialog"));
    // stopPropagation on the dialog stops the backdrop's onClick from firing
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("uses custom confirm/cancel labels when provided", () => {
    render(
      <ConfirmDialog
        open
        title="Pending changes"
        confirmLabel="Apply"
        cancelLabel="Discard"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(
      screen.getByRole("button", { name: /Apply/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Discard/ }),
    ).toBeInTheDocument();
  });
});
