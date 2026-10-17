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
 * Por ruta: título (clave de nav.*), subtítulo fijo opcional (clave de
 * pages.*), si muestra el selector de mes (solo donde los datos son
 * mensuales, spec §4.11) y la acción principal de la topbar.
 * Los subtítulos con datos los pone cada página (<TopbarSubtitle>).
 */
export type PageConfig = {
  title: NavKey;
  subtitle?: "calendarSubtitle";
  month?: boolean;
  action?: "addTransaction";
};

export const PAGE_TITLES: Record<string, PageConfig> = {
  "/": { title: "dashboard", month: true },
  "/transactions": { title: "transactions", month: true, action: "addTransaction" },
  "/savings": { title: "savings" },
  "/debts": { title: "debts" },
  "/subscriptions": { title: "subscriptions" },
  "/calendar": { title: "calendar", subtitle: "calendarSubtitle", month: true },
  "/household": { title: "household", month: true },
  "/settings": { title: "settings" },
};

/** ¿La ruta `pathname` corresponde al elemento `href`? */
export function isActive(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
