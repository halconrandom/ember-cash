/**
 * Formato de dinero segun DESIGN_SPEC Seccion 4 y el idioma:
 * - Decimales segun la moneda (COP 0, USD y EUR 2), nunca segun el idioma.
 * - Separadores segun el idioma (es: 125.000 / 15,99; en: 125,000 / 15.99).
 * - Unidad "symbol" (por defecto): US$/€ delante, COP detras.
 *   Unidad "code" (modal de transaccion): el codigo detras ("31,25 USD").
 * - "approx" (≈) solo cuando se pide (totales y lineas de detalle).
 * El formateo es exacto para cualquier tamano: la parte entera se formatea
 * como bigint y los decimales se pegan como texto, sin pasar por floats.
 * Entre numero y unidad va un espacio que no se parte.
 */
import type { CurrencyCode } from "@/lib/db/types";
import { INTL_TAGS, type Locale } from "@/lib/i18n/config";

import { exponentOf, scaleOf, type Money } from "./money";

const NBSP = " ";

/** Monedas que llevan su símbolo delante del número, como USD. */
const PREFIX_SYMBOL: Partial<Record<CurrencyCode, string>> = { USD: "US$", EUR: "€" };

/** Separador decimal del idioma ("," en es, "." en en). */
function decimalSeparator(locale: Locale): string {
  return (
    new Intl.NumberFormat(INTL_TAGS[locale]).formatToParts(1.5).find((p) => p.type === "decimal")
      ?.value ?? "."
  );
}

/** Importe sin unidad ni signo de moneda: "125.000", "15,99", "-18.500". */
export function formatAmount(m: Money, locale: Locale): string {
  const exponent = exponentOf(m.currency);
  const negative = m.amountMinor < 0n;
  const abs = negative ? -m.amountMinor : m.amountMinor;
  const scale = scaleOf(m.currency);
  const integer = new Intl.NumberFormat(INTL_TAGS[locale], { useGrouping: true }).format(
    abs / scale,
  );
  const fraction =
    exponent > 0 ? decimalSeparator(locale) + (abs % scale).toString().padStart(exponent, "0") : "";
  return `${negative ? "-" : ""}${integer}${fraction}`;
}

export type MoneyFormatOptions = {
  unit?: "symbol" | "code";
  approx?: boolean;
};

/** Importe con su unidad: "US$ 15,99", "€ 12,50", "125.000 COP". */
export function formatMoney(
  m: Money,
  locale: Locale,
  { unit = "symbol", approx = false }: MoneyFormatOptions = {},
): string {
  const negative = m.amountMinor < 0n;
  const amount = formatAmount(negative ? { ...m, amountMinor: -m.amountMinor } : m, locale);
  const sign = negative ? "-" : "";
  const symbol = unit === "symbol" ? PREFIX_SYMBOL[m.currency] : undefined;
  const text = symbol
    ? `${sign}${symbol}${NBSP}${amount}`
    : `${sign}${amount}${NBSP}${m.currency}`;
  return approx ? `≈${NBSP}${text}` : text;
}

/**
 * Partes del importe para darles estilos distintos (02-transactions.png):
 * con COP el numero va en negrita y la unidad "COP" detras, mas chica;
 * con USD/EUR el simbolo va delante y en la misma negrita que el numero.
 */
export function formatMoneyParts(m: Money, locale: Locale): { main: string; unit: string | null } {
  const negative = m.amountMinor < 0n;
  const amount = formatAmount(negative ? { ...m, amountMinor: -m.amountMinor } : m, locale);
  const sign = negative ? "-" : "";
  const symbol = PREFIX_SYMBOL[m.currency];
  return symbol
    ? { main: `${sign}${symbol}${NBSP}${amount}`, unit: null }
    : { main: `${sign}${amount}`, unit: m.currency };
}
