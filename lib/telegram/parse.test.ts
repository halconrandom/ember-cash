// Parser determinista de los mensajes del bot (fase T1).
import { describe, expect, it } from "vitest";

import type { CurrencyCode } from "@/lib/db/types";

import { parseTelegramMessage } from "./parse";

const ENABLED = ["COP", "USD", "EUR"] as const satisfies readonly CurrencyCode[];

function parse(text: string, currency: CurrencyCode = "COP") {
  return parseTelegramMessage(text, { enabled: ENABLED, defaultCurrency: currency });
}

function parsed(text: string, currency: CurrencyCode = "COP") {
  const result = parse(text, currency);
  expect(result.ok, text).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe("parseTelegramMessage", () => {
  it("lee los cuatro ejemplos de la fase", () => {
    expect(parsed("gasté 25000 mercado")).toEqual({
      kind: "expense",
      amountMinor: 25000n,
      currency: "COP",
      categoryKey: "food",
      description: "mercado",
    });
    expect(parsed("25 usd uber")).toEqual({
      kind: "expense",
      amountMinor: 2500n,
      currency: "USD",
      categoryKey: "transport",
      description: "uber",
    });
    expect(parsed("ingreso 1.200.000 salario")).toEqual({
      kind: "income",
      amountMinor: 1200000n,
      currency: "COP",
      categoryKey: "salary",
      description: "salario",
    });
    expect(parsed("20,50 eur netflix")).toEqual({
      kind: "expense",
      amountMinor: 2050n,
      currency: "EUR",
      categoryKey: "subscriptions",
      description: "netflix",
    });
  });

  it("trata 1.200 como miles aunque la moneda tenga decimales", () => {
    expect(parsed("1.200").amountMinor).toBe(1200n);
    expect(parsed("1.200", "USD")).toMatchObject({ amountMinor: 120000n, currency: "USD" });
    expect(parsed("20.50 eur").amountMinor).toBe(2050n);
    expect(parsed("1,200.50 usd")).toMatchObject({ amountMinor: 120050n, currency: "USD" });
    expect(parsed("1.200.000,50 eur").amountMinor).toBe(120000050n);
  });

  it("rechaza decimales de más en COP y montos que no son positivos", () => {
    expect(parse("20,50 mercado")).toEqual({ ok: false, error: "too_many_decimals" });
    expect(parse("0 mercado")).toEqual({ ok: false, error: "not_positive" });
    expect(parse("0,00 eur")).toEqual({ ok: false, error: "not_positive" });
  });

  it("acepta la moneda pegada al número y rechaza una que no está activa", () => {
    expect(parsed("25usd uber")).toMatchObject({
      amountMinor: 2500n,
      currency: "USD",
      categoryKey: "transport",
    });
    expect(parse("10 ars cafe")).toEqual({ ok: false, error: "currency_disabled" });
    expect(parse("25 usd uber", "COP")).toMatchObject({ ok: true });
    expect(
      parseTelegramMessage("25000 mercado", { enabled: ["COP"], defaultCurrency: "USD" }),
    ).toEqual({ ok: false, error: "currency_disabled" });
  });

  it("distingue ingreso de gasto y no usa salario en un gasto", () => {
    expect(parsed("ingreso 5000 salario").categoryKey).toBe("salary");
    expect(parsed("5000 salario")).toMatchObject({ kind: "expense", categoryKey: "other" });
    expect(parsed("gaste 1000 supermercado").categoryKey).toBe("food");
    expect(parsed("pagué 20 usd")).toMatchObject({
      kind: "expense",
      description: "Telegram",
      currency: "USD",
    });
  });

  it("rechaza textos vacíos, dos montos o una cifra enorme", () => {
    expect(parse("   ")).toEqual({ ok: false, error: "empty" });
    expect(parse("hola mercado")).toEqual({ ok: false, error: "no_amount" });
    expect(parse("25 30 mercado")).toEqual({ ok: false, error: "invalid" });
    expect(parse(`${"9".repeat(15)} usd`)).toEqual({ ok: false, error: "too_large" });
    expect(parse("x".repeat(501))).toEqual({ ok: false, error: "invalid" });
  });
});
