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
  /**
   * Dónde va el interruptor Personal / Compartido: "shell" (fila sobre el
   * contenido) o "page" (la página lo pone en su propia fila, como Hogar).
   * Sin valor, la ruta no depende del scope (Deudas, Ajustes).
   */
  scope?: "shell" | "page";
  /** Acción principal: texto (clave de messages) y parámetro de URL que abre su modal. */
  action?: {
    label:
      | "transactions.add"
      | "savings.newGoal"
      | "debts.addDebt"
      | "subscriptions.add"
      | "calendar.addPayment"
      | "household.addShared"
      | "dashboard.add";
    param: "tx" | "goal" | "debt" | "sub" | "event";
  };
};

export const PAGE_TITLES: Record<string, PageConfig> = {
  "/": {
    title: "dashboard",
    month: true,
    scope: "shell",
    action: { label: "dashboard.add", param: "tx" },
  },
  "/transactions": {
    title: "transactions",
    month: true,
    scope: "shell",
    action: { label: "transactions.add", param: "tx" },
  },
  "/savings": {
    title: "savings",
    scope: "shell",
    action: { label: "savings.newGoal", param: "goal" },
  },
  "/debts": { title: "debts", action: { label: "debts.addDebt", param: "debt" } },
  "/subscriptions": {
    title: "subscriptions",
    scope: "shell",
    action: { label: "subscriptions.add", param: "sub" },
  },
  "/calendar": {
    title: "calendar",
    subtitle: "calendarSubtitle",
    month: true,
    scope: "shell",
    action: { label: "calendar.addPayment", param: "event" },
  },
  "/household": {
    title: "household",
    month: true,
    scope: "page",
    action: { label: "household.addShared", param: "tx" },
  },
  "/settings": { title: "settings" },
};

/** ¿La ruta `pathname` corresponde al elemento `href`? */
export function isActive(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
