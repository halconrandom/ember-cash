// Tests de los agregados del dashboard (lib/dashboard/aggregate.ts).
import { describe, expect, it } from "vitest";

import type { Rate } from "@/lib/money/convert";
import { money } from "@/lib/money/money";

import {
  lastMonths,
  monthTotals,
  niceMax,
  percentChange,
  spendingByCategory,
  trend,
  type AggregateRow,
} from "./aggregate";

const RATE: Rate = {
  base: "USD",
  quote: "COP",
  rate: "4000",
  asOf: "2026-10-16",
  fetchedAt: "2026-10-16T13:00:00Z",
  source: "test",
};

const row = (
  month: string,
  kind: AggregateRow["kind"],
  categoryKey: AggregateRow["categoryKey"],
  minor: bigint,
  currency: "COP" | "USD" = "COP",
  count = 1,
): AggregateRow => ({
  month,
  kind,
  categoryKey,
  amount: money(minor, currency),
  count,
});

// Octubre: ingresos 8.800.000 COP + US$ 100,00; gastos 2.100.000 COP vivienda,
// US$ 15,99 + 400.000 COP suscripciones, 1.150.000 COP comida.
const ROWS: AggregateRow[] = [
  row("2026-10", "income", "salary", 8_800_000n, "COP", 1),
  row("2026-10", "income", "other_income", 10_000n, "USD", 1),
  row("2026-10", "expense", "housing", 2_100_000n, "COP", 2),
  row("2026-10", "expense", "subscriptions", 1_599n, "USD", 1),
  row("2026-10", "expense", "subscriptions", 400_000n, "COP", 3),
  row("2026-10", "expense", "food", 1_150_000n, "COP", 4),
  row("2026-09", "income", "salary", 8_000_000n, "COP"),
  row("2026-09", "expense", "food", 6_000_000n, "COP"),
];

describe("monthTotals con COP y USD mezclados", () => {
  it("en COP: el USD se convierte una vez por moneda", () => {
    const t = monthTotals(ROWS, "2026-10", "COP", [RATE]);
    expect(t.income).toEqual(money(9_200_000n, "COP")); // 8.800.000 + 100 × 4.000
    expect(t.expenses).toEqual(money(3_713_960n, "COP")); // 2.100.000 + 63.960 + 400.000 + 1.150.000
    expect(t.balance).toEqual(money(5_486_040n, "COP"));
    expect(t.count).toBe(12);
    expect(t.partial).toBe(false);
  });

  it("en USD", () => {
    const t = monthTotals(ROWS, "2026-10", "USD", [RATE]);
    expect(t.income).toEqual(money(230_000n, "USD")); // 2.200,00 + 100,00
    // 3.650.000 COP = US$ 912,50; + 15,99 = 928,49.
    expect(t.expenses).toEqual(money(92_849n, "USD"));
  });

  it("sin tasa: solo lo de la moneda elegida, marcado partial", () => {
    const t = monthTotals(ROWS, "2026-10", "COP", []);
    expect(t.income).toEqual(money(8_800_000n, "COP"));
    expect(t.partial).toBe(true);
  });
});

describe("mes sin datos", () => {
  it("todo en cero, sin categorías", () => {
    const t = monthTotals(ROWS, "2026-03", "COP", [RATE]);
    expect(t).toEqual({
      income: money(0n, "COP"),
      expenses: money(0n, "COP"),
      balance: money(0n, "COP"),
      count: 0,
      partial: false,
    });
    expect(spendingByCategory(ROWS, "2026-03", "COP", [RATE])).toEqual({
      slices: [],
      total: money(0n, "COP"),
      partial: false,
    });
  });
});

describe("percentChange", () => {
  it("contra un mes anterior vacío no divide por cero: null", () => {
    const empty = monthTotals(ROWS, "2026-08", "COP", [RATE]);
    expect(percentChange(money(9_200_000n, "COP"), empty.income)).toBeNull();
    expect(percentChange(money(0n, "COP"), empty.balance)).toBeNull();
  });
  it("ingresos +15 % y gastos −38,1 % contra septiembre", () => {
    const oct = monthTotals(ROWS, "2026-10", "COP", [RATE]);
    const sep = monthTotals(ROWS, "2026-09", "COP", [RATE]);
    expect(percentChange(oct.income, sep.income)).toBe(15);
    expect(percentChange(oct.expenses, sep.expenses)).toBe(-38.1);
  });
  it("con un balance anterior negativo usa su valor absoluto", () => {
    // De −1.000.000 a 500.000: subió 150 %.
    expect(percentChange(money(500_000n, "COP"), money(-1_000_000n, "COP"))).toBe(150);
    // De 2.000.000 a −1.000.000: bajó 150 %.
    expect(percentChange(money(-1_000_000n, "COP"), money(2_000_000n, "COP"))).toBe(-150);
  });
  it("el frame: 3.360.000 contra 2.837.838 = +18,4 %", () => {
    expect(percentChange(money(3_360_000n, "COP"), money(2_837_838n, "COP"))).toBe(18.4);
  });
});

describe("spendingByCategory", () => {
  it("de mayor a menor, con porcentajes del total", () => {
    const { slices, total } = spendingByCategory(ROWS, "2026-10", "COP", [RATE]);
    expect(total).toEqual(money(3_713_960n, "COP"));
    expect(slices.map((s) => [s.categoryKey, s.amount.amountMinor, s.percent])).toEqual([
      ["housing", 2_100_000n, 57],
      ["food", 1_150_000n, 31],
      ["subscriptions", 463_960n, 12],
    ]);
  });
});

describe("trend y lastMonths", () => {
  it("6 meses que terminan en el elegido, cruzando el año", () => {
    expect(lastMonths("2026-02", 6)).toEqual([
      "2025-09",
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });
  it("los meses sin datos quedan en 0", () => {
    const { points } = trend(ROWS, lastMonths("2026-10", 3), "COP", [RATE]);
    expect(points.map((p) => [p.month, p.income.amountMinor, p.expenses.amountMinor])).toEqual([
      ["2026-08", 0n, 0n],
      ["2026-09", 8_000_000n, 6_000_000n],
      ["2026-10", 9_200_000n, 3_713_960n],
    ]);
  });
  it("niceMax redondea el eje", () => {
    expect(niceMax(9_200_000n)).toBe(10_000_000n);
    expect(niceMax(230_000n)).toBe(250_000n);
    expect(niceMax(1_700n)).toBe(2_000n);
    expect(niceMax(0n)).toBe(0n);
  });
});
