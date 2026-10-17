// Tests del estado de presupuesto y del reparto (lib/household/budget.ts y split.ts).
import { describe, expect, it } from "vitest";

import type { Rate } from "@/lib/money/convert";
import { money } from "@/lib/money/money";

import { budgetPercent, budgetState, spentIn } from "./budget";
import { splitPercents } from "./split";

const RATE: Rate = {
  base: "USD",
  quote: "COP",
  rate: "4000",
  asOf: "2026-10-16",
  fetchedAt: "2026-10-16T13:00:00Z",
  source: "test",
};

describe("budgetPercent y budgetState (valores del frame)", () => {
  it.each([
    [2_060_000n, 2_400_000n, 86, "near"],
    [1_150_000n, 1_200_000n, 96, "near"],
    [153_860n, 150_000n, 103, "over"],
    [142_000n, 400_000n, 36, "ok"],
    [0n, 400_000n, 0, "ok"],
    [400_000n, 400_000n, 100, "near"],
    [400_001n, 400_000n, 100, "over"],
    [319_000n, 400_000n, 80, "near"],
  ] as const)("%s de %s -> %s %% (%s)", (spent, limit, percent, state) => {
    expect(budgetPercent(spent, limit)).toBe(percent);
    expect(budgetState(spent, limit)).toBe(state);
  });
});

describe("spentIn", () => {
  it("convierte los gastos en USD a COP", () => {
    expect(spentIn([money(100_000n, "COP"), money(1_000n, "USD")], "COP", RATE)).toEqual({
      total: money(140_000n, "COP"),
      partial: false,
    });
  });
  it("sin tasa omite lo que no puede convertir", () => {
    expect(spentIn([money(100_000n, "COP"), money(1_000n, "USD")], "COP", null)).toEqual({
      total: money(100_000n, "COP"),
      partial: true,
    });
  });
});

describe("splitPercents", () => {
  it("50 / 50 y 100 / 0", () => {
    expect(
      splitPercents(
        1001n,
        [
          { userId: "a", shareMinor: 501n },
          { userId: "b", shareMinor: 500n },
        ],
        ["a", "b"],
      ),
    ).toEqual([50, 50]);
    expect(splitPercents(500n, [{ userId: "a", shareMinor: 500n }], ["a", "b"])).toEqual([100, 0]);
  });
});
