// Cabeceras estáticas y CSP (sin nonce, compatible con el prerender de Next).
import { describe, expect, it } from "vitest";

import { contentSecurityPolicy, securityHeaders } from "./headers";

const csp = (isDev: boolean) =>
  contentSecurityPolicy({
    isDev,
    supabaseUrl: "https://example.supabase.co",
  });

/** La directiva script-src sola. */
const scriptSrc = (policy: string) =>
  policy.split("; ").find((d) => d.startsWith("script-src ")) ?? "";

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
  it("en producción: scripts propios y en línea, sin eval, y el resto cerrado", () => {
    const policy = csp(false);
    expect(scriptSrc(policy)).toBe("script-src 'self' 'unsafe-inline'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'self'");
    expect(policy).toContain("form-action 'self'");
    expect(policy).toContain("https://example.supabase.co");
    expect(policy).toContain("wss://example.supabase.co");
    expect(policy).toContain("upgrade-insecure-requests");
    expect(policy).not.toContain("unsafe-eval");
  });

  it("script-src no lleva nonce, hash ni strict-dynamic (bloquearían el esqueleto prerenderizado)", () => {
    // Con cualquiera de ellos el navegador ignora 'unsafe-inline' (o 'self'),
    // los <script> del esqueleto de cacheComponents quedan bloqueados, React
    // no hidrata y los botones no responden (bug de 0.14.1 en el login).
    for (const isDev of [false, true]) {
      const directive = scriptSrc(csp(isDev));
      expect(directive).not.toContain("nonce-");
      expect(directive).not.toContain("sha256-");
      expect(directive).not.toContain("strict-dynamic");
    }
  });

  it("en desarrollo permite eval para el refresco de React", () => {
    const policy = csp(true);
    expect(policy).toContain("unsafe-eval");
    expect(policy).not.toContain("upgrade-insecure-requests");
  });
});
