/**
 * Próximo vencimiento de una deuda a partir de su día de pago (1 a 31).
 * Si el día ya pasó este mes, es el del mes siguiente; en meses más cortos
 * se usa el último día (un 31 en febrero cae el 28 o 29).
 */
import { daysBetween } from "@/lib/goals/status";
import { monthBounds, shiftMonth } from "@/lib/transactions/dates";

export function nextDueDate(dueDay: number, today: string): string {
  const inMonth = (month: string) => {
    const last = Number(monthBounds(month).to.slice(8));
    return `${month}-${String(Math.min(dueDay, last)).padStart(2, "0")}`;
  };
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
