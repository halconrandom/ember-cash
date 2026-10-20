"use client";

/**
 * Chip "Ver en COP" de la topbar (fase E5, spec de Ivern): reemplaza el
 * segmented COP/USD/EUR. Abre <CurrencyPicker> con el título "Ver montos
 * en"; solo lista profiles.enabled_currencies. En móvil se compacta al
 * código solo. 36 px visuales (la píldora) dentro de 44 px de área táctil
 * (el botón que pone <CurrencyPicker>, igual que el resto de los chips de
 * la barra). Al elegir, toast "Mostrando montos en {moneda}"; el cambio de
 * número es un cross-fade de 150 ms que ya hace <MoneyAmount> (sin nada
 * extra aquí) y no corre con prefers-reduced-motion.
 */
import { useTranslations } from "next-intl";

import { CurrencyPicker } from "@/components/ui/currency-picker";
import { useToast } from "@/components/ui/toast";
import type { CurrencyCode } from "@/lib/db/types";

import { Icon } from "../ui/icon";
import { useRate } from "./rate-provider";

export function DisplayCurrencyChip() {
  const t = useTranslations("currency");
  const { displayCurrency, enabledCurrencies, setDisplayCurrency } = useRate();
  const toast = useToast();

  function change(next: CurrencyCode) {
    setDisplayCurrency(next);
    toast.show({ message: t("shownIn", { currency: next }) });
  }

  return (
    <CurrencyPicker
      value={displayCurrency}
      onChange={change}
      options={enabledCurrencies}
      title={t("viewIn")}
      triggerLabel={t("viewInLabel", { currency: displayCurrency })}
      triggerClassName="press-scale inline-flex h-11 shrink-0 items-center"
    >
      <span className="border-border bg-surface text-ink hover:bg-surface2 inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-body font-semibold transition-colors duration-100">
        <span className="max-[599px]:hidden">{t("viewInChip", { currency: displayCurrency })}</span>
        <span className="min-[600px]:hidden">{displayCurrency}</span>
        <Icon name="angle-small-down" size={16} className="text-ink-2" />
      </span>
    </CurrencyPicker>
  );
}
