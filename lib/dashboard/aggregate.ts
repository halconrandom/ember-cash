/**
 * Cálculos del dashboard sobre los agregados de la base (dashboard_totals):
 * una fila por mes, tipo, categoría y moneda de origen. Funciones puras.
 *
 * Fase E3: dashboard_totals ya convierte cada fila a profiles.display_currency
 * con la tasa vigente en la fecha de esa fila (no la de hoy), así que
 * `monthTotals`/`spendingByCategory`/`trend` solo suman `row.converted` —
 * ya no necesitan la lista de tasas del cliente (`rates` de <RateProvider>).
 * `row.uncovered` (no null) marca que esa fila no se pudo convertir: nunca se
 * inventa un número, y el resultado queda marcado `partial`.
 *
 * El `sumIn` genérico (Money[] + rates del cliente) sigue igual: lo usan las
 * tarjetas de metas, deudas y suscripciones, que no vienen de dashboard_totals.
 */
import type { CategoryKey, CurrencyCode } from "@/lib/db/types";
import { convert, divRound, latestRateFor, type Rate } from "@/lib/money/convert";
import { add, money, subtract, type Money } from "@/lib/money/money";

export type AggregateRow = {
  /** AAAA-MM */
  month: string;
  kind: "income" | "expense";
  categoryKey: CategoryKey;
  /** Moneda de origen (para el desglose del sheet de MoneyAmount "total"). */
  amount: Money;
  /** Ya convertido a display_currency en la base (dashboard_totals, fase E3). */
  converted: Money;
  /** Parte de `amount` sin tasa disponible; null si no aplica. */
  uncovered: Money | null;
  count: number;
};

/** Suma en `to`: por moneda y una conversión por subtotal (tasa más reciente del cliente). */
export function sumIn(
  items: readonly Money[],
  to: CurrencyCode,
  rates: readonly Rate[],
): { total: Money; partial: boolean } {
  const byCurrency = new Map<CurrencyCode, Money>();
  for (const m of items) {
    const prev = byCurrency.get(m.currency);
    byCurrency.set(m.currency, prev ? add(prev, m) : m);
  }
  let total = money(0n, to);
  let partial = false;
  for (const subtotal of byCurrency.values()) {
    const rate = subtotal.currency === to ? null : latestRateFor(rates, subtotal.currency, to);
    if (subtotal.currency === to) total = add(total, subtotal);
    else if (rate) total = add(total, convert(subtotal, to, rate));
    else partial = true;
  }
  return { total, partial };
}

/** Suma `row.converted` de un grupo de filas ya convertidas; `partial` si alguna quedó sin tasa. */
function sumConverted(rows: readonly AggregateRow[], to: CurrencyCode): { total: Money; partial: boolean } {
  let total = money(0n, to);
  let partial = false;
  for (const r of rows) {
    total = add(total, r.converted);
    if (r.uncovered) partial = true;
  }
  return { total, partial };
}

/** Importes de origen de un grupo de filas, por moneda: para el sheet de MoneyAmount "total". */
export function originBreakdown(rows: readonly AggregateRow[]): Money[] {
  const byCurrency = new Map<CurrencyCode, Money>();
  for (const r of rows) {
    const prev = byCurrency.get(r.amount.currency);
    byCurrency.set(r.amount.currency, prev ? add(prev, r.amount) : r.amount);
  }
  return [...byCurrency.values()];
}

export type MonthTotals = {
  income: Money;
  expenses: Money;
  /** Ingresos − gastos (puede ser negativo). */
  balance: Money;
  count: number;
  partial: boolean;
};

export function monthTotals(rows: readonly AggregateRow[], month: string, to: CurrencyCode): MonthTotals {
  const inMonth = rows.filter((r) => r.month === month);
  const income = sumConverted(inMonth.filter((r) => r.kind === "income"), to);
  const expenses = sumConverted(inMonth.filter((r) => r.kind === "expense"), to);
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
): { slices: CategorySlice[]; total: Money; partial: boolean } {
  const expenses = rows.filter((r) => r.month === month && r.kind === "expense");
  const keys = [...new Set(expenses.map((r) => r.categoryKey))];
  let partial = false;
  const sums = keys.map((key) => {
    const s = sumConverted(expenses.filter((r) => r.categoryKey === key), to);
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
): { points: TrendPoint[]; partial: boolean } {
  let partial = false;
  const points = months.map((month) => {
    const t = monthTotals(rows, month, to);
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
