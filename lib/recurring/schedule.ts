/**
 * Fechas de un recurrente, sin base de datos.
 *
 * Un ítem mensual anclado al día 31 cae el último día de los meses más
 * cortos (y el 29 de febrero en los años bisiestos). Uno anual anclado al
 * 29 de febrero cae el 28 en los años que no son bisiestos. El día de ancla
 * es siempre el del `anchorDate`, no el de la ocurrencia anterior: así marzo
 * vuelve al 31 después de un febrero de 28.
 *
 * "Hoy" sale de la zona horaria del perfil (America/Bogota por defecto),
 * nunca de UTC. La aritmética de fechas usa mediodía UTC solo como calendario
 * (sumar días no depende de la zona).
 */
import { DEFAULT_TIME_ZONE } from "@/lib/i18n/config";
import type { RecurringFrequency, RecurringStatus } from "@/lib/db/types";
import { addDays, todayIn } from "@/lib/transactions/dates";

/** Días hacia adelante que materializa el cron. */
export const HORIZON_DAYS = 90;

export type ScheduleInput = {
  frequency: RecurringFrequency;
  /** Cada cuántas unidades de `frequency` (1 = cada mes). */
  interval: number;
  anchorDate: string;
  endsOn: string | null;
  status: RecurringStatus;
};

function parts(date: string): { y: number; m: number; d: number } {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Día `day` del mes `month` (1-12, puede salirse), recortado al último día. */
export function clampDate(year: number, month: number, day: number): string {
  const cursor = new Date(Date.UTC(year, month - 1, 1));
  const y = cursor.getUTCFullYear();
  const m = cursor.getUTCMonth();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return `${y}-${pad(m + 1)}-${pad(Math.min(day, last))}`;
}

/** Días entre dos fechas AAAA-MM-DD (b - a). */
export function daysBetween(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** Fecha de la ocurrencia número `step` (0 = el ancla). */
export function dateAt(
  item: Pick<ScheduleInput, "frequency" | "interval" | "anchorDate">,
  step: number,
): string {
  const { y, m, d } = parts(item.anchorDate);
  const n = step * item.interval;
  if (item.frequency === "weekly") return addDays(item.anchorDate, n * 7);
  if (item.frequency === "monthly") return clampDate(y, m + n, d);
  return clampDate(y + n, m, d);
}

/**
 * Ocurrencias dentro de [from, until], inclusive. Pausado o cancelado no
 * genera ninguna. `endsOn` también es inclusive.
 */
export function occurrenceDates(item: ScheduleInput, from: string, until: string): string[] {
  if (item.status !== "active" || item.interval < 1) return [];
  const end = item.endsOn && item.endsOn < until ? item.endsOn : until;
  if (end < from || item.anchorDate > end) return [];

  let step = 0;
  if (from > item.anchorDate) {
    if (item.frequency === "weekly") {
      step = Math.floor(daysBetween(item.anchorDate, from) / (item.interval * 7));
    } else if (item.frequency === "monthly") {
      const a = parts(item.anchorDate);
      const b = parts(from);
      step = Math.floor((b.y * 12 + b.m - (a.y * 12 + a.m)) / item.interval);
    } else {
      step = Math.floor((parts(from).y - parts(item.anchorDate).y) / item.interval);
    }
    if (step > 0) step -= 1;
  }

  const dates: string[] = [];
  // Tope de seguridad: 90 días semanales caben de sobra; evita un bucle si
  // el intervalo llegara a 0 por un dato viejo.
  for (let i = 0; i < 5000; i++) {
    const date = dateAt(item, step);
    if (date > end) break;
    if (date >= from && date >= item.anchorDate && (!item.endsOn || date <= item.endsOn)) {
      dates.push(date);
    }
    step += 1;
  }
  return dates;
}

/** Ventana [hoy, hoy + 90] en la zona del perfil. */
export function occurrenceHorizon(
  now: Date = new Date(),
  timeZone: string = DEFAULT_TIME_ZONE,
): { from: string; until: string } {
  const from = todayIn(timeZone, now);
  return { from, until: addDays(from, HORIZON_DAYS) };
}

/**
 * Primera fecha de pago de una deuda: el `dueDay` del mes de `startedOn`, o
 * el del mes siguiente si ese día ya pasó.
 */
export function firstDueOnOrAfter(startedOn: string, dueDay: number): string {
  const { y, m } = parts(startedOn);
  const sameMonth = clampDate(y, m, dueDay);
  if (sameMonth >= startedOn) return sameMonth;
  return clampDate(y, m + 1, dueDay);
}

/** Fechas que no hay que volver a insertar (ya existen o se movieron). */
export function datesToInsert(
  scheduled: readonly string[],
  existing: readonly { dueOn: string; rescheduledFrom: string | null }[],
): string[] {
  const blocked = new Set<string>();
  for (const row of existing) {
    blocked.add(row.dueOn);
    if (row.rescheduledFrom) blocked.add(row.rescheduledFrom);
  }
  return scheduled.filter((date) => !blocked.has(date));
}

/**
 * Mover una sola ocurrencia. `abandon` es la fecha que queda libre y hay que
 * marcar como skipped para que el generador no la vuelva a crear.
 */
export function rescheduleUpdate(
  current: { dueOn: string; rescheduledFrom: string | null },
  nextDue: string,
): { dueOn: string; rescheduledFrom: string | null; abandon: string | null } {
  if (nextDue === current.dueOn) {
    return { dueOn: nextDue, rescheduledFrom: current.rescheduledFrom, abandon: null };
  }
  const original = current.rescheduledFrom ?? current.dueOn;
  return {
    dueOn: nextDue,
    // Volver a la fecha original deja la serie como si no se hubiera movido.
    rescheduledFrom: nextDue === original ? null : original,
    abandon: current.dueOn,
  };
}
