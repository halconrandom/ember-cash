"use client";

/**
 * Sidebar de 248 px (01-dashboard.png): marca arriba, navegación con nombres
 * visibles y la tarjeta del usuario abajo. Sin la caja "Sample data".
 * En pantallas angostas pasa a ser una franja superior con los mismos
 * elementos.
 */
import { LayoutGroup } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { LogoTile } from "@/components/brand/logo";
import { NavItem } from "@/components/ui/nav-item";

import { isActive, NAV_ITEMS } from "./nav";

export function Sidebar({ userCard }: { userCard: React.ReactNode }) {
  const pathname = usePathname();
  const t = useTranslations();

  return (
    <aside className="flex flex-col gap-4 px-4 pt-6 pb-4 lg:sticky lg:top-0 lg:h-dvh lg:gap-0 lg:pt-[30px] lg:pb-6">
      <Link href="/" className="rounded-control flex w-fit items-center gap-3 px-2">
        <LogoTile size={36} label={t("common.appName")} />
        <span className="text-brand text-ink">{t("common.appName")}</span>
      </Link>

      <nav aria-label={t("nav.label")} className="lg:mt-[30px]">
        <LayoutGroup id="sidebar-nav">
          <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
            {NAV_ITEMS.map((item) => (
              <li key={item.href} className="shrink-0">
                <NavItem
                  href={item.href}
                  icon={item.icon}
                  label={t(`nav.${item.key}`)}
                  active={isActive(item.href, pathname)}
                  layoutGroup="sidebar"
                />
              </li>
            ))}
          </ul>
        </LayoutGroup>
      </nav>

      <div className="lg:mt-auto">{userCard}</div>
    </aside>
  );
}
