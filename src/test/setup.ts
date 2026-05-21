import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom + RTL: explicit cleanup between tests so previous render output
// doesn't bleed into queries on subsequent tests.
afterEach(() => {
  cleanup();
});
