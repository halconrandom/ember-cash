/**
 * Navegación del shell: rutas, íconos y claves de texto (messages/*.json,
 * namespace "nav"). Los textos nunca van aquí directamente.
 */
import type { IconName, SolidIconName } from "@/components/ui/icon-registry";

/** Claves de nav.* en messages/*.json. */
export type NavKey =
  | "dashboard"
  | "transactions"
  | "savings"
  | "debts"
  | "subscriptions"
  | "calendar"
  | "household"
  | "settings";

export type NavEntry = {
  href: string;
  key: NavKey;
  icon: IconName & SolidIconName;
};

/** Elementos del sidebar, en el orden de 01-dashboard.png. */
export const NAV_ITEMS: readonly NavEntry[] = [
  { href: "/", key: "dashboard", icon: "apps" },
  { href: "/transactions", key: "transactions", icon: "receipt" },
  { href: "/savings", key: "savings", icon: "piggy-bank" },
  { href: "/debts", key: "debts", icon: "credit-card" },
  { href: "/subscriptions", key: "subscriptions", icon: "refresh" },
  { href: "/calendar", key: "calendar", icon: "calendar" },
  { href: "/household", key: "household", icon: "users" },
];

/**
 * Título (clave de nav.*) y subtítulo opcional (clave de pages.*) por ruta.
 * Los subtítulos que dependen de datos llegan con cada pantalla.
 */
export const PAGE_TITLES: Record<string, { title: NavKey; subtitle?: "calendarSubtitle" }> = {
  "/": { title: "dashboard" },
  "/transactions": { title: "transactions" },
  "/savings": { title: "savings" },
  "/debts": { title: "debts" },
  "/subscriptions": { title: "subscriptions" },
  "/calendar": { title: "calendar", subtitle: "calendarSubtitle" },
  "/household": { title: "household" },
  "/settings": { title: "settings" },
};

/** ¿La ruta `pathname` corresponde al elemento `href`? */
export function isActive(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
