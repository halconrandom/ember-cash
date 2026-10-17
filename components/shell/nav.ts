/**
 * Navegación del shell: rutas, etiquetas, íconos y títulos del topbar.
 * Las etiquetas siguen los frames de diseño (01-dashboard.png).
 */
import type { IconName, SolidIconName } from "@/components/ui/icon-registry";

export type NavEntry = {
  href: string;
  label: string;
  icon: IconName & SolidIconName;
};

/** Elementos del sidebar, en el orden de 01-dashboard.png. */
export const NAV_ITEMS: readonly NavEntry[] = [
  { href: "/", label: "Dashboard", icon: "apps" },
  { href: "/transactions", label: "Transactions", icon: "receipt" },
  { href: "/savings", label: "Savings", icon: "piggy-bank" },
  { href: "/debts", label: "Debts", icon: "credit-card" },
  { href: "/subscriptions", label: "Subscriptions", icon: "refresh" },
  { href: "/calendar", label: "Calendar", icon: "calendar" },
  { href: "/household", label: "Household", icon: "users" },
];

/**
 * Título y subtítulo de cada ruta. Los subtítulos de los frames que dependen
 * de datos ("42 transactions in October 2026") llegan con cada pantalla.
 */
export const PAGE_TITLES: Record<string, { title: string; subtitle?: string }> = {
  "/": { title: "Dashboard" },
  "/transactions": { title: "Transactions" },
  "/savings": { title: "Savings" },
  "/debts": { title: "Debts" },
  "/subscriptions": { title: "Subscriptions" },
  "/calendar": { title: "Calendar", subtitle: "Payment due dates, paydays and recurring charges" },
  "/household": { title: "Household" },
  "/settings": { title: "Settings" },
};

/** ¿La ruta `pathname` corresponde al elemento `href`? */
export function isActive(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
