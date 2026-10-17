"use client";

/**
 * Sincroniza la cookie de idioma con profiles.locale al entrar a la app (por
 * ejemplo, si el usuario cambió el idioma en otro dispositivo).
 */
import { useLocale } from "next-intl";
import { useEffect, useTransition } from "react";

import type { Locale } from "@/lib/i18n/config";
import { saveLocale } from "@/lib/i18n/actions";

export function LocaleSync({ locale }: { locale: Locale }) {
  const current = useLocale();
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (current !== locale) startTransition(() => void saveLocale(locale, { persist: false }));
  }, [current, locale]);

  return null;
}
