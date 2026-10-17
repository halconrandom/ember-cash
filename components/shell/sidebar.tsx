"use client";

/**
 * Navegación lateral.
 * - <600 px: no se muestra. La barra inferior (tab-bar.tsx) ocupa su lugar
 *   (docs/Phone/ember-cash-mobile-1-frames/m01).
 * - 600–1023 px: rail de 96 px, ícono y etiqueta de 12 px, 7 destinos y
 *   Ajustes abajo (t01). Sin la píldora de fila completa.
 * - ≥1024 px: sidebar de 248 px del spec, con Highlight y la tarjeta del
 *   usuario. Solo uno de los dos está en el árbol de accesibilidad.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { LogoTile } from "@/components/brand/logo";
import { Highlight } from "@/components/ui/highlight";
import { Icon } from "@/components/ui/icon";
import type { IconName, SolidIconName } from "@/components/ui/icon-registry";
import { NavItem } from "@/components/ui/nav-item";
import { cn } from "@/lib/utils";

import { isActive, NAV_ITEMS } from "./nav";

export function Sidebar({ userCard }: { userCard: React.ReactNode }) {
  const pathname = usePathname();
  const t = useTranslations();
  const settingsActive = isActive("/settings", pathname);

  return (
    <aside className="hidden min-[600px]:sticky min-[600px]:top-0 min-[600px]:flex min-[600px]:h-dvh min-[600px]:flex-col">
      <div className="flex min-h-0 flex-1 flex-col px-2 pt-4 pb-3 lg:hidden">
        <Link
          href="/"
          aria-label={t("common.appName")}
          className="rounded-control mx-auto grid size-11 place-items-center"
        >
          <LogoTile size={36} label={t("common.appName")} />
        </Link>
        <nav aria-label={t("nav.label")} className="mt-4 flex min-h-0 flex-1 flex-col">
          <ul className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <RailLink
                  href={item.href}
                  icon={item.icon}
                  label={t(`nav.${item.key}`)}
                  active={isActive(item.href, pathname)}
                />
              </li>
            ))}
          </ul>
          <ul className="mt-auto">
            <li>
              <RailLink
                href="/settings"
                icon="settings"
                label={t("nav.settings")}
                active={settingsActive}
              />
            </li>
          </ul>
        </nav>
      </div>

      <div className="hidden min-h-0 flex-1 flex-col gap-4 px-4 pt-6 pb-4 lg:flex lg:gap-0 lg:pt-[30px] lg:pb-6">
        <Link href="/" className="rounded-control flex w-fit items-center gap-3 px-2">
          <LogoTile size={36} label={t("common.appName")} />
          <span className="text-brand text-ink">{t("common.appName")}</span>
        </Link>
        <nav aria-label={t("nav.label")} className="lg:mt-[30px]">
          {/* La píldora sigue al puntero y vuelve a la ruta activa (Highlight, spec §7). */}
          <Highlight
            value={NAV_ITEMS.find((item) => isActive(item.href, pathname))?.href ?? null}
            hover
          >
            <ul className="flex flex-col gap-1">
              {NAV_ITEMS.map((item) => (
                <li key={item.href}>
                  <NavItem
                    href={item.href}
                    icon={item.icon}
                    label={t(`nav.${item.key}`)}
                    active={isActive(item.href, pathname)}
                  />
                </li>
              ))}
            </ul>
          </Highlight>
        </nav>
        <div className="mt-auto">{userCard}</div>
      </div>
    </aside>
  );
}

/** Destino del rail: ícono con pastilla ember-50 si está activo, etiqueta debajo. */
function RailLink({
  href,
  icon,
  label,
  active,
}: {
  href: string;
  icon: IconName & SolidIconName;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "press-scale rounded-control flex min-h-11 w-full flex-col items-center justify-center gap-1 px-1 py-1.5",
        active ? "text-ember-text" : "text-ink-2 hover:bg-hover-canvas",
      )}
    >
      <span
        className={cn("rounded-control grid size-9 place-items-center", active && "bg-ember-50")}
      >
        {active ? (
          <Icon name={icon} variant="solid" className="text-ember" />
        ) : (
          <Icon name={icon} />
        )}
      </span>
      <span
        className={cn(
          "text-footnote w-full text-center leading-tight",
          active ? "font-semibold" : "font-medium",
        )}
      >
        {label}
      </span>
    </Link>
  );
}
