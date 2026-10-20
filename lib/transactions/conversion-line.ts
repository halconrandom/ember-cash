/**
 * Qué mostrar bajo el monto del modal de transacción (fase E2 §3):
 * - "same": la moneda del monto ya es la elegida; línea neutra, sin tasa.
 * - "unavailable": no hay tasa para el par; nunca se inventa un número.
 * - "rateOnly": el campo está vacío; se muestra la tasa sola (nunca "≈ 0").
 * - "amount": el monto convertido a la moneda elegida, con su tasa.
 * Función pura: la UI decide el texto exacto y el formato.
 */
import type { CurrencyCode } from "@/lib/db/types";
import { convert, latestRateFor, type Rate } from "@/lib/money/convert";
import type { Money } from "@/lib/money/money";

export type ConversionLine =
  | { kind: "same" }
  | { kind: "unavailable" }
  | { kind: "rateOnly"; rate: Rate }
  | { kind: "amount"; value: Money; rate: Rate };

export function resolveConversionLine(params: {
  /** true si el campo de monto está vacío (no "0" escrito, sin nada). */
  amountEmpty: boolean;
  /** Monto ya parseado (0n si el texto no es válido todavía). */
  amount: Money;
  currency: CurrencyCode;
  displayCurrency: CurrencyCode;
  rates: readonly Rate[];
}): ConversionLine {
  const { amountEmpty, amount, currency, displayCurrency, rates } = params;
  if (currency === displayCurrency) return { kind: "same" };
  const rate = latestRateFor(rates, currency, displayCurrency);
  if (!rate) return { kind: "unavailable" };
  if (amountEmpty) return { kind: "rateOnly", rate };
  return { kind: "amount", value: convert(amount, displayCurrency, rate), rate };
}
