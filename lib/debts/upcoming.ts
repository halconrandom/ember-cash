/**
 * Lista corta de deudas para el dashboard: progreso, pagado vs original y el
 * próximo vencimiento con su estado, con la misma lógica de /debts
 * (debtDueState y goalPercent). Incluye las deudas fuera del plan.
 */
import { goalPercent } from "@/lib/goals/status";
import type { Money } from "@/lib/money/money";

import { debtDueState, type DueState } from "./dates";
import type { DebtIcon } from "./schema";

/** Lo que necesita de cada deuda (DebtSummary cumple). */
export type DebtLike = {
  id: string;
  name: string;
  iconKey: DebtIcon;
  original: Money;
  paid: Money;
  balance: Money;
  dueDay: number | null;
  paidMonths: string[];
};

export type UpcomingDebt = {
  id: string;
  name: string;
  iconKey: DebtIcon;
  original: Money;
  /** Capital pagado, con el pago inicial (0029): "pagado / original". */
  paid: Money;
  percent: number;
  /** null si la deuda no tiene día de pago. */
  dueState: DueState | null;
};

/**
 * Deudas abiertas (saldo > 0) ordenadas por próximo vencimiento sin saldar;
 * las que no tienen día de pago van al final. A lo sumo `limit`.
 */
export function upcomingDebts(
  debts: readonly DebtLike[],
  today: string,
  limit = 3,
): UpcomingDebt[] {
  return debts
    .filter((d) => d.balance.amountMinor > 0n)
    .map((d) => ({
      id: d.id,
      name: d.name,
      iconKey: d.iconKey,
      original: d.original,
      paid: d.paid,
      percent: goalPercent(d.paid.amountMinor, d.original.amountMinor),
      dueState: d.dueDay ? debtDueState(d.dueDay, today, d.paidMonths) : null,
    }))
    .sort((a, b) => (a.dueState?.due ?? "9999").localeCompare(b.dueState?.due ?? "9999"))
    .slice(0, limit);
}
