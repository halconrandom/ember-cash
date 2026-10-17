/**
 * Constantes del tema, compartidas por el script inline, el proveedor del
 * cliente y la Server Action que guarda la preferencia en profiles.theme.
 */
import type { Theme } from "@/lib/db/types";

/** Valores permitidos (espejo del CHECK de profiles.theme). */
export const THEME_PREFERENCES = ["system", "light", "dark"] as const satisfies readonly Theme[];
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = "light" | "dark";

/** Cookie con la preferencia: la lee el script inline antes de pintar. */
export const THEME_COOKIE = "ec-theme";
/** Un año. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === "string" && (THEME_PREFERENCES as readonly string[]).includes(value);
}

/**
 * Script que corre en <head> antes del primer pintado: lee la cookie, resuelve
 * "system" con prefers-color-scheme y pone la clase light/dark en <html>.
 * Así no hay parpadeo del tema equivocado.
 */
export const THEME_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=(system|light|dark)/);var t=m?m[1]:"system";var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.remove("light","dark");r.classList.add(d?"dark":"light");r.dataset.theme=t;}catch(e){}})();`;
