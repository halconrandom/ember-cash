/**
 * Agrupa filas por día (más recientes primero) con la etiqueta de
 * 02-transactions.png: "Hoy · viernes, 16 de oct", "Ayer · jueves, 15 de oct",
 * "miércoles · 14 de oct" y, si es de otro año, con el año.
 */
import { INTL_TAGS, type Locale } from "@/lib/i18n/config";

import { addDays } from "./dates";

export type DayGroup<T> = {
  date: string;
  /** "today", "yesterday" o null (se usa el día de la semana). */
  relative: "today" | "yesterday" | null;
  /** Día de la semana ("viernes" / "Friday"). */
  weekday: string;
  /** "16 de oct" / "Oct 16" (con año si no es el año actual). */
  shortDate: string;
  items: T[];
};

export function groupByDay<T extends { occurredOn: string }>(
  rows: readonly T[],
  today: string,
  locale: Locale,
): DayGroup<T>[] {
  const yesterday = addDays(today, -1);
  const tag = INTL_TAGS[locale];
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const list = groups.get(row.occurredOn);
    if (list) list.push(row);
    else groups.set(row.occurredOn, [row]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([date, items]) => {
      const d = new Date(`${date}T12:00:00Z`);
      const sameYear = date.slice(0, 4) === today.slice(0, 4);
      return {
        date,
        relative: date === today ? "today" : date === yesterday ? "yesterday" : null,
        weekday: new Intl.DateTimeFormat(tag, { weekday: "long", timeZone: "UTC" }).format(d),
        shortDate: new Intl.DateTimeFormat(tag, {
          month: "short",
          day: "numeric",
          ...(sameYear ? {} : { year: "numeric" }),
          timeZone: "UTC",
        }).format(d),
        items,
      };
    });
}
