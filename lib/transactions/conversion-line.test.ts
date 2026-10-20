// Tests de resolveConversionLine: los 4 casos del modal de transacción (fase E2 §3).
import { describe, expect, it } from "vitest";

import type { Rate } from "@/lib/money/convert";
import { money } from "@/lib/money/money";

import { resolveConversionLine } from "./conversion-line";

const USD_COP: Rate = {
  base: "USD",
  quote: "COP",
  rate: "4000",
  asOf: "2026-10-16",
  fetchedAt: new Date().toISOString(),
  source: "test",
};

describe("resolveConversionLine", () => {
  it("misma moneda: línea neutra, sin tasa", () => {
    expect(
      resolveConversionLine({
        amountEmpty: false,
        amount: money(1000n, "COP"),
        currency: "COP",
        displayCurrency: "COP",
        rates: [USD_COP],
      }),
    ).toEqual({ kind: "same" });
  });

  it("distinta moneda con monto: convierte con la tasa", () => {
    expect(
      resolveConversionLine({
        amountEmpty: false,
        amount: money(1599n, "USD"),
        currency: "USD",
        displayCurrency: "COP",
        rates: [USD_COP],
      }),
    ).toEqual({ kind: "amount", value: money(63960n, "COP"), rate: USD_COP });
  });

  it("tasa faltante: nunca inventa un número", () => {
    expect(
      resolveConversionLine({
        amountEmpty: false,
        amount: money(1599n, "USD"),
        currency: "USD",
        displayCurrency: "COP",
        rates: [],
      }),
    ).toEqual({ kind: "unavailable" });
  });

  it("campo vacío: la tasa sola, nunca '≈ 0'", () => {
    expect(
      resolveConversionLine({
        amountEmpty: true,
        amount: money(0n, "USD"),
        currency: "USD",
        displayCurrency: "COP",
        rates: [USD_COP],
      }),
    ).toEqual({ kind: "rateOnly", rate: USD_COP });
  });
});
