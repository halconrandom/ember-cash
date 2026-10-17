// Tests de safeNextPath: solo se aceptan rutas internas.
import { describe, expect, it } from "vitest";

import { safeNextPath } from "./redirect";

describe("safeNextPath", () => {
  it("acepta rutas internas", () => {
    expect(safeNextPath("/onboarding")).toBe("/onboarding");
    expect(safeNextPath("/invite/abc?x=1")).toBe("/invite/abc?x=1");
  });

  it("usa el valor por defecto si no hay next", () => {
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath("", "/onboarding")).toBe("/onboarding");
  });

  it("rechaza URLs externas y trucos", () => {
    expect(safeNextPath("https://malo.com")).toBe("/");
    expect(safeNextPath("//malo.com")).toBe("/");
    expect(safeNextPath("/\\malo.com")).toBe("/");
    expect(safeNextPath("javascript:alert(1)")).toBe("/");
  });
});
