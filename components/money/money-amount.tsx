"use client";

/**
 * Monto según las reglas de moneda (DESIGN_SPEC §4):
 *
 * - kind="row" (filas de listas): primero el importe en la moneda elegida,
 *   sin "≈"; si la moneda original es otra, debajo "original US$ 2,99". Al
 *   pasar el mouse, el tooltip muestra la conversión con su tasa y fecha.
 * - kind="total" (totales, tarjetas, detalle): `value` ya está en la moneda
 *   elegida; debajo, "≈" con el equivalente en la otra moneda.
 *
 * Estados de la tasa (de <RateProvider>):
 * - actualizando: las líneas convertidas bajan al 60 % y no se mueven.
 * - vieja: lo convertido lleva el tooltip "tasa del 9 de oct".
 * - error: el original queda como principal y lo convertido dice
 *   "tasa no disponible" (nunca un número viejo).
 */
import { useTranslations } from "next-intl";

import { Tooltip } from "@/components/ui/tooltip";
import { useFormat } from "@/lib/i18n/use-format";
import { convert, isStale, otherCurrency } from "@/lib/money/convert";
import type { Money } from "@/lib/money/money";
import { cn } from "@/lib/utils";

import { useRate } from "./rate-provider";

type Props = {
  value: Money;
  kind?: "row" | "total";
  className?: string;
  /** Clases del importe principal (tamaño de la escala tipográfica). */
  primaryClassName?: string;
};

export function MoneyAmount({ value, kind = "row", className, primaryClassName }: Props) {
  const { rate, status, now, displayCurrency } = useRate();
  const t = useTranslations("money");
  const f = useFormat();

  const unavailable = status === "error" || !rate;
  const dim = status === "updating" ? "opacity-60" : "";
  const staleTitle = rate && isStale(rate, now) ? t("rateFrom", { date: f.date(rate.asOf) }) : null;

  /** Envuelve lo convertido con el tooltip de tasa vieja, si aplica. */
  const converted = (node: React.ReactNode) =>
    staleTitle ? (
      <Tooltip content={staleTitle}>
        <span tabIndex={0}>{node}</span>
      </Tooltip>
    ) : (
      node
    );

  const secondaryClass = "text-footnote text-ink-3 tabular-nums";

  if (kind === "total") {
    const other = otherCurrency(value.currency);
    return (
      <span className={cn("inline-flex flex-col", className)}>
        <span className={cn("text-ink tabular-nums", primaryClassName)}>{f.money(value)}</span>
        <span className={cn(secondaryClass, dim)}>
          {unavailable
            ? t("rateUnavailable")
            : converted(f.money(convert(value, other, rate), { approx: true }))}
        </span>
      </span>
    );
  }

  // Fila sin tasa: el original sigue como principal y no hay tooltip.
  if (unavailable) {
    const differs = value.currency !== displayCurrency;
    return (
      <span className={cn("inline-flex flex-col items-end", className)}>
        <span className={cn("text-ink tabular-nums", primaryClassName)}>{f.money(value)}</span>
        {differs && <span className={secondaryClass}>{t("rateUnavailable")}</span>}
      </span>
    );
  }

  // Fila con tasa: importe en la moneda elegida y, si difiere, el original
  // debajo. El tooltip da el equivalente en la otra moneda con tasa y fecha.
  const shown = convert(value, displayCurrency, rate);
  const detail = t("detail", {
    amount: f.money(convert(shown, otherCurrency(displayCurrency), rate)),
    rate: f.number(Number(rate.rate), 2),
    date: f.date(rate.asOf),
  });
  return (
    <span className={cn("inline-flex flex-col items-end", className)}>
      <Tooltip content={staleTitle ?? detail}>
        <span
          tabIndex={0}
          className={cn("text-ink tabular-nums", primaryClassName, shown !== value && dim)}
        >
          {f.money(shown)}
        </span>
      </Tooltip>
      {value.currency !== displayCurrency && (
        <span className={secondaryClass}>{t("original", { amount: f.money(value) })}</span>
      )}
    </span>
  );
}
