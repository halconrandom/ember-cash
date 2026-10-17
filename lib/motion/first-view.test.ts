// @vitest-environment jsdom
// Tests de "solo en la primera carga" (lib/motion/first-view.ts).
import { beforeEach, describe, expect, it } from "vitest";

import { isFirstView, markSeen, resetFirstViews } from "./first-view";

beforeEach(resetFirstViews);

describe("first view", () => {
  it("una pantalla es primera vez hasta que se marca", () => {
    expect(isFirstView("/savings")).toBe(true);
    markSeen("/savings");
    expect(isFirstView("/savings")).toBe(false);
  });
  it("cada pantalla lleva su propia cuenta", () => {
    markSeen("/");
    expect(isFirstView("/")).toBe(false);
    expect(isFirstView("/debts")).toBe(true);
  });
});

describe("en el servidor", () => {
  it("siempre es primera vez (el HTML coincide con la hidratación)", async () => {
    const original = globalThis.window;
    // @ts-expect-error: se simula el servidor quitando window.
    delete globalThis.window;
    try {
      markSeen("/");
      expect(isFirstView("/")).toBe(true);
    } finally {
      globalThis.window = original;
    }
  });
});
