/**
 * Estado de un presupuesto compartido (08-household.png):
 *   - menos de 80 %: neutro (barra gris),
 *   - de 80 % hasta el límite: cerca (ámbar),
 *   - por encima del límite: excedido (rojo, "103 % usado, sobre el presupuesto").
 * El porcentaje se redondea al entero más cercano (85,8 % -> 86 %).
 *
 * Lo gastado es la suma de los gastos compartidos del mes en esa categoría
 * (el monto completo, no la parte de cada uno), convertidos a la moneda del
 * presupuesto con la tasa más reciente.
 */
import type { CurrencyCode } from "@/lib/db/types";
import { convert, divRound, latestRateFor, type Rate } from "@/lib/money/convert";
import { add, money, type Money } from "@/lib/money/money";

export type BudgetState = "ok" | "near" | "over";

/** Desde este porcentaje el presupuesto se marca en ámbar. */
export const BUDGET_NEAR_PERCENT = 80;

export function budgetPercent(spentMinor: bigint, limitMinor: bigint): number {
  if (limitMinor <= 0n) return 0;
  return Number(divRound(spentMinor * 100n, limitMinor));
}

export function budgetState(spentMinor: bigint, limitMinor: bigint): BudgetState {
  if (spentMinor > limitMinor) return "over";
  return budgetPercent(spentMinor, limitMinor) >= BUDGET_NEAR_PERCENT ? "near" : "ok";
}

/**
 * Suma en `to` los montos; los de otra moneda se convierten con la tasa más
 * reciente de su par. Sin tasa para esa moneda, se omiten y `partial` queda
 * en true.
 */
export function spentIn(
  items: readonly Money[],
  to: CurrencyCode,
  rates: readonly Rate[],
): { total: Money; partial: boolean } {
  let total = money(0n, to);
  let partial = false;
  for (const m of items) {
    const rate = m.currency === to ? null : latestRateFor(rates, m.currency, to);
    if (m.currency === to) total = add(total, m);
    else if (rate) total = add(total, convert(m, to, rate));
    else partial = true;
  }
  return { total, partial };
}
