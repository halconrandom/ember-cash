/**
 * Formato de dinero según DESIGN_SPEC §4 y el idioma:
 * - Decimales según la moneda (COP 0, USD 2), nunca según el idioma.
 * - Separadores según el idioma (es: 125.000 / 15,99; en: 125,000 / 15.99).
 * - Unidad "symbol" (por defecto): US$ delante, COP detrás.
 *   Unidad "code" (modal de transacción, §4.8): el código detrás ("31,25 USD").
 * - "≈" solo cuando se pide (totales y líneas de detalle, §4.2).
 * El formateo es exacto para cualquier tamaño: la parte entera se formatea
 * como bigint y los decimales se pegan como texto, sin pasar por floats.
 * Entre número y unidad va un espacio que no se parte ( ).
 */
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
  unit?: "symbol" | "code";
  approx?: boolean;
};

/** Importe con su unidad: "US$ 15,99", "125.000 COP", "≈ US$ 840,00". */
export function formatMoney(
  m: Money,
  locale: Locale,
  { unit = "symbol", approx = false }: MoneyFormatOptions = {},
): string {
  const negative = m.amountMinor < 0n;
  const amount = formatAmount(negative ? { ...m, amountMinor: -m.amountMinor } : m, locale);
  const sign = negative ? "-" : "";
  const text =
    unit === "symbol" && m.currency === "USD"
      ? `${sign}US$${NBSP}${amount}`
      : `${sign}${amount}${NBSP}${m.currency}`;
  return approx ? `≈${NBSP}${text}` : text;
}

/**
 * Partes del importe para darles estilos distintos (02-transactions.png):
 * con COP el número va en negrita y la unidad "COP" detrás, más pequeña;
 * con USD el "US$" va delante y en la misma negrita que el número.
 */
export function formatMoneyParts(m: Money, locale: Locale): { main: string; unit: string | null } {
  const negative = m.amountMinor < 0n;
  const amount = formatAmount(negative ? { ...m, amountMinor: -m.amountMinor } : m, locale);
  const sign = negative ? "-" : "";
  return m.currency === "USD"
    ? { main: `${sign}US$${NBSP}${amount}`, unit: null }
    : { main: `${sign}${amount}`, unit: m.currency };
}
