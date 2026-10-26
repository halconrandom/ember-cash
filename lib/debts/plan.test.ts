import { describe, expect, it } from "vitest";

import { extraSavings, simulatePayoff } from "./payoff";
import { axisTicks, MAX_TICKS, planInput, type PlanCandidate } from "./plan";

const start = "2026-10";
const d = (
  id: string,
  balance: bigint,
  aprBps: number,
  min: bigint,
  excludeFromPlan = false,
): PlanCandidate => ({
  id,
  balanceMinor: balance,
  aprBps,
  aprKind: "EA",
  minPaymentMinor: min,
  excludeFromPlan,
});
// Tugo (corta) y una hipoteca a ~20 años.
const tugo = d("tugo", 2_849_990n, 1770, 196_082n);
const card = d("card", 1_000_000n, 2800, 80_000n);
const house = (excluded: boolean) => d("house", 180_000_000n, 1200, 1_900_000n, excluded);

describe("planInput: deudas fuera del plan", () => {
  for (const method of ["avalanche", "snowball"] as const) {
    it(`${method}: la excluida no entra en la simulación ni en la fecha libre`, () => {
      const withHouse = simulatePayoff(planInput([tugo, card, house(false)], method, start));
      const without = simulatePayoff(planInput([tugo, card, house(true)], method, start));
      const only = simulatePayoff(planInput([tugo, card], method, start));
      expect(withHouse.ok && without.ok && only.ok).toBe(true);
      if (!withHouse.ok || !without.ok || !only.ok) return;
      expect(without.debts.map((x) => x.id)).not.toContain("house");
      expect(without).toEqual(only);
      expect(without.debtFreeMonth < withHouse.debtFreeMonth).toBe(true);
      expect(withHouse.debtFreeMonth >= "2040-01").toBe(true);
    });
  }

  it("el pago extra simula solo las deudas del plan", () => {
    const a = extraSavings(planInput([tugo, card, house(true)], "avalanche", start), 100_000n);
    const b = extraSavings(planInput([tugo, card], "avalanche", start), 100_000n);
    expect(a).toEqual(b);
    expect(a && a.months > 0).toBe(true);
  });

  it("todas excluidas: entrada vacía", () => {
    expect(planInput([house(true)], "snowball", start).debts).toEqual([]);
  });
});

describe("axisTicks", () => {
  const check = (months: number) => {
    const axis = axisTicks(months);
    expect(axis.ticks.length).toBeLessThanOrEqual(MAX_TICKS);
    expect(axis.ticks[0]).toBe(0);
    expect(axis.ticks.at(-1)).toBe(axis.axisMonths);
    expect(axis.axisMonths).toBeGreaterThanOrEqual(months);
    return axis;
  };

  it("1 año: cada trimestre", () => {
    expect(check(10)).toMatchObject({ step: 3, axisMonths: 12, yearly: false });
    expect(check(12).ticks).toEqual([0, 3, 6, 9, 12]);
  });

  it("5 años: cada 2 años, solo el año", () => {
    expect(check(58)).toMatchObject({ step: 24, axisMonths: 72, yearly: true });
  });

  it("20 años: cada 5 años", () => {
    expect(check(224)).toMatchObject({ step: 60, axisMonths: 240, yearly: true });
  });

  it("rangos largos y cortos nunca pasan de MAX_TICKS", () => {
    for (const m of [0, 1, 13, 25, 37, 100, 361, 720, 1200]) check(m);
  });
});
