"use client";

/**
 * Topbar de 72 px: título (Title 1) y subtítulo de la ruta actual, y a la
 * derecha el chip de tasa y el selector COP/USD (01-dashboard.png). El
 * selector de mes y el botón primario llegan con cada pantalla.
 */
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { DisplayCurrencyToggle } from "@/components/money/display-currency-toggle";
import { LiveRateChip } from "@/components/money/live-rate-chip";

import { PAGE_TITLES } from "./nav";

export function Topbar() {
  const pathname = usePathname();
  const t = useTranslations();
  const page = PAGE_TITLES[pathname];

  return (
    <header className="flex min-h-[72px] items-center justify-between gap-6 px-4 py-3 lg:px-8">
      <div className="min-w-0">
        <h1 className="text-title1 text-ink">
          {page ? t(`nav.${page.title}`) : t("common.appName")}
        </h1>
        {page?.subtitle && (
          <p className="text-body text-ink-2 mt-0.5">{t(`pages.${page.subtitle}`)}</p>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <LiveRateChip />
        <DisplayCurrencyToggle />
      </div>
    </header>
  );
}
