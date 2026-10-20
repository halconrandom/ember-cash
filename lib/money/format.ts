/**
 * Formato de dinero segun DESIGN_SPEC Seccion 4 y el idioma (fase E4: 5
 * monedas, un solo formato para todas):
 * - Decimales segun la moneda (COP 0, USD/EUR/ARS/MXN 2), nunca segun el idioma.
 * - Separadores segun el idioma (es: 125.000 / 15,99; en: 125,000 / 15.99).
 * - El código ISO siempre va DESPUÉS del número ("20,00 USD", "125.000 COP"):
 *   ya no hay símbolo de moneda delante (US$/€); con 5 monedas un símbolo
 *   solo alcanzaría para un par y el código ya identifica a todas por igual.
 * - "approx" (≈) solo cuando se pide (totales y lineas de detalle).
 * El formateo es exacto para cualquier tamano: la parte entera se formatea
 * como bigint y los decimales se pegan como texto, sin pasar por floats.
 * Entre numero y unidad va un espacio que no se parte.
 */
import type { CurrencyCode } from "@/lib/db/types";
import { INTL_TAGS, type Locale } from "@/lib/i18n/config";

import { exponentOf, scaleOf, type Money } from "./money";

const NBSP = " ";

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
  approx?: boolean;
};

/** Importe con su código: "20,00 USD", "18,50 EUR", "15.000,00 ARS", "125.000 COP". */
export function formatMoney(
  m: Money,
  locale: Locale,
  { approx = false }: MoneyFormatOptions = {},
): string {
  const negative = m.amountMinor < 0n;
  const amount = formatAmount(negative ? { ...m, amountMinor: -m.amountMinor } : m, locale);
  const sign = negative ? "-" : "";
  const text = `${sign}${amount}${NBSP}${m.currency}`;
  return approx ? `≈${NBSP}${text}` : text;
}

/**
 * Partes del importe para darles estilos distintos (02-transactions.png):
 * el número en negrita y el código detrás, más chico y con peso normal.
 * Con `main`/`unit` separados así, quien pinta decide el tamaño de cada uno
 * (por ejemplo <MoneyAmount>).
 */
export function formatMoneyParts(m: Money, locale: Locale): { main: string; unit: CurrencyCode } {
  const negative = m.amountMinor < 0n;
  const amount = formatAmount(negative ? { ...m, amountMinor: -m.amountMinor } : m, locale);
  const sign = negative ? "-" : "";
  return { main: `${sign}${amount}`, unit: m.currency };
}
