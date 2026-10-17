"use client";

/**
 * Chip de tasa de cambio (DESIGN_SPEC §4.9, 19-states.png). Solo presenta:
 * quien lo usa decide el estado y pasa los textos ya formateados.
 * - fresh: neutro, con la fecha.
 * - stale (más de 24 h): ámbar, reloj, fecha vieja y badge "Desactualizada";
 *   un clic refresca.
 * - updating: "Actualizando tasa..." conservando el ancho que tenía el chip,
 *   para que nada se mueva.
 * - error: rojo, "Tasa no disponible" y acción Reintentar. Si hay una última
 *   tasa conocida, queda en el tooltip.
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
  /** Texto de la tasa, ya formateado ("1 USD = 3.174,67 COP"). */
  rate?: string;
  /**
   * Misma tasa, solo el número. Se ve entre 600 y 1023 px
   * (docs/Phone/ember-cash-mobile-1-frames/t01: "4,000 · as of …").
   */
  rateShort?: string;
  /** Fecha de la tasa, ya formateada ("17 de oct"). */
  asOf?: string;
  /** Refrescar (clic en "stale") o reintentar (botón en "error"). */
  onRefresh?: () => void;
  className?: string;
};

const BASE =
  "inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-body whitespace-nowrap";

export function RateChip({ state, rate, rateShort, asOf, onRefresh, className }: Props) {
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
        {rateShort ? (
          <>
            <span className="min-[600px]:max-lg:hidden">{rate}</span>
            <span className="hidden min-[600px]:inline lg:hidden">{rateShort}</span>
          </>
        ) : (
          rate
        )}
      </span>
      <span className={cn("text-callout", state === "stale" ? "text-amber-text" : "text-ink-2")}>
        {t("asOf", { date: asOf ?? "" })}
      </span>
    </>
  );

  if (state === "stale") {
    return (
      <button
        ref={ref as React.RefObject<HTMLButtonElement>}
        type="button"
        data-state="stale"
        onClick={onRefresh}
        className={cn(BASE, "border-amber bg-amber-tint border-[1.5px] pr-1.5", className)}
      >
        {content}
        <Badge tone="warning" className="bg-surface font-semibold">
          {t("stale")}
        </Badge>
        <span className="sr-only">{t("refreshLabel")}</span>
      </button>
    );
  }

  return (
    <span
      ref={ref}
      data-state="fresh"
      className={cn(BASE, "border-border bg-surface border", className)}
    >
      {content}
    </span>
  );
}
