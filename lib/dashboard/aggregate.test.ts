// Tests de los agregados del dashboard (lib/dashboard/aggregate.ts).
//
// Fase E3: dashboard_totals ya convierte en la base (con la tasa de la fecha
// de cada movimiento); estas filas llegan con `converted` y `uncovered` ya
// resueltos, como las devolvería la RPC. Las pruebas de la conversión en sí
// (tasa del día, última disponible, par sin ninguna tasa) viven en
// supabase/tests/dashboard_totals.sql, contra Postgres.
import { describe, expect, it } from "vitest";

import { money, type Money } from "@/lib/money/money";

import {
  lastMonths,
  monthTotals,
  niceMax,
  originBreakdown,
  percentChange,
  spendingByCategory,
  trend,
  type AggregateRow,
} from "./aggregate";

/** Fila ya convertida a COP, como la devuelve dashboard_totals. */
function row(
  month: string,
  kind: AggregateRow["kind"],
  categoryKey: AggregateRow["categoryKey"],
  originMinor: bigint,
  originCurrency: Money["currency"],
  convertedMinor: bigint,
  count = 1,
  uncoveredMinor = 0n,
): AggregateRow {
  return {
    month,
    kind,
    categoryKey,
    amount: money(originMinor, originCurrency),
    converted: money(convertedMinor, "COP"),
    uncovered: uncoveredMinor > 0n ? money(uncoveredMinor, originCurrency) : null,
    count,
  };
}

// Octubre, convertido a COP: ingresos 8.800.000 + US$ 100,00 (400.000);
// gastos 2.100.000 vivienda, US$ 15,99 (63.960) + 400.000 suscripciones +
// 1.150.000 comida.
const ROWS: AggregateRow[] = [
  row("2026-10", "income", "salary", 8_800_000n, "COP", 8_800_000n, 1),
  row("2026-10", "income", "other_income", 10_000n, "USD", 400_000n, 1),
  row("2026-10", "expense", "housing", 2_100_000n, "COP", 2_100_000n, 2),
  row("2026-10", "expense", "subscriptions", 1_599n, "USD", 63_960n, 1),
  row("2026-10", "expense", "subscriptions", 400_000n, "COP", 400_000n, 3),
  row("2026-10", "expense", "food", 1_150_000n, "COP", 1_150_000n, 4),
  row("2026-09", "income", "salary", 8_000_000n, "COP", 8_000_000n),
  row("2026-09", "expense", "food", 6_000_000n, "COP", 6_000_000n),
];

describe("monthTotals suma lo ya convertido", () => {
  it("suma converted, no el origen", () => {
    const t = monthTotals(ROWS, "2026-10", "COP");
    expect(t.income).toEqual(money(9_200_000n, "COP")); // 8.800.000 + 400.000
    expect(t.expenses).toEqual(money(3_713_960n, "COP")); // 2.100.000 + 63.960 + 400.000 + 1.150.000
    expect(t.balance).toEqual(money(5_486_040n, "COP"));
    expect(t.count).toBe(12);
    expect(t.partial).toBe(false);
  });

  it("una fila sin tasa (uncovered) marca partial, aunque converted siga sumando lo que sí se pudo", () => {
    const withGap = [...ROWS, row("2026-10", "expense", "food", 5_000n, "EUR", 0n, 1, 5_000n)];
    const t = monthTotals(withGap, "2026-10", "COP");
    // El EUR sin tasa no suma al total (nunca se inventa), pero sí queda marcado.
    expect(t.expenses).toEqual(money(3_713_960n, "COP"));
    expect(t.partial).toBe(true);
  });
});

describe("mes sin datos", () => {
  it("todo en cero, sin categorías", () => {
    const t = monthTotals(ROWS, "2026-03", "COP");
    expect(t).toEqual({
      income: money(0n, "COP"),
      expenses: money(0n, "COP"),
      balance: money(0n, "COP"),
      count: 0,
      partial: false,
    });
    expect(spendingByCategory(ROWS, "2026-03", "COP")).toEqual({
      slices: [],
      total: money(0n, "COP"),
      partial: false,
    });
  });
});

describe("percentChange", () => {
  it("contra un mes anterior vacío no divide por cero: null", () => {
    const empty = monthTotals(ROWS, "2026-08", "COP");
    expect(percentChange(money(9_200_000n, "COP"), empty.income)).toBeNull();
    expect(percentChange(money(0n, "COP"), empty.balance)).toBeNull();
  });
  it("ingresos +15 % y gastos −38,1 % contra septiembre", () => {
    const oct = monthTotals(ROWS, "2026-10", "COP");
    const sep = monthTotals(ROWS, "2026-09", "COP");
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
    const { slices, total } = spendingByCategory(ROWS, "2026-10", "COP");
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
    const { points } = trend(ROWS, lastMonths("2026-10", 3), "COP");
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

describe("originBreakdown", () => {
  it("agrupa por moneda de origen (ingresos y gastos juntos), para el sheet de MoneyAmount total", () => {
    const octRows = ROWS.filter((r) => r.month === "2026-10");
    const breakdown = originBreakdown(octRows);
    // COP: 8.800.000 + 2.100.000 + 400.000 + 1.150.000; USD: 10.000 + 1.599.
    expect(breakdown).toEqual(
      expect.arrayContaining([money(12_450_000n, "COP"), money(11_599n, "USD")]),
    );
    expect(breakdown).toHaveLength(2);
  });
});

describe("regresión v0.35.1: tarjetas, tendencia y categorías cuadran", () => {
  // Octubre de Isaac: dos ingresos el 22 en Banco de Bogotá, gastos por
  // categoría y un pago de tarjeta contado como gasto (card_payment).
  const rows = [
    row("2026-10", "income", "salary", 7_186_495n, "COP", 7_186_495n),
    row("2026-10", "income", "other_income", 650_168n, "COP", 650_168n),
    row("2026-10", "expense", "housing", 989_523n, "COP", 989_523n, 2),
    row("2026-10", "expense", "other", 449_752n, "COP", 449_752n),
    row("2026-10", "expense", "leisure", 344_087n, "COP", 344_087n),
    row("2026-10", "expense", "card_payment", 204_827n, "COP", 204_827n),
    row("2026-09", "income", "salary", 7_000_000n, "COP", 7_000_000n),
    row("2026-09", "expense", "food", 1_000_000n, "COP", 1_000_000n),
  ];

  it("la tarjeta usa las mismas filas que la tendencia y las categorías", () => {
    const oct = monthTotals(rows, "2026-10", "COP");
    expect(oct.income).toEqual(money(7_836_663n, "COP"));
    const cats = spendingByCategory(rows, "2026-10", "COP");
    expect(oct.expenses).toEqual(cats.total);
    expect(oct.expenses).toEqual(money(1_988_189n, "COP"));
    expect(oct.balance).toEqual(money(7_836_663n - 1_988_189n, "COP"));
    const last = trend(rows, lastMonths("2026-10", 2), "COP").points.at(-1)!;
    expect(last.income).toEqual(oct.income);
    expect(last.expenses).toEqual(oct.expenses);
  });

  it("el mes anterior solo cambia el porcentaje, no el valor mostrado", () => {
    const oct = monthTotals(rows, "2026-10", "COP");
    const sep = monthTotals(rows, "2026-09", "COP");
    expect(percentChange(oct.income, sep.income)).toBe(12);
    expect(monthTotals(rows, "2026-10", "COP").income).toEqual(oct.income);
  });
});
