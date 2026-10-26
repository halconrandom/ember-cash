"use client";

/**
 * Monto según las reglas de moneda (fase E2, DESIGN_SPEC §4):
 *
 * - variant="row" (filas de listas): la cifra principal va en displayCurrency;
 *   si la moneda original difiere, debajo va "original € 12,50" (sin "≈") con
 *   una insignia neutra del código original. El equivalente se calcula con la
 *   tasa de exchange_rates de la fecha del movimiento (`date`); sin `date` se
 *   usa la más reciente. Si falta esa tasa, el original queda como principal
 *   y la línea dice "Tasa no disponible": nunca 0 ni un número inventado.
 * - variant="total" (totales, tarjetas hero): `value` ya está en
 *   displayCurrency (lo convierte quien suma, con `sumIn`/`monthTotals`...).
 *   Sin línea de conversión; si se pasa `breakdown` (los importes de origen
 *   que se sumaron) y alguno no está en displayCurrency, un texto pequeño
 *   "Convertido con tasas del día" abre el desglose por moneda al tocarlo.
 *
 * Con COP, el número va en negrita y "COP" detrás, más pequeño
 * (02-transactions.png). `sign` antepone "+" o "-" (ingreso/gasto) y
 * `positive` lo pinta de verde.
 *
 * Estados de la tasa (de <RateProvider>):
 * - actualizando: las líneas convertidas bajan al 60 % y no se mueven.
 * - vieja: lo convertido lleva el tooltip "tasa del 9 de oct".
 * - error: el original queda como principal (nunca un número viejo).
 */
import { motion } from "motion/react";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/chip";
import { Modal } from "@/components/ui/modal";
import { NumberTicker } from "@/components/ui/number-ticker";
import { Tooltip } from "@/components/ui/tooltip";
import { useFormat } from "@/lib/i18n/use-format";
import { convert, isStale, latestRateFor, rateAt } from "@/lib/money/convert";
import { money, type Money } from "@/lib/money/money";
import { cn } from "@/lib/utils";

import { useRate } from "./rate-provider";

type Props = {
  value: Money;
  variant?: "row" | "total";
  /**
   * Fecha del movimiento (AAAA-MM-DD), solo variant="row": el equivalente se
   * calcula con la tasa vigente esa fecha. Sin fecha, se usa la más reciente.
   */
  date?: string;
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
  /**
   * Number Ticker (solo variant="total"): el importe cuenta desde 0 al
   * aparecer. Se pasa true solo en la primera carga de la pantalla (useFirstView).
   */
  ticker?: boolean;
  /**
   * variant="total": los importes de origen que se sumaron en `value`, para
   * el desglose del sheet ("Convertido con tasas del día").
   */
  breakdown?: readonly Money[];
  /**
   * variant="total" en tarjetas angostas (de a dos en el teléfono): el monto
   * ocupa el ancho de la tarjeta y es contenedor de sus utilidades fluidas
   * (text-amount-fit / text-amount-l-fit, en cqi). El número nunca se parte,
   * pero "COP" y el sufijo bajan de línea antes que salirse de la tarjeta.
   */
  fit?: boolean;
};

