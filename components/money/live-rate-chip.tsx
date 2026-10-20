"use client";

/**
 * Chip de la topbar con las tasas reales (fase E5, spec de Ivern): muestra
 * solo el par más usado hacia displayCurrency ("1 USD = X COP") y, si hay
 * más monedas activas con tasa, "+{n}" en acento suave. La fecha va en el
 * tooltip (o en "Tasas · 20 oct" bajo 600 px, en vez del tooltip).
 *
 * Un clic (fresh o stale) abre el popover/sheet "Tasas de hoy": una fila
 * por cada moneda activa (profiles.enabled_currencies) distinta de la
 * elegida, con su fuente y su hora propias (no un pie común) y, al final,
 * "Cambiar moneda de visualización" hacia Ajustes > Monedas.
 *
 * Estado: error si no hay red o falta la tasa de todos los pares activos;
 * actualizando mientras se consulta; vieja si la más vieja de las
 * relevantes tiene más de 24 h; al día en otro caso.
 */
import { Popover } from "@base-ui/react/popover";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { RateChip, type RateChipState } from "@/components/ui/rate-chip";
import { useFormat } from "@/lib/i18n/use-format";
import { isStale, latestRateFor, type Rate } from "@/lib/money/convert";

import { useRate } from "./rate-provider";

/** ¿Bajo 600 px? Mismo punto de corte que <CurrencyPicker>/<Modal>. */
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia("(max-width: 599px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 599px)");
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isMobile;
}

export function LiveRateChip({ className }: { className?: string }) {
  const { rates, status, now, displayCurrency, enabledCurrencies, refresh } = useRate();
  const t = useTranslations("rateChip");
  const f = useFormat();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);

  const relevant = enabledCurrencies
    .filter((c) => c !== displayCurrency)
    .map((c) => ({ currency: c, rate: latestRateFor(rates, c, displayCurrency) }))
    .filter((r): r is { currency: (typeof enabledCurrencies)[number]; rate: Rate } =>
      r.rate !== null,
    );

  const state: RateChipState =
    status === "updating"
      ? "updating"
      : status === "error" || relevant.length === 0
        ? "error"
        : relevant.some((r) => isStale(r.rate, now))
          ? "stale"
          : "fresh";

  const oldest =
    relevant.length === 0
      ? undefined
      : relevant.map((r) => r.rate).reduce((a, b) => (b.asOf < a.asOf ? b : a));
  const lineFor = (r: Rate) =>
    t("pairRate", { base: r.base, value: f.number(Number(r.rate), 2), quote: r.quote });
  // Las claves de i18n no admiten ".": "datos.gov.co" vive como "datos_gov_co".
  const sourceLabel = (source: string) => {
    const key = `source.${source.replace(/\./g, "_")}`;
    return t.has(key) ? t(key) : source;
  };

  const featured = relevant[0];

  return (
    <Popover.Root open={open} onOpenChange={setOpen} modal={isMobile ? "trap-focus" : false}>
      <span ref={anchorRef} className="inline-flex">
        <RateChip
          state={state}
          rate={featured ? lineFor(featured.rate) : undefined}
          more={Math.max(relevant.length - 1, 0)}
          asOf={oldest ? f.date(oldest.asOf) : undefined}
          mobileLabel={oldest ? t("mobileLabel", { date: f.compactDate(oldest.asOf) }) : undefined}
          onOpen={() => setOpen(true)}
          onRefresh={refresh}
          className={className}
        />
      </span>
      {relevant.length > 0 && (
        <Popover.Portal>
          {isMobile && <Popover.Backdrop className="fixed inset-0 z-50 min-h-dvh bg-[var(--scrim)]" />}
          <Popover.Positioner
            anchor={anchorRef}
            className="z-50 outline-none max-[599px]:!fixed max-[599px]:!inset-x-0 max-[599px]:!bottom-0 max-[599px]:!top-auto max-[599px]:!left-0 max-[599px]:!w-full max-[599px]:!transform-none"
            sideOffset={8}
            align="start"
          >
            <Popover.Popup
              className="rounded-modal border-card-edge bg-surface shadow-pop flex w-[320px] flex-col border max-[599px]:w-full max-[599px]:rounded-b-none max-[599px]:rounded-t-[28px] max-[599px]:pb-[env(safe-area-inset-bottom)] min-[600px]:rounded-card"
            >
              <div
                aria-hidden
                className="bg-border mx-auto mt-2 h-[5px] w-9 rounded-full max-[599px]:block min-[600px]:hidden"
              />
              <Popover.Title className="text-callout text-ink-2 px-4 pt-3 pb-1 font-semibold">
                {t("todayTitle")}
              </Popover.Title>
              <ul className="divide-divider divide-y px-4">
                {relevant.map(({ rate }) => (
                  <li key={rate.base + rate.quote} className="flex items-center justify-between gap-3 py-3">
                    <span className="text-body text-ink tabular-nums">{lineFor(rate)}</span>
                    <span className="text-callout text-ink-2 shrink-0">
                      {t("rowTime", { source: sourceLabel(rate.source), time: f.time(rate.fetchedAt) })}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="border-divider border-t px-4 py-3">
                <Link
                  href="/settings"
                  className="text-callout text-ember-text font-semibold hover:underline"
                >
                  {t("changeDisplayCurrency")}
                </Link>
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      )}
    </Popover.Root>
  );
}
