"use client";

/** Selector COP/USD de la topbar. Guarda profiles.display_currency. */
import { useTranslations } from "next-intl";

import { SegmentedControl } from "@/components/ui/segmented-control";
import type { CurrencyCode } from "@/lib/db/types";

import { useRate } from "./rate-provider";

const OPTIONS = [
  { value: "COP", label: "COP" },
  { value: "USD", label: "USD" },
] as const satisfies readonly { value: CurrencyCode; label: string }[];

export function DisplayCurrencyToggle() {
  const t = useTranslations("currency");
  const { displayCurrency, setDisplayCurrency } = useRate();
  return (
    <SegmentedControl<CurrencyCode>
      label={t("displayLabel")}
      options={OPTIONS}
      value={displayCurrency}
      onChange={setDisplayCurrency}
    />
  );
}
