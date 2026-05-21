import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Select from "./Select";

const opts = [
  { value: "a", label: "Apple" },
  { value: "b", label: "Banana" },
  { value: "c", label: "Cherry" },
];

describe("Select", () => {
  it("shows the current option's label in the trigger", () => {
    render(
      <Select value="b" options={opts} onChange={() => {}} />,
    );
    // Trigger is a button — query by name
    expect(
      screen.getByRole("button", { name: /Banana/ }),
    ).toBeInTheDocument();
  });

  it("does not show the listbox until clicked", () => {
    render(<Select value="a" options={opts} onChange={() => {}} />);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("opens the listbox on trigger click", () => {
    render(<Select value="a" options={opts} onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Apple/ }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    // All options should now be rendered
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  it("fires onChange and closes when an option is selected", () => {
    const onChange = vi.fn();
    render(<Select value="a" options={opts} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Apple/ }));
    fireEvent.click(screen.getByRole("option", { name: /Cherry/ }));
    expect(onChange).toHaveBeenCalledWith("c");
    // Listbox should close after selection
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("closes on Escape without firing onChange", () => {
    const onChange = vi.fn();
    render(<Select value="a" options={opts} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Apple/ }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("marks the current option aria-selected=true", () => {
    render(<Select value="b" options={opts} onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Banana/ }));
    const banana = screen.getByRole("option", { name: /Banana/ });
    expect(banana).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("option", { name: /Apple/ }),
    ).toHaveAttribute("aria-selected", "false");
  });

  it("ignores clicks when disabled", () => {
    render(
      <Select value="a" options={opts} onChange={() => {}} disabled />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Apple/ }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("shows placeholder when value doesn't match any option", () => {
    render(
      <Select
        value="missing"
        options={opts}
        onChange={() => {}}
        placeholder="Pick one…"
      />,
    );
    expect(
      screen.getByRole("button", { name: /Pick one/ }),
    ).toBeInTheDocument();
  });
});
