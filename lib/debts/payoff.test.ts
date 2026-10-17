// Tests del simulador de deudas. Los valores esperados salen de un cálculo
// de referencia independiente, hecho mes a mes (Python/Decimal, ver el
// resumen de la fase 8).
import { describe, expect, it } from "vitest";

import {
  extraSavings,
  monthlyInterest,
  monthlyRateScaled,
  simulatePayoff,
  type PayoffDebt,
} from "./payoff";

const start = "2026-10";
const debt = (
  id: string,
  balance: bigint,
  aprBps: number,
  min: bigint,
  aprKind: "EA" | "nominal" = "nominal",
): PayoffDebt => ({
  id,
  balanceMinor: balance,
  aprBps,
  aprKind,
  minPaymentMinor: min,
});

describe("tasa mensual", () => {
  it("nominal: anual / 12", () => {
    expect(monthlyRateScaled(1200, "nominal")).toBe(10_000_000_000n); // 1 % = 0,01 × 10^12
  });

  it("EA: (1 + EA)^(1/12) − 1", () => {
    // 26,82 % EA → 1,9997198806 % mensual.
    expect(monthlyRateScaled(2682, "EA")).toBe(19_997_198_806n);
    expect(monthlyInterest(1_000_000n, monthlyRateScaled(2682, "EA"))).toBe(19_997n);
  });

  it("el interés se redondea a la unidad menor, mitades lejos de cero", () => {
    expect(monthlyInterest(105_030n, monthlyRateScaled(1200, "nominal"))).toBe(1_050n); // 1.050,30
    expect(monthlyInterest(6_080n, monthlyRateScaled(1200, "nominal"))).toBe(61n); // 60,80
    expect(monthlyInterest(50n, monthlyRateScaled(1200, "nominal"))).toBe(1n); // 0,50 → 1
  });
});

