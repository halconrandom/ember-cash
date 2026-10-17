// Cabeceras estáticas y CSP: sin unsafe-inline en scripts, con el hash del arranque.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { BOOT_SCRIPT, contentSecurityPolicy, securityHeaders } from "./headers";

const csp = (isDev: boolean) =>
  contentSecurityPolicy({
    nonce: "abc",
    isDev,
    supabaseUrl: "https://example.supabase.co",
  });

describe("securityHeaders", () => {
  it("incluye las cabeceras que no dependen de la petición", () => {
    const keys = securityHeaders().map((header) => header.key);
    expect(keys).toEqual([
      "X-Content-Type-Options",
      "X-Frame-Options",
      "Referrer-Policy",
      "X-DNS-Prefetch-Control",
      "Permissions-Policy",
      "Cross-Origin-Opener-Policy",
      "Cross-Origin-Resource-Policy",
      "Strict-Transport-Security",
    ]);
    expect(securityHeaders().find((header) => header.key === "X-Frame-Options")?.value).toBe(
      "DENY",
    );
  });
});

describe("contentSecurityPolicy", () => {
  it("en producción no permite inline ni eval en scripts, y sí el hash del arranque", () => {
    const policy = csp(false);
    const hash = createHash("sha256").update(BOOT_SCRIPT, "utf8").digest("base64");
    expect(policy).toContain(`'sha256-${hash}'`);
    expect(policy).toContain("'nonce-abc'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("https://example.supabase.co");
    expect(policy).toContain("wss://example.supabase.co");
    expect(policy).toContain("upgrade-insecure-requests");
    expect(policy).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(policy).not.toContain("unsafe-eval");
  });

  it("en desarrollo permite eval para el refresco de React", () => {
    const policy = csp(true);
    expect(policy).toContain("unsafe-eval");
    expect(policy).not.toContain("upgrade-insecure-requests");
  });
});
