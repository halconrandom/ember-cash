"use client";

/**
 * Monto según las reglas de moneda (DESIGN_SPEC §4):
 *
 * - kind="row" (filas de listas): primero el importe en la moneda elegida,
 *   sin "≈"; si la moneda original es otra, debajo "original US$ 2,99". Al
 *   pasar el mouse, el tooltip muestra el equivalente con su tasa y fecha.
 * - kind="total" (totales, tarjetas, detalle): `value` ya está en la moneda
 *   elegida; debajo, "≈" con el equivalente en la otra moneda.
 *
 * Con COP, el número va en negrita y "COP" detrás, más pequeño
 * (02-transactions.png). `sign` antepone "+" o "-" (ingreso/gasto) y
 * `positive` lo pinta de verde.
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
  /** Signo de ingreso (+) o gasto (-). El importe se pasa en positivo. */
  sign?: "+" | "-";
  /** Verde (ingresos). */
  positive?: boolean;
  /** Texto después del importe y de su equivalente ("/mes"). */
  suffix?: string;
  /**
   * Si el monto está dentro de un elemento clicable (una fila-botón), el
   * tooltip se abre con el hover de la fila y no agrega otro foco.
   */
  insideInteractive?: boolean;
  className?: string;
  /** Clases del importe principal (tamaño de la escala tipográfica). */
  primaryClassName?: string;
  /** Clases de la línea secundaria (por defecto Footnote 12). */
  secondaryClassName?: string;
  /** Clases de la unidad "COP" (por defecto ink-3; en el hero, blanco). */
  unitClassName?: string;
  /** Clases del sufijo ("/mes"); por defecto, el mismo estilo del importe. */
  suffixClassName?: string;
};

export function MoneyAmount({
  value,
  kind = "row",
  sign,
  positive,
  suffix,
  insideInteractive,
  className,
  primaryClassName,
  secondaryClassName,
  unitClassName,
  suffixClassName,
}: Props) {
  const { rate, status, now, displayCurrency } = useRate();
  const t = useTranslations("money");
  const f = useFormat();

  const unavailable = status === "error" || !rate;
  const dim = status === "updating" ? "opacity-60" : "";
  const staleTitle = rate && isStale(rate, now) ? t("rateFrom", { date: f.date(rate.asOf) }) : null;
  const secondaryClass = cn("text-footnote text-ink-3 tabular-nums", secondaryClassName);

  /** Importe principal: número (y unidad COP más pequeña). */
  const primary = (m: Money, extra?: string) => {
    const { main, unit } = f.moneyParts(m);
    return (
      <span
        className={cn(
          "whitespace-nowrap tabular-nums",
          positive ? "text-positive-text" : "text-ink",
          primaryClassName,
          extra,
        )}
      >
        {sign}
        {main}
        {/* Espacio no separable real (no solo margen): el texto se lee bien. */}
        {unit && (
          <span className={cn("text-callout text-ink-3 font-normal", unitClassName)}>
            {` ${unit}`}
          </span>
        )}
        {suffix && <span className={suffixClassName}>{`\u00A0${suffix}`}</span>}
      </span>
    );
  };

  if (kind === "total") {
    const other = otherCurrency(value.currency);
    const convertedText = unavailable
      ? t("rateUnavailable")
      : `${f.money(convert(value, other, rate), { approx: true })}${suffix ? ` ${suffix}` : ""}`;
    return (
      <span className={cn("inline-flex flex-col", className)}>
        {primary(value)}
        <span className={cn(secondaryClass, dim)}>
          {staleTitle && !unavailable ? (
            <Tooltip content={staleTitle}>
              <span tabIndex={0}>{convertedText}</span>
            </Tooltip>
          ) : (
            convertedText
          )}
        </span>
      </span>
    );
  }

  const differs = value.currency !== displayCurrency;

  // Fila sin tasa: el original sigue como principal y no hay tooltip.
  if (unavailable) {
    return (
      <span className={cn("inline-flex flex-col items-end", className)}>
        {primary(value)}
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
        <span tabIndex={insideInteractive ? undefined : 0}>
          {primary(shown, differs ? dim : undefined)}
        </span>
      </Tooltip>
      {differs && (
        <span className={secondaryClass}>{t("original", { amount: f.money(value) })}</span>
      )}
    </span>
  );
}
