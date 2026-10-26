/**
 * Próximo vencimiento de una deuda a partir de su día de pago (1 a 31).
 * Si el día ya pasó este mes, es el del mes siguiente; en meses más cortos
 * se usa el último día (un 31 en febrero cae el 28 o 29).
 */
import { daysBetween } from "@/lib/goals/status";
import { monthBounds, shiftMonth } from "@/lib/transactions/dates";

function dueInMonth(dueDay: number, month: string): string {
  const last = Number(monthBounds(month).to.slice(8));
  return `${month}-${String(Math.min(dueDay, last)).padStart(2, "0")}`;
}

export function nextDueDate(dueDay: number, today: string): string {
  const inMonth = (month: string) => dueInMonth(dueDay, month);
  const thisMonth = inMonth(today.slice(0, 7));
  return thisMonth >= today ? thisMonth : inMonth(shiftMonth(today.slice(0, 7), 1));
}

/**
 * Vence pronto: dentro de 10 días o menos (se marca con negative-text, como
 * "Due Oct 22" y "Due Oct 25" en 04-debts.png con hoy 16 de octubre).
 */
export const DUE_SOON_DAYS = 10;
export function isDueSoon(due: string, today: string): boolean {
  const d = daysBetween(today, due);
  return d >= 0 && d <= DUE_SOON_DAYS;
}

export type DueState = {
  /** Próximo vencimiento sin saldar. */
  due: string;
  /** El vencimiento de este ciclo ya está saldado (pago real o marcado). */
  paidThisCycle: boolean;
  /** today: vence hoy (ámbar); soon: en 1 a 10 días (rojo); later: más adelante. */
  tone: "today" | "soon" | "later";
};

/**
 * Vencimiento que muestra la tarjeta de una deuda. `paidMonths` son los meses
 * ("AAAA-MM") ya saldados: con un pago real (no el inicial de 0029) o con el
 * vencimiento marcado como pagado u omitido. Si el mes del próximo
 * vencimiento ya está saldado, pasa al mes siguiente.
 */
export function debtDueState(
  dueDay: number,
  today: string,
  paidMonths: readonly string[],
): DueState {
  let due = nextDueDate(dueDay, today);
  let paidThisCycle = false;
  while (paidMonths.includes(due.slice(0, 7))) {
    paidThisCycle = true;
    due = dueInMonth(dueDay, shiftMonth(due.slice(0, 7), 1));
  }
  const tone = due === today ? "today" : isDueSoon(due, today) ? "soon" : "later";
  return { due, paidThisCycle, tone };
}
