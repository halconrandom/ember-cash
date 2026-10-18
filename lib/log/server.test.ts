// Registro de errores del servidor sin datos personales ni secretos (fase 2).
import { afterEach, describe, expect, it, vi } from "vitest";

import { logServerError, scrubMessage, summarizeError } from "./server";

afterEach(() => vi.restoreAllMocks());

describe("scrubMessage", () => {
  it("quita JWT, correos, tokens en URLs y números largos (montos, ids)", () => {
    const jwt = ["eyJhbGciOiJIUzI1NiJ9", "eyJyb2xlIjoiYW5vbiJ9", "firma"].join(".");
    const out = scrubMessage(
      `token ${jwt} de ana@correo.com en /rest/v1/x?access_token=abc123 monto 1800000`,
    );
    expect(out).not.toContain(jwt);
    expect(out).not.toContain("ana@correo.com");
    expect(out).not.toContain("abc123");
    expect(out).not.toContain("1800000");
  });

  it("recorta mensajes largos", () => {
    expect(scrubMessage("x".repeat(1000)).length).toBeLessThanOrEqual(200);
  });
});

describe("summarizeError", () => {
  it("de un error de PostgREST guarda código y mensaje, nunca details ni hint", () => {
    const pgError = {
      code: "23505",
      message: "duplicate key value violates unique constraint",
      details: "Key (owner_id, amount_minor)=(abc, 1800000) already exists.",
      hint: "ana@correo.com",
    };
    const summary = summarizeError("budgets", pgError);
    expect(summary).toEqual({
      context: "budgets",
      name: "object",
      code: "23505",
      message: "duplicate key value violates unique constraint",
    });
    expect(JSON.stringify(summary)).not.toContain("1800000");
  });

  it("de un Error normal guarda nombre y mensaje limpio", () => {
    expect(summarizeError("x", new TypeError("falló 123456"))).toEqual({
      context: "x",
      name: "TypeError",
      message: "falló [n]",
    });
  });
});

describe("logServerError", () => {
  it("escribe una sola línea JSON sin el objeto original", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logServerError("export", { message: "falló", details: "monto 999999" });
    const printed = spy.mock.calls.flat().join(" ");
    expect(printed).toContain('"context":"export"');
    expect(printed).not.toContain("999999");
  });
});
