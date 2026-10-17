/**
 * Configuración de next-intl por petición: toma el idioma de la cookie
 * `ec-locale` (español por defecto) y carga sus mensajes.
 */
import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { DEFAULT_LOCALE, DEFAULT_TIME_ZONE, isLocale, LOCALE_COOKIE } from "@/lib/i18n/config";

export default getRequestConfig(async () => {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(value) ? value : DEFAULT_LOCALE;
  return {
    locale,
    timeZone: DEFAULT_TIME_ZONE,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
