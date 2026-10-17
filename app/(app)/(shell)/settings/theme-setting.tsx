"use client";

/** Selector de tema: Sistema / Claro / Oscuro. Se guarda en profiles.theme. */
import { useTheme } from "@/components/theme/theme-provider";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { ThemePreference } from "@/lib/theme/constants";

const OPTIONS = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const satisfies readonly { value: ThemePreference; label: string }[];

export function ThemeSetting() {
  const { theme, setTheme } = useTheme();
  return <SegmentedControl label="Theme" options={OPTIONS} value={theme} onChange={setTheme} />;
}
