"use client";

/**
 * Selector de idioma: Español / English. Guarda la cookie y profiles.locale;
 * la página se vuelve a renderizar en el idioma elegido.
 */
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";

import { SegmentedControl } from "@/components/ui/segmented-control";
import { saveLocale } from "@/lib/i18n/actions";
import { isLocale, LOCALES, type Locale } from "@/lib/i18n/config";

export function LocaleSetting() {
  const t = useTranslations();
  const current = useLocale();
  const [pending, startTransition] = useTransition();
  const options = LOCALES.map((value) => ({ value, label: t(`languages.${value}`) }));

  return (
    <div aria-busy={pending || undefined}>
      <SegmentedControl<Locale>
        label={t("settings.language")}
        options={options}
        value={isLocale(current) ? current : "es"}
        onChange={(locale) => startTransition(() => void saveLocale(locale))}
      />
    </div>
  );
}
