/**
 * Vista del calendario: tipo de cada cargo, grilla del mes (lunes a domingo)
 * y qué chips caben en una celda. "+N más" aparece cuando hay más de dos.
 */
import type { RecurringKind } from "@/lib/db/types";
import { addDays, monthBounds } from "@/lib/transactions/dates";

/** Chips visibles en una celda; el resto va a "+N más" (IVERN_FIXES §6). */
export const VISIBLE_CHIPS = 2;

export type CalendarKind = "payment_due" | "payday" | "recurring";

/** Factura y pago de deuda = pago por vencer; ingreso = día de cobro; suscripción = recurrente. */
export function calendarKind(kind: RecurringKind): CalendarKind {
  if (kind === "income") return "payday";
  if (kind === "subscription") return "recurring";
  return "payment_due";
}

export type CalendarEvent = {
  occurrenceId: string;
  name: string;
  dueOn: string;
  calendarKind: CalendarKind;
};

export type MonthCell = {
  date: string;
  inMonth: boolean;
  events: CalendarEvent[];
};

/** Lunes = 0. `getUTCDay` usa domingo = 0. */
function mondayIndex(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/**
 * Semanas completas que cubren el mes. Octubre 2026 empieza el jueves 1 y
 * termina el sábado 31, así que la grilla va del lunes 28 de septiembre al
 * domingo 1 de noviembre.
 */
export function monthGrid(month: string, events: readonly CalendarEvent[]): MonthCell[] {
  const { from, to } = monthBounds(month);
  const start = addDays(from, -mondayIndex(from));
  const byDate = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const list = byDate.get(event.dueOn);
    if (list) list.push(event);
    else byDate.set(event.dueOn, [event]);
  }

  const cells: MonthCell[] = [];
  for (let i = 0; i < 42; i++) {
    const date = addDays(start, i);
    cells.push({
      date,
      inMonth: date >= from && date <= to,
      events: byDate.get(date) ?? [],
    });
    // Cierra al terminar la semana que contiene el último día del mes.
    if (i % 7 === 6 && date >= to) break;
  }
  return cells;
}

/** Cuántos eventos quedan fuera de los dos chips visibles. */
export function hiddenCount(count: number): number {
  return Math.max(0, count - VISIBLE_CHIPS);
}

/**
 * Celdas del mes a partir de los vencimientos ya cargados. Vive aquí (y no
 * en queries) porque la pantalla es un client component y queries es de servidor.
 */
export function calendarCells(
  month: string,
  events: readonly {
    occurrenceId: string;
    name: string;
    dueOn: string;
    calendarKind: CalendarKind;
  }[],
): MonthCell[] {
  return monthGrid(month, events);
}
