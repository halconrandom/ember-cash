/**
 * Parseo de lo que el usuario escribe en un campo de monto, según su idioma.
 * - Acepta separadores de miles del idioma, espacios, "$", "US$" y el código.
 * - El separador decimal es el del idioma (es ",", en "."). Si el texto trae
 *   solo el otro separador y no puede ser de miles (p. ej. "15.99" en es con
 *   2 cifras al final), se toma como decimal para no castigar al usuario.
 * - Rechaza más decimales de los que admite la moneda (COP 0, USD 2).
 */
import type { CurrencyCode } from "@/lib/db/types";
import type { Locale } from "@/lib/i18n/config";

import { exponentOf, money, scaleOf, type Money } from "./money";

/** Máximo de 15 cifras enteras: cabe en bigint de Postgres con margen. */
const MAX_INTEGER_DIGITS = 15;

export type ParseError = "empty" | "invalid" | "tooManyDecimals" | "tooLarge" | "notPositive";
export type ParseResult = { ok: true; value: Money } | { ok: false; error: ParseError };

type ParseOptions = {
  /** Permite negativos (por defecto no: los importes se guardan > 0). */
  allowNegative?: boolean;
  /** Permite 0 (por defecto no). */
  allowZero?: boolean;
};

const SEPARATORS: Record<Locale, { decimal: string; group: string }> = {
  es: { decimal: ",", group: "." },
  en: { decimal: ".", group: "," },
};

export function parseMoney(
  input: string,
  currency: CurrencyCode,
  locale: Locale,
  { allowNegative = false, allowZero = false }: ParseOptions = {},
): ParseResult {
  let text = input.replace(/US\$|\$|COP|USD|\s| /gi, "");
  if (text === "") return { ok: false, error: "empty" };

  let negative = false;
  if (text.startsWith("-")) {
    negative = true;
    text = text.slice(1);
  }
  if (!/^[\d.,]+$/.test(text)) return { ok: false, error: "invalid" };

  const { decimal, group } = SEPARATORS[locale];
  // Si no aparece el decimal del idioma pero sí el otro separador una sola
  // vez y no forma un grupo de 3 cifras, el usuario quiso decir decimal.
  const otherOnce = text.split(group).length === 2 && !text.includes(decimal);
  const tail = otherOnce ? text.split(group)[1] : "";
  const useOtherAsDecimal = otherOnce && tail.length !== 3;

  const [rawInt, rawFrac = "", ...rest] = useOtherAsDecimal
    ? text.split(group)
    : text.split(decimal);
  if (rest.length > 0) return { ok: false, error: "invalid" };

  const groupSep = useOtherAsDecimal ? decimal : group;
  // Los separadores de miles deben separar grupos de 3 cifras.
  const groups = rawInt.split(groupSep);
  if (
    groups.some(
      (g, i) =>
        g === "" || (i > 0 && g.length !== 3) || (i === 0 && g.length > 3 && groups.length > 1),
    )
  ) {
    return { ok: false, error: "invalid" };
  }
  const integer = groups.join("");
  if (!/^\d*$/.test(rawFrac) || (integer === "" && rawFrac === ""))
    return { ok: false, error: "invalid" };

  const exponent = exponentOf(currency);
  const fraction = rawFrac.replace(/0+$/, "");
  if (fraction.length > exponent) return { ok: false, error: "tooManyDecimals" };
  if (integer.replace(/^0+/, "").length > MAX_INTEGER_DIGITS)
    return { ok: false, error: "tooLarge" };

  const minor =
    BigInt(integer || "0") * scaleOf(currency) + BigInt(fraction.padEnd(exponent, "0") || "0");
  const value = negative ? -minor : minor;

  if (value < 0n && !allowNegative) return { ok: false, error: "notPositive" };
  if (value === 0n && !allowZero) return { ok: false, error: "notPositive" };
  return { ok: true, value: money(value, currency) };
}
