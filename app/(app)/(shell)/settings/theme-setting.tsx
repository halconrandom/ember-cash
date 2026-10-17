"use client";

/** Selector de tema: Sistema / Claro / Oscuro. Se guarda en profiles.theme. */
import { useTranslations } from "next-intl";

import { useTheme } from "@/components/theme/theme-provider";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { ThemePreference } from "@/lib/theme/constants";

export function ThemeSetting() {
  const t = useTranslations("settings");
  const { theme, setTheme } = useTheme();
  const options: { value: ThemePreference; label: string }[] = [
    { value: "system", label: t("themeSystem") },
    { value: "light", label: t("themeLight") },
    { value: "dark", label: t("themeDark") },
  ];
  return (
    <SegmentedControl label={t("theme")} options={options} value={theme} onChange={setTheme} />
  );
}
