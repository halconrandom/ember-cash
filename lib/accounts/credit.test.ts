import { describe, expect, it } from "vitest";

import {
  creditAvailability,
  creditColumns,
  openingFor,
  parsePaymentDay,
  validateCreditForm,
} from "./credit";

describe("validateCreditForm", () => {
  it("tarjeta del Banco de Bogotá: cupo, día y saldo", () => {
    expect(
      validateCreditForm({ limit: "4.700.000", payDay: "21", balance: "4.167.943" }, "COP", "es"),
    ).toEqual({
      ok: true,
      value: { creditLimitMinor: 4_700_000, paymentDay: 21, balanceMinor: 4_167_943 },
    });
  });

  it("todo vacío es válido (Ajustes permite completar después)", () => {
    expect(validateCreditForm({ limit: "", payDay: " ", balance: "" }, "COP", "es")).toEqual({
      ok: true,
      value: { creditLimitMinor: null, paymentDay: null, balanceMinor: null },
    });
  });

  it("mismos errores del wizard", () => {
    expect(validateCreditForm({ limit: "0", payDay: "32", balance: "abc" }, "COP", "es")).toEqual({
      ok: false,
      fields: {
        limit: "onboarding.account.errors.limit",
        payDay: "onboarding.account.errors.payDay",
        balance: "onboarding.account.errors.balance",
      },
    });
  });

  it("saldo 0 es válido (tarjeta al día)", () => {
    expect(validateCreditForm({ limit: "", payDay: "", balance: "0" }, "COP", "es")).toMatchObject({
      ok: true,
      value: { balanceMinor: 0 },
    });
  });
});

describe("parsePaymentDay / creditColumns", () => {
  it("1 a 31", () => {
    expect(parsePaymentDay("21")).toBe(21);
    expect(parsePaymentDay("0")).toBeNull();
    expect(parsePaymentDay("1.5")).toBeNull();
  });
  it("otro tipo con cupo se rechaza", () => {
    expect(creditColumns("checking", 100, null)).toBeNull();
    expect(creditColumns("credit_card", 100, 21)).toEqual({
      credit_limit_minor: 100,
      payment_day: 21,
    });
  });
});

describe("openingFor (un único saldo inicial)", () => {
  it("al crear: el opening es la deuda de hoy", () => {
    expect(openingFor(4_167_943, 0, 0)).toBe(4_167_943);
  });

  it("al editar descuenta los movimientos y reemplaza el opening viejo", () => {
    // Opening 1.000.000 + gastos 200.000 = deuda 1.200.000. Hoy debe 1.500.000.
    expect(openingFor(1_500_000, 1_200_000, 1_000_000)).toBe(1_300_000);
  });

  it("es idempotente: repetir el mismo saldo da el mismo opening", () => {
    const first = openingFor(1_500_000, 1_200_000, 1_000_000)!;
    // Tras guardar, la deuda ya es 1.500.000 con el opening nuevo.
    expect(openingFor(1_500_000, 1_500_000, first)).toBe(first);
  });

  it("saldo igual a los movimientos: sin opening; menor: no se puede", () => {
    expect(openingFor(200_000, 1_200_000, 1_000_000)).toBe(0);
    expect(openingFor(100_000, 1_200_000, 1_000_000)).toBeNull();
  });
});

describe("creditAvailability", () => {
  it("cupo − deuda y % usado", () => {
    expect(creditAvailability(4_700_000, 4_167_943)).toEqual({
      availableMinor: 532_057,
      usedPercent: 89,
    });
  });
  it("sobregiro: disponible 0, uso 100; saldo a favor: todo disponible", () => {
    expect(creditAvailability(1_000, 1_500)).toEqual({ availableMinor: 0, usedPercent: 100 });
    expect(creditAvailability(1_000, -50)).toEqual({ availableMinor: 1_000, usedPercent: 0 });
  });
});
