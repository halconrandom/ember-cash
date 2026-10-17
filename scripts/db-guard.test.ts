// Confirmación de db:push y negativa del seed de demostración.
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import { isPushConfirmed, seedRefusal } from "./db-guard.mjs";

describe("isPushConfirmed", () => {
  it("acepta solo el ref exacto", () => {
    expect(isPushConfirmed("abc123", "abc123")).toBe(true);
    expect(isPushConfirmed("  abc123  ", "abc123")).toBe(true);
    expect(isPushConfirmed("ABC123", "abc123")).toBe(false);
    expect(isPushConfirmed("", "abc123")).toBe(false);
    expect(isPushConfirmed("abc123", "")).toBe(false);
  });
});

describe("seed de demostración", () => {
  it("nombra el proyecto en el mensaje de negativa", () => {
    expect(seedRefusal("ref")).toContain("ref");
    expect(seedRefusal("ref")).toContain("desarrollo y el de producción");
  });

  it("se niega a correr contra el proyecto enlazado", () => {
    const result = spawnSync("node", ["scripts/db-seed-demo.mjs"], { encoding: "utf8" });
    expect(result.status).toBe(1);
    const output = `${result.stdout}${result.stderr}`;
    expect(output).toContain("No se carga el seed de demostración contra el proyecto enlazado");
    expect(output).toContain("desarrollo y el de producción");
  });
});
