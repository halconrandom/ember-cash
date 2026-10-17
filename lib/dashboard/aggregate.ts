/**
 * Cálculos del dashboard sobre los agregados de la base (dashboard_totals):
 * una fila por mes, tipo, categoría y moneda. Funciones puras: se usan en el
 * cliente con la tasa más reciente (RateProvider).
 *
 * Conversión: se suma por moneda y cada subtotal se convierte una sola vez
 * (como totalIn). Sin tasa, lo que está en otra moneda no se suma y el
 * resultado queda marcado `partial`.
 */
import type { CategoryKey, CurrencyCode } from "@/lib/db/types";
import { convert, divRound, type Rate } from "@/lib/money/convert";
import { add, money, subtract, type Money } from "@/lib/money/money";

export type AggregateRow = {
  /** AAAA-MM */
  month: string;
  kind: "income" | "expense";
  categoryKey: CategoryKey;
  amount: Money;
  count: number;
};

/** Suma en `to`: por moneda y una conversión por subtotal. */
export function sumIn(
  items: readonly Money[],
  to: CurrencyCode,
  rate: Rate | null,
): { total: Money; partial: boolean } {
  const byCurrency = new Map<CurrencyCode, Money>();
  for (const m of items) {
    const prev = byCurrency.get(m.currency);
    byCurrency.set(m.currency, prev ? add(prev, m) : m);
  }
  let total = money(0n, to);
  let partial = false;
  for (const subtotal of byCurrency.values()) {
    if (subtotal.currency === to) total = add(total, subtotal);
    else if (rate) total = add(total, convert(subtotal, to, rate));
    else partial = true;
  }
  return { total, partial };
}

export type MonthTotals = {
  income: Money;
  expenses: Money;
  /** Ingresos − gastos (puede ser negativo). */
  balance: Money;
  count: number;
  partial: boolean;
};

export function monthTotals(
  rows: readonly AggregateRow[],
  month: string,
  to: CurrencyCode,
  rate: Rate | null,
): MonthTotals {
  const inMonth = rows.filter((r) => r.month === month);
  const income = sumIn(
    inMonth.filter((r) => r.kind === "income").map((r) => r.amount),
    to,
    rate,
  );
  const expenses = sumIn(
    inMonth.filter((r) => r.kind === "expense").map((r) => r.amount),
    to,
    rate,
  );
  return {
    income: income.total,
    expenses: expenses.total,
    balance: subtract(income.total, expenses.total),
    count: inMonth.reduce((n, r) => n + r.count, 0),
    partial: income.partial || expenses.partial,
  };
}

/**
 * Variación porcentual contra el mes anterior, con un decimal: (actual −
 * anterior) / |anterior|. Si el anterior es 0 no hay base: null (nunca se
 * divide por cero).
 */
export function percentChange(current: Money, previous: Money): number | null {
  if (previous.amountMinor === 0n) return null;
  const prev = previous.amountMinor < 0n ? -previous.amountMinor : previous.amountMinor;
  // Décimas de punto porcentual, redondeadas lejos de cero.
  const tenths = divRound((current.amountMinor - previous.amountMinor) * 1000n, prev);
  return Number(tenths) / 10;
}

export type CategorySlice = { categoryKey: CategoryKey; amount: Money; percent: number };

/** Gastos del mes por categoría, de mayor a menor, con su porcentaje entero. */
export function spendingByCategory(
  rows: readonly AggregateRow[],
  month: string,
  to: CurrencyCode,
  rate: Rate | null,
): { slices: CategorySlice[]; total: Money; partial: boolean } {
  const expenses = rows.filter((r) => r.month === month && r.kind === "expense");
  const keys = [...new Set(expenses.map((r) => r.categoryKey))];
  let partial = false;
  const sums = keys.map((key) => {
    const s = sumIn(
      expenses.filter((r) => r.categoryKey === key).map((r) => r.amount),
      to,
      rate,
    );
    partial ||= s.partial;
    return { categoryKey: key, amount: s.total };
  });
  const total = sums.reduce((acc, s) => add(acc, s.amount), money(0n, to));
  const slices = sums
    .filter((s) => s.amount.amountMinor > 0n)
    .map((s) => ({
      ...s,
      percent:
        total.amountMinor > 0n
          ? Number(divRound(s.amount.amountMinor * 100n, total.amountMinor))
          : 0,
    }))
    .sort((a, b) =>
      b.amount.amountMinor === a.amount.amountMinor
        ? a.categoryKey.localeCompare(b.categoryKey)
        : b.amount.amountMinor > a.amount.amountMinor
          ? 1
          : -1,
    );
  return { slices, total, partial };
}

export type TrendPoint = { month: string; income: Money; expenses: Money };

/** Ingresos y gastos de cada mes pedido (en orden), 0 si no hay datos. */
export function trend(
  rows: readonly AggregateRow[],
  months: readonly string[],
  to: CurrencyCode,
  rate: Rate | null,
): { points: TrendPoint[]; partial: boolean } {
  let partial = false;
  const points = months.map((month) => {
    const t = monthTotals(rows, month, to, rate);
    partial ||= t.partial;
    return { month, income: t.income, expenses: t.expenses };
  });
  return { points, partial };
}

/** Los `n` meses que terminan en `month` (AAAA-MM), del más viejo al más nuevo. */
export function lastMonths(month: string, n: number): string[] {
  const [y, m] = month.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

/** Máximo "redondo" para el eje del gráfico (1, 2, 2,5 o 5 × 10^k unidades menores). */
export function niceMax(maxMinor: bigint): bigint {
  if (maxMinor <= 0n) return 0n;
  let magnitude = 1n;
  while (magnitude * 10n <= maxMinor) magnitude *= 10n;
  for (const step of [1n, 2n, 5n, 10n]) {
    // 2,5 como 25/10 para no perder enteros.
    if (step === 5n && (magnitude * 25n) / 10n >= maxMinor && magnitude >= 10n) {
      return (magnitude * 25n) / 10n;
    }
    if (magnitude * step >= maxMinor) return magnitude * step;
  }
  return magnitude * 10n;
}
