// Tests de `cn` con la escala tipográfica propia.
import { describe, expect, it } from "vitest";

import { cn } from "./utils";

describe("cn", () => {
  it("un tamaño propio y un color no chocan", () => {
    expect(cn("text-headline", "text-ink")).toBe("text-headline text-ink");
    expect(cn("text-body text-ink-2")).toBe("text-body text-ink-2");
  });

  it("dos tamaños sí chocan: gana el último", () => {
    expect(cn("text-body", "text-callout")).toBe("text-callout");
  });

  it("dos colores sí chocan: gana el último", () => {
    expect(cn("text-ink", "text-ember-text")).toBe("text-ember-text");
  });
});
