/**
 * Formatos ligados al idioma actual de next-intl. Funciona en componentes de
 * cliente y en componentes de servidor síncronos.
 *
 *   const f = useFormat();
 *   f.money(money(1599n, "USD"))  // "US$ 15,99" en es
 *   f.date("2026-10-16")        // "16 de oct"
 */
import { useLocale } from "next-intl";

import {
  formatAmount,
  formatMoney,
  formatMoneyParts,
  type MoneyFormatOptions,
} from "@/lib/money/format";
import type { Money } from "@/lib/money/money";

import { DEFAULT_LOCALE, isLocale, type Locale } from "./config";
import { formatDate, formatNumber, type DateStyle } from "./format";

export function useFormat() {
  const current = useLocale();
  const locale: Locale = isLocale(current) ? current : DEFAULT_LOCALE;
  return {
    locale,
    number: (value: number, fractionDigits = 0) => formatNumber(value, locale, fractionDigits),
    amount: (m: Money) => formatAmount(m, locale),
    money: (m: Money, options?: MoneyFormatOptions) => formatMoney(m, locale, options),
    moneyParts: (m: Money) => formatMoneyParts(m, locale),
    date: (date: Date | string, style?: DateStyle) => formatDate(date, locale, style),
  };
}
