/**
 * Formatos de número y fecha según el idioma. El dinero se formatea en
 * lib/money/format.ts (exacto, con bigint).
 */
import { DEFAULT_TIME_ZONE, INTL_TAGS, type Locale } from "./config";

/** Número con los separadores del idioma y `fractionDigits` decimales fijos. */
export function formatNumber(value: number, locale: Locale, fractionDigits = 0): string {
  return new Intl.NumberFormat(INTL_TAGS[locale], {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

/** Formatos de fecha usados en la UI. */
const DATE_STYLES = {
  /** "16 de oct" / "Oct 16" */
  short: { month: "short", day: "numeric" },
  /** "octubre de 2026" / "October 2026" */
  monthYear: { month: "long", year: "numeric" },
  /** "sáb, 17 de oct" / "Sat, Oct 17" */
  weekdayShort: { weekday: "short", month: "short", day: "numeric" },
  /** "vie, 16 de oct de 2026" / "Fri, Oct 16, 2026" */
  weekdayDateYear: { weekday: "short", month: "short", day: "numeric", year: "numeric" },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>;

export type DateStyle = keyof typeof DATE_STYLES;

/** Fecha según el idioma, en la zona horaria del usuario. */
export function formatDate(
  date: Date | string,
  locale: Locale,
  style: DateStyle = "short",
  timeZone: string = DEFAULT_TIME_ZONE,
): string {
  // Las fechas "AAAA-MM-DD" (columnas date) se leen como mediodía UTC para
  // que ninguna zona horaria las corra al día anterior.
  const value =
    typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T12:00:00Z` : date;
  return new Intl.DateTimeFormat(INTL_TAGS[locale], { ...DATE_STYLES[style], timeZone }).format(
    new Date(value),
  );
}
