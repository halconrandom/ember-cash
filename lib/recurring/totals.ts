/**
 * Equivalente mensual y anual de un recurrente, en unidades menores de su
 * moneda. Semanal usa 52 semanas; el resto, 12 meses. El intervalo divide.
 * Redondeo de mitades lejos de cero, igual que la conversión de moneda.
 */
import type { RecurringFrequency } from "@/lib/db/types";
import { divRound } from "@/lib/money/convert";

export function periodEquivalent(
  amountMinor: bigint,
  frequency: RecurringFrequency,
  interval: number,
  per: "month" | "year",
): bigint {
  const step = BigInt(interval);
  if (per === "year") {
    if (frequency === "weekly") return divRound(amountMinor * 52n, step);
    if (frequency === "monthly") return divRound(amountMinor * 12n, step);
    return divRound(amountMinor, step);
  }
  if (frequency === "weekly") return divRound(amountMinor * 52n, 12n * step);
  if (frequency === "monthly") return divRound(amountMinor, step);
  return divRound(amountMinor, 12n * step);
}