describe("una deuda", () => {
  it("al 0 %: 1.000.000 con mínimo 100.000 se paga en 10 meses sin interés", () => {
    const r = simulatePayoff({
      debts: [debt("a", 1_000_000n, 0, 100_000n)],
      method: "avalanche",
      startMonth: start,
    });
    expect(r).toMatchObject({ ok: true, months: 10, totalInterest: 0n, debtFreeMonth: "2027-08" });
  });

  it("con interés: 300.000 al 12 % nominal pagando 100.000", () => {
    const r = simulatePayoff({
      debts: [debt("a", 300_000n, 1200, 100_000n)],
      method: "avalanche",
      startMonth: start,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Mes a mes: 203.000 → 105.030 → 6.080 → 0; intereses 3.000 + 2.030 + 1.050 + 61.
    expect(r.series.map((p) => p.totalBalance)).toEqual([203_000n, 105_030n, 6_080n, 0n]);
    expect(r.series.map((p) => p.interest)).toEqual([3_000n, 2_030n, 1_050n, 61n]);
    expect(r.totalInterest).toBe(6_141n);
    expect(r.months).toBe(4);
    expect(r.debtFreeMonth).toBe("2027-02");
  });

  it("en USD (centavos): US$ 1.000,00 al 18 % pagando US$ 100,00", () => {
    const r = simulatePayoff({
      debts: [debt("a", 100_000n, 1800, 10_000n)],
      method: "avalanche",
      startMonth: start,
    });
    expect(r).toMatchObject({ ok: true, months: 11, totalInterest: 9_162n });
  });
});

describe("dos deudas", () => {
  // A: 100.000 al 24 % nominal (2 %/mes), mínimo 10.000.
  // B:  50.000 al 12 % nominal (1 %/mes), mínimo 10.000. Extra 20.000.
  const two = [debt("A", 100_000n, 2400, 10_000n), debt("B", 50_000n, 1200, 10_000n)];

  it("avalanche: el extra va a A (mayor tasa)", () => {
    const r = simulatePayoff({
      debts: two,
      method: "avalanche",
      extraMinor: 20_000n,
      startMonth: start,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.series.map((p) => [p.balances.A, p.balances.B])).toEqual([
      [72_000n, 40_500n],
      [43_440n, 30_905n],
      [14_309n, 21_214n],
      [0n, 0n],
    ]);
    expect(r.totalInterest).toBe(6_021n);
    expect(r.months).toBe(4);
  });

  it("snowball: el extra va a B (menor saldo) y su mínimo pasa a A", () => {
    const r = simulatePayoff({
      debts: two,
      method: "snowball",
      extraMinor: 20_000n,
      startMonth: start,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.series.map((p) => [p.balances.A, p.balances.B])).toEqual([
      [92_000n, 20_500n],
      [74_545n, 0n],
      [36_036n, 0n],
      [0n, 0n],
    ]);
    expect(r.totalInterest).toBe(6_757n);
    expect(r.debts.map((d) => [d.id, d.months])).toEqual([
      ["B", 2],
      ["A", 4],
    ]);
  });

  it("avalanche nunca paga más interés que snowball", () => {
    const a = simulatePayoff({
      debts: two,
      method: "avalanche",
      extraMinor: 20_000n,
      startMonth: start,
    });
    const s = simulatePayoff({
      debts: two,
      method: "snowball",
      extraMinor: 20_000n,
      startMonth: start,
    });
    expect(a.ok && s.ok && a.totalInterest <= s.totalInterest).toBe(true);
  });

  it("pago extra: 9 → 4 meses y 12.397 → 6.021 de interés (ahorra 5 meses y 6.376)", () => {
    expect(simulatePayoff({ debts: two, method: "avalanche", startMonth: start })).toMatchObject({
      ok: true,
      months: 9,
      totalInterest: 12_397n,
    });
    expect(extraSavings({ debts: two, method: "avalanche", startMonth: start }, 20_000n)).toEqual({
      months: 5,
      interest: 6_376n,
    });
  });
});

describe("casos borde", () => {
  it("pago menor que el interés: avisa que nunca se paga y no entra en bucle", () => {
    // 1.000.000 al 36 % nominal = 30.000 de interés al mes; mínimo 20.000.
    const r = simulatePayoff({
      debts: [debt("a", 1_000_000n, 3600, 20_000n)],
      method: "avalanche",
      startMonth: start,
    });
    expect(r).toEqual({ ok: false, reason: "neverPaysOff", months: 1, totalInterest: 30_000n });
  });

  it("pago igual al interés tampoco termina", () => {
    const r = simulatePayoff({
      debts: [debt("a", 1_000_000n, 1200, 10_000n)],
      method: "snowball",
      startMonth: start,
    });
    expect(r.ok).toBe(false);
  });

  it("sin deudas: libre desde ya", () => {
    expect(simulatePayoff({ debts: [], method: "avalanche", startMonth: start })).toMatchObject({
      ok: true,
      months: 0,
      debtFreeMonth: start,
    });
  });

  it("deuda al 0 % sin mínimo ni extra: nunca se paga", () => {
    expect(
      simulatePayoff({ debts: [debt("a", 500n, 0, 0n)], method: "avalanche", startMonth: start })
        .ok,
    ).toBe(false);
  });

  it("el tope de meses corta simulaciones larguísimas", () => {
    // Al 0 % con mínimo 1 el saldo sí baja, pero tardaría un millón de meses.
    const r = simulatePayoff({
      debts: [debt("a", 1_000_000n, 0, 1n)],
      method: "avalanche",
      startMonth: start,
      maxMonths: 24,
    });
    expect(r).toMatchObject({ ok: false, reason: "neverPaysOff", months: 24 });
  });

  it("extraSavings es null si el plan base nunca termina", () => {
    expect(
      extraSavings(
        { debts: [debt("a", 1_000_000n, 3600, 20_000n)], method: "avalanche", startMonth: start },
        5_000n,
      ),
    ).toBeNull();
  });
});
