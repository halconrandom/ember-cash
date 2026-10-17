"use client";

/**
 * Barra inferior del teléfono (<600 px). Medidas de
 * docs/Phone/ember-cash-mobile-1-frames/m01: 49 px de pestañas con etiqueta
 * de 12 px, píldora ember-50 de 56×28 detrás del ícono activo, y la zona del
 * home indicator en surface sólido (no esmerilado). Desde 600 px no se pinta.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

import { isTabActive, TAB_ITEMS } from "./nav";

export function TabBar() {
  const pathname = usePathname();
  const t = useTranslations();

  return (
    <nav aria-label={t("nav.label")} className="fixed inset-x-0 bottom-0 z-40 min-[600px]:hidden">
      <ul className="bar-material border-border flex min-h-[49px] border-t">
        {TAB_ITEMS.map((item) => {
          const active = isTabActive(item.href, pathname);
          return (
            <li key={item.href} className="min-w-0 flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className="press-scale flex h-full min-h-11 flex-col items-center justify-center gap-0.5"
              >
                <span
                  className={cn(
                    "grid h-7 w-14 place-items-center rounded-full",
                    active && "bg-ember-50",
                  )}
                >
                  {active ? (
                    <Icon name={item.icon} variant="solid" className="text-ember" />
                  ) : (
                    <Icon name={item.icon} className="text-ink-2" />
                  )}
                </span>
                <span
                  className={cn(
                    "text-footnote max-w-full px-0.5 text-center leading-tight",
                    active ? "text-ember-text font-semibold" : "text-ink-2 font-medium",
                  )}
                >
                  {t(`nav.${item.key}`)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {/* Los 34 px del home indicator van sólidos, no esmerilados (m01). */}
      <div aria-hidden className="bg-surface h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
