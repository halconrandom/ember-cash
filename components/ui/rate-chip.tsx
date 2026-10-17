"use client";

/**
 * Chip de tasa de cambio (DESIGN_SPEC §4.9, 19-states.png). Solo presenta:
 * quien lo usa decide el estado y pasa el texto.
 * - fresh: neutro, con fecha y badge SAMPLE.
 * - stale: ámbar, reloj, fecha vieja y badge "Stale"; clic refresca.
 * - updating: "Updating rate..." con el mismo ancho.
 * - error: rojo, "Rate unavailable" y acción Retry.
 */
import { cn } from "@/lib/utils";

import { Badge } from "./chip";
import { Icon } from "./icon";

export type RateChipState = "fresh" | "stale" | "updating" | "error";

type Props = {
  state: RateChipState;
  /** "1 USD = 4,000 COP" */
  rate: string;
  /** "Oct 16" */
  asOf: string;
  /** Muestra el badge SAMPLE (datos de ejemplo). */
  sample?: boolean;
  onRefresh?: () => void;
  className?: string;
};

const BASE = "inline-flex h-10 items-center gap-2 rounded-full px-4 text-body whitespace-nowrap";

export function RateChip({ state, rate, asOf, sample = false, onRefresh, className }: Props) {
  if (state === "updating") {
    return (
      <span
        role="status"
        className={cn(BASE, "border-border bg-surface text-ink border", className)}
      >
        <Icon name="refresh" size={18} className="animate-spin-slow" />
        <span className="font-semibold">Updating rate...</span>
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
        <span className="font-semibold">Rate unavailable</span>
        <button
          type="button"
          onClick={onRefresh}
          className="bg-surface text-callout text-negative-text inline-flex h-7 items-center gap-1 rounded-full px-2.5 font-medium"
        >
          <Icon name="refresh" size={14} />
          Retry
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
        as of {asOf}
      </span>
      {stale ? (
        <Badge tone="warning" className="bg-surface font-semibold">
          Stale
        </Badge>
      ) : sample ? (
        <Badge tone="ember" className="font-semibold uppercase">
          Sample
        </Badge>
      ) : (
        <span className="pr-2.5" />
      )}
    </button>
  );
}
