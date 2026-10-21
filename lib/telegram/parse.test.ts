// Parser determinista de los mensajes del bot (fase T1).
import { describe, expect, it } from "vitest";

import type { CurrencyCode } from "@/lib/db/types";

import {
  parseDebtCommand,
  parseGoalAmountReply,
  parsePlainAmount,
  parseSubscriptionCommand,
  parseTelegramMessage,
} from "./parse";

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

function debt(text: string, currency: CurrencyCode = "COP") {
  return parseDebtCommand(text, { enabled: ENABLED, defaultCurrency: currency });
}

describe("parseDebtCommand", () => {
  it("lee monto, moneda y con quién o qué; por defecto es 'debo'", () => {
    expect(debt("500000 cop Juan")).toEqual({
      ok: true,
      value: { name: "Juan", amountMinor: 500000n, currency: "COP", direction: "owed_by_me" },
    });
    expect(debt("50 usd el carro de Ana")).toMatchObject({
      ok: true,
      value: { name: "el carro de Ana", currency: "USD", direction: "owed_by_me" },
    });
  });

  it("reconoce 'debo' explícito y 'me deben' sin meterlos en el nombre", () => {
    expect(debt("500000 Juan debo")).toEqual({
      ok: true,
      value: { name: "Juan", amountMinor: 500000n, currency: "COP", direction: "owed_by_me" },
    });
    expect(debt("500000 Juan me deben")).toEqual({
      ok: true,
      value: { name: "Juan", amountMinor: 500000n, currency: "COP", direction: "owed_to_me" },
    });
  });

  it("rechaza sin monto, sin nombre o una moneda que no está activa", () => {
    expect(debt("Juan debo")).toEqual({ ok: false, error: "no_amount" });
    expect(debt("500000 debo")).toEqual({ ok: false, error: "name_required" });
    expect(debt("10 ars Juan")).toEqual({ ok: false, error: "currency_disabled" });
  });
});

describe("parsePlainAmount", () => {
  it("lee un solo número, sin moneda", () => {
    expect(parsePlainAmount("100000", 0)).toEqual({ ok: true, value: 100000n });
    expect(parsePlainAmount("  1.200,50  ", 2)).toEqual({ ok: true, value: 120050n });
  });

  it("rechaza texto vacío, más de un token o algo que no es un monto", () => {
    expect(parsePlainAmount("", 0)).toEqual({ ok: false, error: "empty" });
    expect(parsePlainAmount("100000 cop", 0)).toEqual({ ok: false, error: "invalid" });
    expect(parsePlainAmount("mucho", 0)).toEqual({ ok: false, error: "invalid" });
    expect(parsePlainAmount("0", 0)).toEqual({ ok: false, error: "not_positive" });
  });
});

function goalReply(text: string, currency: CurrencyCode = "USD") {
  return parseGoalAmountReply(text, { enabled: ENABLED, defaultCurrency: currency });
}

describe("parseGoalAmountReply", () => {
  it("sin moneda usa la de la meta (defaultCurrency)", () => {
    expect(goalReply("50")).toEqual({ ok: true, value: { amountMinor: 5000n, currency: "USD" } });
  });

  it("con otra moneda la devuelve, para que quien llama convierta", () => {
    expect(goalReply("40000 cop")).toEqual({
      ok: true,
      value: { amountMinor: 40000n, currency: "COP" },
    });
  });

  it("rechaza sin monto o una moneda que no está activa", () => {
    expect(goalReply("")).toEqual({ ok: false, error: "empty" });
    expect(goalReply("hola")).toEqual({ ok: false, error: "no_amount" });
    expect(goalReply("10 ars")).toEqual({ ok: false, error: "currency_disabled" });
  });
});
