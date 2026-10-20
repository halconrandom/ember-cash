"use client";

/**
 * Topbar. En escritorio (≥1024 px) es la fila de 72 px: título, chip de tasa,
 * mes, COP/USD y la acción con texto. Por debajo
 * (docs/Phone/ember-cash-mobile-1-frames/m02 y m03, y t01) el título queda
 * con el selector de moneda y el "+" circular; la tasa va en una fila propia
 * y el mes en otra. Personal/Compartido no vive aquí: en el teléfono y la
 * tablet solo aparece dentro de Hogar.
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { HelpPanel } from "@/components/help/help-panel";
import { HelpTriggerButton } from "@/components/help/help-trigger-button";
import { DisplayCurrencyToggle } from "@/components/money/display-currency-toggle";
import { LiveRateChip } from "@/components/money/live-rate-chip";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { recordEvent } from "@/lib/events/record";
import { hasHelp } from "@/lib/help/content";
import { hasSeenHelp, markHelpSeen } from "@/lib/help/seen";
import { withFilters } from "@/lib/transactions/filters";

import { MonthSelector } from "./month-selector";
import { PAGE_TITLES } from "./nav";
import { openTransactionSearch } from "./search-event";
import { useTopbar } from "./topbar-context";

export function Topbar() {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const t = useTranslations();
  const { subtitle, actionHidden } = useTopbar();
  const page = PAGE_TITLES[pathname];
  const subtitleText = subtitle ?? (page?.subtitle ? t(`pages.${page.subtitle}`) : null);
  const actionLabel = page?.action ? t(page.action.label) : null;
  const helpPage = page?.title && hasHelp(page.title) ? page.title : null;
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpSeen, setHelpSeen] = useState(() => (helpPage ? hasSeenHelp(helpPage) : true));
  // El punto de "ayuda nueva" y el panel abierto son por página: si la ruta
  // cambió desde el último render, se recalculan ahora (patrón de React
  // para ajustar estado derivado de una prop, en vez de un efecto aparte).
  const [trackedPathname, setTrackedPathname] = useState(pathname);
  if (pathname !== trackedPathname) {
    setTrackedPathname(pathname);
    setHelpOpen(false);
    setHelpSeen(helpPage ? hasSeenHelp(helpPage) : true);
  }

  // Tecla "?" abre la ayuda, salvo con el foco en un campo de escritura.
  useEffect(() => {
    if (!helpPage) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "?") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable='true']")) return;
      event.preventDefault();
      setHelpOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [helpPage]);

  function openHelp() {
    setHelpOpen(true);
    if (!helpPage) return;
    markHelpSeen(helpPage);
    setHelpSeen(true);
    void recordEvent("help_opened", { page: helpPage });
  }

  function openAction() {
    if (!page?.action) return;
    router.push(`${pathname}${withFilters(params, { [page.action.param]: "new" })}`, {
      scroll: false,
    });
  }

  return (
    <header className="shell-topbar bar-material border-border flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3 lg:min-h-[72px] lg:flex-nowrap lg:border-0 lg:px-8">
      <div className="order-1 flex min-w-0 flex-1 items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-title1 text-ink">
            {page ? t(`nav.${page.title}`) : t("common.appName")}
          </h1>
          {subtitleText && <p className="text-body text-ink-2 mt-0.5">{subtitleText}</p>}
        </div>
        {helpPage && (
          <HelpTriggerButton onOpen={openHelp} showDot={!helpSeen} className="shrink-0 lg:hidden" />
        )}
      </div>

      <div className="order-2 flex shrink-0 items-center gap-2 lg:order-4">
        {helpPage && (
          <HelpTriggerButton
            onOpen={openHelp}
            showDot={!helpSeen}
            className="hidden lg:inline-flex"
          />
        )}
        <DisplayCurrencyToggle />
        {page?.action && !actionHidden && actionLabel && (
          <>
            <Button
              icon="plus"
              aria-label={actionLabel}
              className="size-11 px-0 lg:hidden"
              onClick={openAction}
            />
            <Button icon="plus" className="hidden lg:inline-flex" onClick={openAction}>
              {actionLabel}
            </Button>
          </>
        )}
      </div>

      {/* En tablet el chip muestra solo el número (t01: "4,000 · as of …"). */}
      <div className="order-3 w-full overflow-x-auto lg:order-2 lg:w-auto">
        <LiveRateChip />
      </div>

      {page?.month && (
        <div className="order-4 flex min-h-11 w-full items-center justify-between gap-2 lg:order-3 lg:w-auto">
          <MonthSelector />
          {pathname === "/transactions" && (
            <button
              type="button"
              onClick={openTransactionSearch}
              aria-label={t("transactions.searchLabel")}
              className="text-ink-2 hover:bg-surface2 hover:text-ink grid size-11 shrink-0 place-items-center rounded-full lg:hidden"
            >
              <Icon name="search" />
            </button>
          )}
        </div>
      )}
      {helpPage && (
        <HelpPanel page={helpPage} open={helpOpen} onClose={() => setHelpOpen(false)} />
      )}
    </header>
  );
}
