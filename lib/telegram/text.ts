/**
 * Textos del bot, los mismos de messages/es.json y messages/en.json.
 * El webhook no tiene la cookie de idioma: usa el locale del perfil.
 */
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import type { Locale } from "@/lib/i18n/config";
import { INTL_TAGS } from "@/lib/i18n/config";

const TABLES = { es, en } as const;

/** Mensajes del namespace telegram para ese idioma. */
export function telegramCopy(locale: Locale) {
  return TABLES[locale].telegram;
}

/** Nombre de la categoría en el idioma del perfil. */
export function categoryLabel(locale: Locale, key: string): string {
  const table = TABLES[locale].categories as Record<string, string>;
  return table[key] ?? key;
}

/** Sustituye {clave} en una plantilla. */
export function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match,
  );
}

/** Fecha de calendario AAAA-MM-DD, sin correr el día por la zona. */
export function formatDay(date: string, locale: Locale): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return date;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return new Intl.DateTimeFormat(INTL_TAGS[locale], {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}
