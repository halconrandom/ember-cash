// La política y public/sw.js tienen que decir lo mismo: nada de datos
// financieros en la caché.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { cacheDecision, STATIC_CACHE } from "./cache-policy";

const origin = "https://ember.test";

function decide(path: string, extra: Partial<Parameters<typeof cacheDecision>[0]> = {}) {
  return cacheDecision({
    method: "GET",
    url: `${origin}${path}`,
    sameOrigin: true,
    ...extra,
  });
}

describe("cacheDecision", () => {
  it("guarda solo estáticos conocidos", () => {
    for (const path of [
      "/_next/static/chunks/app.js",
      "/icons/icon-192.png",
      "/offline.html",
      "/manifest.webmanifest",
      "/favicon.ico",
      "/icon.svg",
    ]) {
      expect(decide(path)).toEqual({ action: "cache-first", cache: STATIC_CACHE });
    }
  });

  it("no guarda datos, RSC, API, auth ni otro origen", () => {
    expect(decide("/")).toEqual({ action: "bypass" });
    expect(decide("/transactions")).toEqual({ action: "bypass" });
    expect(decide("/", { mode: "navigate" })).toEqual({ action: "navigate" });
    expect(decide("/api/health")).toEqual({ action: "bypass" });
    expect(decide("/auth/callback")).toEqual({ action: "bypass" });
    expect(decide("/_next/static/chunks/app.js", { rsc: true })).toEqual({ action: "bypass" });
    expect(decide("/icons/icon-192.png", { prefetch: true })).toEqual({ action: "bypass" });
    expect(decide("/icons/icon-192.png", { method: "POST" })).toEqual({ action: "bypass" });
    expect(
      cacheDecision({
        method: "GET",
        url: "https://proyecto.supabase.co/rest/v1/transactions",
        sameOrigin: false,
      }),
    ).toEqual({ action: "bypass" });
  });
});

describe("public/sw.js", () => {
  const source = readFileSync("public/sw.js", "utf8");

  it("repite los candados y no hace cache.put de /api ni de _rsc", () => {
    expect(source).toContain("/api/");
    expect(source).toContain("_rsc");
    expect(source).toContain("Supabase");
    expect(source).toContain("/offline.html");
    expect(source).not.toMatch(/cache\.put\([\s\S]{0,80}\/api\//);
    expect(source).not.toMatch(/cache\.put\([\s\S]{0,40}_rsc/);
  });
});
