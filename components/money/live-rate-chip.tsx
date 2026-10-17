"use client";

/**
 * Chip de la topbar con la tasa real. Decide el estado a partir de
 * <RateProvider>: error si no hay tasa o falló; actualizando mientras se
 * consulta; vieja si tiene más de 24 h; al día en otro caso.
 */
import { RateChip, type RateChipState } from "@/components/ui/rate-chip";
import { isStale } from "@/lib/money/convert";
import { useFormat } from "@/lib/i18n/use-format";
import { useTranslations } from "next-intl";

import { useRate } from "./rate-provider";

export function LiveRateChip({ className }: { className?: string }) {
  const { rate, status, now, refresh } = useRate();
  const t = useTranslations("rateChip");
  const f = useFormat();

  const state: RateChipState =
    status === "updating"
      ? "updating"
      : status === "error" || !rate
        ? "error"
        : isStale(rate, now)
          ? "stale"
          : "fresh";

  return (
    <RateChip
      state={state}
      rate={rate ? t("rate", { value: f.number(Number(rate.rate), 2) }) : undefined}
      asOf={rate ? f.date(rate.asOf) : undefined}
      onRefresh={refresh}
      className={className}
    />
  );
}
