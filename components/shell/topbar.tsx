"use client";

/**
 * Topbar de 72 px (01/02-*.png): título (Title 1) y subtítulo a la izquierda;
 * a la derecha, el chip de tasa, el selector de mes (en rutas mensuales), el
 * selector COP/USD y la acción principal de la ruta.
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { DisplayCurrencyToggle } from "@/components/money/display-currency-toggle";
import { LiveRateChip } from "@/components/money/live-rate-chip";
import { Button } from "@/components/ui/button";
import { withFilters } from "@/lib/transactions/filters";

import { MonthSelector } from "./month-selector";
import { PAGE_TITLES } from "./nav";
import { useTopbar } from "./topbar-context";

export function Topbar() {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const t = useTranslations();
  const { subtitle, actionHidden } = useTopbar();
  const page = PAGE_TITLES[pathname];
  const subtitleText = subtitle ?? (page?.subtitle ? t(`pages.${page.subtitle}`) : null);

  return (
    <header className="flex min-h-[72px] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 lg:px-8">
      <div className="min-w-0">
        <h1 className="text-title1 text-ink">
          {page ? t(`nav.${page.title}`) : t("common.appName")}
        </h1>
        {subtitleText && <p className="text-body text-ink-2 mt-0.5">{subtitleText}</p>}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <LiveRateChip />
        {page?.month && <MonthSelector />}
        <DisplayCurrencyToggle />
        {page?.action && !actionHidden && (
          <Button
            icon="plus"
            onClick={() =>
              router.push(`${pathname}${withFilters(params, { [page.action!.param]: "new" })}`, {
                scroll: false,
              })
            }
          >
            {t(page.action.label)}
          </Button>
        )}
      </div>
    </header>
  );
}
