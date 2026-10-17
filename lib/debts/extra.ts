/**
 * Pago extra sugerido: el 15 % de los mínimos, redondeado hacia arriba a una
 * cifra significativa en unidades mayores (1.230.000 COP → 200.000;
 * US$ 307,50 → US$ 50). Nunca menos de una unidad mayor.
 */
import { money, scaleOf, type Money } from "@/lib/money/money";

export function suggestedExtra(minimums: Money): Money {
  const scale = scaleOf(minimums.currency);
  const major = (minimums.amountMinor * 15n) / 100n / scale;
  if (major <= 0n) return money(scale, minimums.currency);
  const step = 10n ** BigInt(major.toString().length - 1);
  const rounded = ((major + step - 1n) / step) * step;
  return money(rounded * scale, minimums.currency);
}
