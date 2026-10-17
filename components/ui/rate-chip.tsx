"use client";

/**
 * Chip de tasa de cambio (DESIGN_SPEC §4.9, 19-states.png). Solo presenta:
 * quien lo usa decide el estado y pasa el texto.
 * - fresh: neutro, con fecha y badge de ejemplo.
 * - stale: ámbar, reloj, fecha vieja y badge "Desactualizada"; clic refresca.
 * - updating: "Actualizando tasa..." con el mismo ancho.
 * - error: rojo, "Tasa no disponible" y acción Reintentar.
 */
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

import { Badge } from "./chip";
import { Icon } from "./icon";

export type RateChipState = "fresh" | "stale" | "updating" | "error";

type Props = {
  state: RateChipState;
  /** Texto de la tasa, ya formateado ("1 USD = 4.000 COP"). */
  rate: string;
  /** Fecha de la tasa, ya formateada ("16 de oct"). */
  asOf: string;
  /** Muestra el badge SAMPLE (datos de ejemplo). */
  sample?: boolean;
  onRefresh?: () => void;
  className?: string;
};

const BASE = "inline-flex h-10 items-center gap-2 rounded-full px-4 text-body whitespace-nowrap";

export function RateChip({ state, rate, asOf, sample = false, onRefresh, className }: Props) {
  const t = useTranslations("rateChip");
  if (state === "updating") {
    return (
      <span
        role="status"
        className={cn(BASE, "border-border bg-surface text-ink border", className)}
      >
        <Icon name="refresh" size={18} className="animate-spin-slow" />
        <span className="font-semibold">{t("updating")}</span>
      </span>
    );
  }

  if (state === "error") {
    return (
      <span
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
  }

  const stale = state === "stale";
  return (
    <button
      type="button"
      onClick={onRefresh}
      className={cn(
        BASE,
        stale
          ? "border-amber bg-amber-tint border-[1.5px] pr-1.5"
          : "border-border bg-surface border pr-1.5",
        className,
      )}
    >
      <Icon
        name={stale ? "clock" : "exchange"}
        size={18}
        className={stale ? "text-amber-text" : "text-ink-2"}
      />
      <span className="text-ink font-semibold tabular-nums">{rate}</span>
      <span className={cn("text-callout", stale ? "text-amber-text" : "text-ink-2")}>
        {t("asOf", { date: asOf })}
      </span>
      {stale ? (
        <Badge tone="warning" className="bg-surface font-semibold">
          {t("stale")}
        </Badge>
      ) : sample ? (
        <Badge tone="ember" className="font-semibold uppercase">
          {t("sample")}
        </Badge>
      ) : (
        <span className="pr-2.5" />
      )}
    </button>
  );
}
