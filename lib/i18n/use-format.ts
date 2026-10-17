/**
 * Formatos ligados al idioma actual de next-intl. Funciona en componentes de
 * cliente y en componentes de servidor síncronos.
 *
 *   const f = useFormat();
 *   f.money(1599, "USD")        // "US$ 15,99" en es
 *   f.date("2026-10-16")        // "16 de oct"
 */
import { useLocale } from "next-intl";

import type { CurrencyCode } from "@/lib/db/types";

import { DEFAULT_LOCALE, isLocale, type Locale } from "./config";
import { formatAmount, formatDate, formatMoney, formatNumber, type DateStyle } from "./format";

export function useFormat() {
  const current = useLocale();
  const locale: Locale = isLocale(current) ? current : DEFAULT_LOCALE;
  return {
    locale,
    number: (value: number, fractionDigits = 0) => formatNumber(value, locale, fractionDigits),
    amount: (minor: number, currency: CurrencyCode) => formatAmount(minor, currency, locale),
    money: (minor: number, currency: CurrencyCode, options?: Parameters<typeof formatMoney>[3]) =>
      formatMoney(minor, currency, locale, options),
    date: (date: Date | string, style?: DateStyle) => formatDate(date, locale, style),
  };
}
