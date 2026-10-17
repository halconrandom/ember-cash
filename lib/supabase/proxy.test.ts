// Tests de las rutas públicas del proxy.
import { describe, expect, it } from "vitest";

import { isPublicPath } from "./proxy";

describe("isPublicPath", () => {
  it("deja pasar login, auth y APIs sin sesión", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/auth/callback")).toBe(true);
    expect(isPublicPath("/api/health")).toBe(true);
  });

  it("protege el resto", () => {
    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/onboarding")).toBe(false);
    expect(isPublicPath("/invite/abc")).toBe(false);
    expect(isPublicPath("/login-falso")).toBe(false);
  });

  it("deja ver /dev solo fuera de producción", () => {
    expect(isPublicPath("/dev/design-system", "development")).toBe(true);
    expect(isPublicPath("/dev/design-system", "production")).toBe(false);
  });
});
