"use client";

/**
 * Chip de la topbar con las tasas reales (fase E2 §4: "las tasas hacia
 * displayCurrency con su fecha"). Hasta dos pares son relevantes (uno por
 * cada moneda que no sea la elegida); se listan juntos si caben y, si no
 * (rateShort), en el formato comprimido "N tasas · al {fecha}".
 *
 * Estado: error si no hay red o falta la tasa de alguno de los pares
 * relevantes; actualizando mientras se consulta; vieja si la más vieja de
 * las relevantes tiene más de 24 h; al día en otro caso.
 */
import { useTranslations } from "next-intl";

import { RateChip, type RateChipState } from "@/components/ui/rate-chip";
import { CURRENCY_CODES } from "@/lib/db/types";
import { useFormat } from "@/lib/i18n/use-format";
import { isStale, latestRateFor, type Rate } from "@/lib/money/convert";

import { useRate } from "./rate-provider";

export function LiveRateChip({ className }: { className?: string }) {
  const { rates, status, now, displayCurrency, refresh } = useRate();
  const t = useTranslations("rateChip");
  const f = useFormat();

  const relevant = CURRENCY_CODES.filter((c) => c !== displayCurrency)
    .map((c) => latestRateFor(rates, c, displayCurrency))
    .filter((r): r is Rate => r !== null);

  const state: RateChipState =
    status === "updating"
      ? "updating"
      : status === "error" || relevant.length === 0
        ? "error"
        : relevant.some((r) => isStale(r, now))
          ? "stale"
          : "fresh";

  const oldest =
    relevant.length === 0 ? undefined : relevant.reduce((a, b) => (b.asOf < a.asOf ? b : a));
  const lineFor = (r: Rate) =>
    t("pairRate", { base: r.base, value: f.number(Number(r.rate), 2), quote: r.quote });

  return (
    <RateChip
      state={state}
      rate={relevant.length > 0 ? relevant.map(lineFor).join(" · ") : undefined}
      rateShort={
        relevant.length === 0
          ? undefined
          : relevant.length === 1
            ? f.number(Number(relevant[0].rate), 2)
            : t("ratesCompact", { count: relevant.length })
      }
      asOf={oldest ? f.date(oldest.asOf) : undefined}
      onRefresh={refresh}
      className={className}
    />
  );
}
