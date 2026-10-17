/**
 * Formatos según el idioma, con las reglas de moneda de DESIGN_SPEC §4:
 * - Los decimales los decide la moneda, no el idioma: COP 0, USD 2.
 * - Los separadores los decide el idioma: es → 125.000 / 15,99; en → 125,000 / 15.99.
 * - Con símbolo (por defecto): USD lleva "US$" delante; COP lleva "COP" detrás.
 * - Con código (modal de transacción, spec §4.8): "125.000 COP", "31,25 USD".
 * Entre el número y la unidad va un espacio que no se parte ( ), para
 * que un monto nunca quede cortado en dos líneas.
 */
import { CURRENCY_EXPONENT, type CurrencyCode } from "@/lib/db/types";

import { DEFAULT_TIME_ZONE, INTL_TAGS, type Locale } from "./config";

const NBSP = " ";

/** Número con los separadores del idioma y `fractionDigits` decimales fijos. */
export function formatNumber(value: number, locale: Locale, fractionDigits = 0): string {
  return new Intl.NumberFormat(INTL_TAGS[locale], {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

/** Importe sin unidad: unidades menores → número con los decimales de la moneda. */
export function formatAmount(minor: number, currency: CurrencyCode, locale: Locale): string {
  const exponent = CURRENCY_EXPONENT[currency];
  return formatNumber(minor / 10 ** exponent, locale, exponent);
}

type MoneyOptions = {
  /** "symbol": US$ 15,99 / 125.000 COP. "code": 15,99 USD / 125.000 COP. */
  unit?: "symbol" | "code";
  /** Antepone "≈ " (solo en totales y líneas de detalle, spec §4.2). */
  approx?: boolean;
};

/** Importe con su unidad según las reglas de la spec. */
export function formatMoney(
  minor: number,
  currency: CurrencyCode,
  locale: Locale,
  { unit = "symbol", approx = false }: MoneyOptions = {},
): string {
  const sign = minor < 0 ? "-" : "";
  const amount = formatAmount(Math.abs(minor), currency, locale);
  const text =
    unit === "symbol" && currency === "USD"
      ? `${sign}US$${NBSP}${amount}`
      : `${sign}${amount}${NBSP}${currency}`;
  return approx ? `≈${NBSP}${text}` : text;
}

/** Formatos de fecha usados en la UI. */
const DATE_STYLES = {
  /** "16 de oct" / "Oct 16" */
  short: { month: "short", day: "numeric" },
  /** "octubre de 2026" / "October 2026" */
  monthYear: { month: "long", year: "numeric" },
  /** "sáb, 17 de oct" / "Sat, Oct 17" */
  weekdayShort: { weekday: "short", month: "short", day: "numeric" },
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
