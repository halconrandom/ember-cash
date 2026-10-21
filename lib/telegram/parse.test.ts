// Parser determinista de los mensajes del bot (fase T1).
import { describe, expect, it } from "vitest";

import type { CurrencyCode } from "@/lib/db/types";

import { parseSubscriptionCommand, parseTelegramMessage } from "./parse";

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

  it("con forcedKind no adivina el tipo por palabras clave", () => {
    // /ingreso fuerza income aunque la palabra sea de categoría de gasto ("salario" sin pista).
    expect(
      parseTelegramMessage(
        "25000 salario",
        { enabled: ENABLED, defaultCurrency: "COP" },
        "income",
      ),
    ).toMatchObject({ ok: true, value: { kind: "income", categoryKey: "salary" } });
    // /gasto ignora que el texto diga "ingreso": no se trata como palabra clave.
    expect(
      parseTelegramMessage(
        "ingreso 5000 mercado",
        { enabled: ENABLED, defaultCurrency: "COP" },
        "expense",
      ),
    ).toMatchObject({ ok: true, value: { kind: "expense", description: "ingreso mercado" } });
  });
});

function sub(text: string, currency: CurrencyCode = "COP") {
  return parseSubscriptionCommand(text, { enabled: ENABLED, defaultCurrency: currency });
}

describe("parseSubscriptionCommand", () => {
  it("lee monto, moneda, nombre, frecuencia y día", () => {
    expect(sub("44900 cop Netflix mensual 15")).toEqual({
      ok: true,
      value: {
        name: "Netflix",
        amountMinor: 44900n,
        currency: "COP",
        frequency: "monthly",
        dayOfMonth: 15,
      },
    });
  });

  it("por defecto es mensual y sin día (próximo cobro hoy)", () => {
    expect(sub("50000 Spotify")).toEqual({
      ok: true,
      value: {
        name: "Spotify",
        amountMinor: 50000n,
        currency: "COP",
        frequency: "monthly",
        dayOfMonth: null,
      },
    });
  });

  it("acepta semanal y anual sin día", () => {
    expect(sub("10 usd Revista semanal")).toMatchObject({
      ok: true,
      value: { frequency: "weekly", dayOfMonth: null },
    });
    expect(sub("10 usd Revista anual")).toMatchObject({
      ok: true,
      value: { frequency: "yearly", dayOfMonth: null },
    });
  });

  it("rechaza el día con una frecuencia que no es mensual", () => {
    expect(sub("10 usd Revista anual 15")).toEqual({ ok: false, error: "day_only_monthly" });
    expect(sub("10 usd Revista semanal 3")).toEqual({ ok: false, error: "day_only_monthly" });
  });

  it("rechaza un día fuera de 1-31, sin nombre o sin monto", () => {
    expect(sub("10 usd Revista mensual 32")).toEqual({ ok: false, error: "invalid_day" });
    expect(sub("10 usd mensual 15")).toEqual({ ok: false, error: "name_required" });
    expect(sub("Netflix mensual 15")).toEqual({ ok: false, error: "no_amount" });
  });

  it("rechaza una moneda que no está activa", () => {
    expect(sub("10 ars Netflix")).toEqual({ ok: false, error: "currency_disabled" });
  });
});
