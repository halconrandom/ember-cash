/**
 * Insignia neutra con el código de la moneda original ("USD"), junto al
 * nombre de un elemento cuya moneda difiere de la de visualización (spec
 * §4.3). Gris pizarra: el azul es de Transporte.
 */
import { Badge } from "@/components/ui/chip";
import type { CurrencyCode } from "@/lib/db/types";

export function CurrencyBadge({
  currency,
  displayCurrency,
}: {
  currency: CurrencyCode;
  displayCurrency: CurrencyCode;
}) {
  if (currency === displayCurrency) return null;
  return (
    <Badge tone="neutral" size="sm" className="font-semibold">
      {currency}
    </Badge>
  );
}
