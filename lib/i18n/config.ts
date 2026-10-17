/**
 * Configuración de idiomas. Sin prefijos en la URL: el idioma vive en la
 * cookie `ec-locale` (para el render del servidor) y en profiles.locale (para
 * recordarlo entre dispositivos).
 */

import type { ProfileLocale } from "@/lib/db/types";

/** Idiomas de la app (espejo del CHECK de profiles.locale). */
export const LOCALES = ["es", "en"] as const satisfies readonly ProfileLocale[];
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "es";

export const LOCALE_COOKIE = "ec-locale";
/** Un año. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Etiqueta BCP 47 para formatear números y fechas. Español usa es-CO porque
 * agrupa también los miles de 4 cifras (1.234); "es" a secas deja "1234".
 */
export const INTL_TAGS: Record<Locale, string> = { es: "es-CO", en: "en-US" };

/** Zona horaria por defecto (profiles.timezone). */
export const DEFAULT_TIME_ZONE = "America/Bogota";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Script inline: pone <html lang> desde la cookie antes del primer pintado. */
export const LOCALE_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )${LOCALE_COOKIE}=(es|en)/);document.documentElement.lang=m?m[1]:"${DEFAULT_LOCALE}";}catch(e){}})();`;