export function MoneyAmount({
  value,
  variant = "row",
  date,
  sign,
  positive,
  suffix,
  insideInteractive,
  className,
  primaryClassName,
  secondaryClassName,
  unitClassName,
  suffixClassName,
  ticker,
  breakdown,
  fit,
}: Props) {
  const { rates, status, now, displayCurrency } = useRate();
  const t = useTranslations("money");
  const f = useFormat();
  const [open, setOpen] = useState(false);

  const dim = status === "updating" ? "opacity-60" : "";
  const secondaryClass = cn("text-footnote text-ink-3 tabular-nums", secondaryClassName);

  /** Importe principal: número (y unidad COP más pequeña). */
  const primary = (m: Money, extra?: string, tick?: boolean) => {
    const { main, unit } = f.moneyParts(m);
    // Nunca "cuenta" al cambiar de moneda de visualización (DESIGN_SPEC
    // §4.11): un cross-fade de 150 ms (solo opacidad; MotionConfig
    // reducedMotion="user" ya la quita con movimiento reducido), en vez del
    // conteo de <NumberTicker> (que sigue siendo solo para la primera carga).
    const number =
      tick !== undefined ? (
        <NumberTicker
          value={Number(m.amountMinor)}
          format={(n) => f.moneyParts(money(BigInt(n), m.currency)).main}
          animate={tick}
        />
      ) : (
        <motion.span
          key={main}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
          className="inline-block"
        >
          {main}
        </motion.span>
      );
    if (fit) {
      // Signo y número juntos (nunca se parten). Entre el número y "COP" (o
      // el sufijo) va un espacio normal, no el no separable de abajo, para
      // que la unidad pueda bajar de línea antes que salirse de la tarjeta.
      return (
        <span
          className={cn(
            "tabular-nums",
            positive ? "text-positive-text" : "text-ink",
            primaryClassName,
            extra,
          )}
        >
          <span className="whitespace-nowrap">
            {sign}
            {number}
          </span>
          {unit && (
            <>
              {" "}
              <span
                className={cn(
                  "text-callout text-ink-3 font-normal whitespace-nowrap",
                  unitClassName,
                )}
              >
                {unit}
              </span>
            </>
          )}
          {suffix && (
            <>
              {" "}
              <span className={cn("whitespace-nowrap", suffixClassName)}>{suffix}</span>
            </>
          )}
        </span>
      );
    }
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
        {number}
        {/* Espacio no separable real (no solo margen): el texto se lee bien. */}
        {unit && (
          <span className={cn("text-callout text-ink-3 font-normal", unitClassName)}>
            {` ${unit}`}
          </span>
        )}
        {suffix && <span className={suffixClassName}>{` ${suffix}`}</span>}
      </span>
    );
  };

  if (variant === "total") {
    const foreign = (breakdown ?? []).filter((m) => m.currency !== value.currency);
    return (
      <span
        className={cn(
          // Con fit, bloque a todo el ancho y contenedor (cqi) del monto fluido.
          fit ? "@container flex w-full min-w-0 flex-col" : "inline-flex flex-col",
          className,
        )}
      >
        {primary(value, undefined, ticker)}
        {foreign.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className={cn(secondaryClass, dim, "text-left underline-offset-2 hover:underline")}
            >
              {t("convertedToday")}
            </button>
            <Modal
              open={open}
              onClose={() => setOpen(false)}
              title={t("breakdownTitle")}
              closeLabel={t("close")}
            >
              <ul className="divide-border divide-y">
                {(breakdown ?? []).map((m, i) => {
                  const rate =
                    m.currency === value.currency
                      ? null
                      : latestRateFor(rates, m.currency, value.currency);
                  return (
                    <li key={i} className="flex items-center justify-between gap-3 py-3">
                      <span className="text-body text-ink">{f.money(m)}</span>
                      <span className="text-callout text-ink-2 tabular-nums">
                        {m.currency === value.currency
                          ? "—"
                          : rate
                            ? t("detail", {
                                amount: f.money(convert(m, value.currency, rate)),
                                rate: f.number(Number(rate.rate), 2),
                                date: f.date(rate.asOf),
                              })
                            : t("rateUnavailable")}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Modal>
          </>
        )}
      </span>
    );
  }

  const differs = value.currency !== displayCurrency;
  const rate =
    !differs || status === "error"
      ? null
      : date
        ? rateAt(rates, value.currency, displayCurrency, date)
        : latestRateFor(rates, value.currency, displayCurrency);
  const unavailable = differs && !rate;
  const shown = rate ? convert(value, displayCurrency, rate) : value;
  const staleTitle = rate && isStale(rate, now) ? t("rateFrom", { date: f.date(rate.asOf) }) : null;

  // Sin tasa: el original sigue como principal y la línea dice "Tasa no disponible".
  if (unavailable) {
    return (
      <span className={cn("inline-flex flex-col items-end", className)}>
        {primary(value)}
        <span className={secondaryClass}>{t("rateUnavailable")}</span>
      </span>
    );
  }

  if (!differs) {
    return (
      <span className={cn("inline-flex flex-col items-end", className)}>{primary(value)}</span>
    );
  }

  // Convertido a la moneda elegida: original e insignia debajo, sin "≈".
  const detail = t("detail", {
    amount: f.money(value),
    rate: f.number(Number(rate!.rate), 2),
    date: f.date(rate!.asOf),
  });
  return (
    <span className={cn("inline-flex flex-col items-end", className)}>
      <Tooltip content={staleTitle ?? detail}>
        <span tabIndex={insideInteractive ? undefined : 0}>{primary(shown, dim)}</span>
      </Tooltip>
      <span className={cn(secondaryClass, "inline-flex items-center gap-1.5")}>
        {t("original", { amount: f.money(value) })}
        <Badge size="sm">{value.currency}</Badge>
      </span>
    </span>
  );
}
