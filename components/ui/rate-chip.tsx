"use client";

/**
 * Chip de tasa de cambio (DESIGN_SPEC §4.9/§4.10, fase E5): solo presenta;
 * quien lo usa decide el estado y pasa los textos ya formateados.
 * - fresh: neutro. Un clic abre "Tasas de hoy" (onOpen).
 * - stale (más de 24 h): ámbar, reloj y badge "Desactualizada"; el clic
 *   también abre "Tasas de hoy" (ahí se puede actualizar).
 * - updating: "Actualizando tasa..." conservando el ancho que tenía el chip,
 *   para que nada se mueva.
 * - error: rojo, "Tasa no disponible" y acción Reintentar (onRefresh). Si
 *   hay una última tasa conocida, queda en el tooltip.
 *
 * Solo se muestra el par más usado hacia displayCurrency; si hay más,
 * "· +{more}" en acento suave. La fecha ya no va en el chip: vive en el
 * tooltip (escritorio) o en `mobileLabel` ("Tasas · 20 oct", bajo 600 px).
 */
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import { Badge } from "./chip";
import { Icon } from "./icon";
import { Tooltip } from "./tooltip";

export type RateChipState = "fresh" | "stale" | "updating" | "error";

type Props = {
  state: RateChipState;
  /** Texto de la tasa más usada, ya formateado ("1 USD = 3.174,67 COP"). */
  rate?: string;
  /** Cuántos pares más hay, además del mostrado (0 = no se muestra "+n"). */
  more?: number;
  /** Fecha de la tasa, ya formateada ("17 de oct"): va en el tooltip. */
  asOf?: string;
  /** "Tasas · 20 oct": reemplaza el contenido bajo 600 px. */
  mobileLabel?: string;
  /** Clic en fresh/stale: abre el popover o sheet "Tasas de hoy". */
  onOpen?: () => void;
  /** Reintentar (solo estado error). */
  onRefresh?: () => void;
  className?: string;
};

const BASE =
  "inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-body whitespace-nowrap";

export function RateChip({
  state,
  rate,
  more = 0,
  asOf,
  mobileLabel,
  onOpen,
  onRefresh,
  className,
}: Props) {
  const t = useTranslations("rateChip");
  const ref = useRef<HTMLElement>(null);
  const [width, setWidth] = useState<number | null>(null);

  // Recuerda el ancho de los estados con datos para conservarlo al actualizar
  // (spec §4.9: el chip no cambia de tamaño mientras consulta la tasa).
  useEffect(() => {
    const el = ref.current;
    if (state === "updating" || !el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.borderBoxSize?.[0]?.inlineSize ?? el.offsetWidth),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [state]);

  if (state === "updating") {
    return (
      <span
        ref={ref}
        role="status"
        data-state="updating"
        style={width ? { width } : undefined}
        className={cn(BASE, "border-border bg-surface text-ink justify-center border", className)}
      >
        <Icon name="refresh" size={18} className="animate-spin-slow" />
        <span className="font-semibold">{t("updating")}</span>
      </span>
    );
  }

  if (state === "error") {
    const chip = (
      <span
        ref={ref}
        data-state="error"
        className={cn(
          BASE,
          "border-negative bg-negative-tint text-ink border-[1.5px] pr-1.5",
          className,
        )}
      >
        <Icon name="info" size={18} className="text-negative-text" />
        <span className="font-semibold">{t("unavailable")}</span>
        <button
          type="button"
          onClick={onRefresh}
          className="bg-surface text-callout text-negative-text inline-flex h-7 items-center gap-1 rounded-full px-2.5 font-medium"
        >
          <Icon name="refresh" size={14} />
          {t("retry")}
        </button>
      </span>
    );
    // La última tasa conocida queda en el tooltip (spec §4.9).
    return rate && asOf ? (
      <Tooltip content={t("lastKnown", { rate, date: asOf })} side="bottom">
        {chip}
      </Tooltip>
    ) : (
      chip
    );
  }

  const content = (
    <>
      <Icon
        name={state === "stale" ? "clock" : "exchange"}
        size={18}
        className={state === "stale" ? "text-amber-text" : "text-ink-2"}
      />
      <span className="text-ink font-semibold tabular-nums">
        <span className={mobileLabel ? "max-[599px]:hidden" : undefined}>{rate}</span>
        {mobileLabel && <span className="min-[600px]:hidden">{mobileLabel}</span>}
      </span>
      {more > 0 && (
        <span className={cn("text-callout text-ember-text font-semibold", mobileLabel && "max-[599px]:hidden")}>
          {t("more", { count: more })}
        </span>
      )}
      {state === "stale" && (
        <Badge tone="warning" className="bg-surface font-semibold">
          {t("stale")}
        </Badge>
      )}
    </>
  );

  const chip = (
    <button
      ref={ref as React.RefObject<HTMLButtonElement>}
      type="button"
      data-state={state}
      onClick={onOpen}
      className={cn(
        BASE,
        state === "stale"
          ? "border-amber bg-amber-tint border-[1.5px] pr-1.5"
          : "border-border bg-surface border",
        className,
      )}
    >
      {content}
    </button>
  );

  return asOf ? (
    <Tooltip content={t("asOf", { date: asOf })} side="bottom">
      {chip}
    </Tooltip>
  ) : (
    chip
  );
}
