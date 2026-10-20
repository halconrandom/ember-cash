"use client";

/** Selector de moneda de visualización (COP/USD/EUR) de la topbar. Guarda profiles.display_currency. */
import { useTranslations } from "next-intl";

import { SegmentedControl } from "@/components/ui/segmented-control";
import { CURRENCY_CODES, type CurrencyCode } from "@/lib/db/types";

import { useRate } from "./rate-provider";

const OPTIONS = CURRENCY_CODES.map((value) => ({ value, label: value })) satisfies readonly {
  value: CurrencyCode;
  label: string;
}[];

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
