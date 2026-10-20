"use client";

/**
 * Ajustes > Monedas (fase E5, spec de Ivern): "Moneda de visualización"
 * (la misma que el chip de la topbar) y "Monedas que uso", con checkboxes
 * que escriben profiles.enabled_currencies. La de visualización no se puede
 * desactivar (si se intenta, el checkbox está disabled).
 */
import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { useRate } from "@/components/money/rate-provider";
import { CurrencyPicker } from "@/components/ui/currency-picker";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import { CURRENCY_CODES, type CurrencyCode } from "@/lib/db/types";
import { saveEnabledCurrencies } from "@/lib/money/actions";
import { cn } from "@/lib/utils";

export function CurrencySetting() {
  const t = useTranslations("currency");
  const { displayCurrency, enabledCurrencies, setDisplayCurrency, setEnabledCurrencies } =
    useRate();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  function toggle(code: CurrencyCode, checked: boolean) {
    if (code === displayCurrency) return; // No se puede quitar la de visualización.
    const next = checked
      ? [...enabledCurrencies, code]
      : enabledCurrencies.filter((c) => c !== code);
    if (next.length === 0) return;
    setEnabledCurrencies(next);
    startTransition(async () => {
      const result = await saveEnabledCurrencies(next);
      if (!result.ok) {
        setEnabledCurrencies(enabledCurrencies); // No se pudo: vuelve atrás.
        toast.show({ message: t("enabledSaveFailed") });
      }
    });
  }

  return (
    <div className="space-y-5" aria-busy={pending || undefined}>
      <div className="space-y-2">
        <span className="text-callout text-ink-2 block font-semibold">{t("displayLabel")}</span>
        <CurrencyPicker
          value={displayCurrency}
          onChange={(next) => {
            setDisplayCurrency(next);
            toast.show({ message: t("shownIn", { currency: next }) });
          }}
          options={enabledCurrencies}
          title={t("viewIn")}
          triggerLabel={t("viewInLabel", { currency: displayCurrency })}
          triggerClassName="rounded-control bg-surface2 text-body text-ink flex h-11 w-full items-center gap-2 border border-transparent px-4"
        >
          <span className="min-w-0 flex-1 text-left">{displayCurrency}</span>
          <Icon name="angle-small-down" size={18} className="text-ink-2" />
        </CurrencyPicker>
        <p className="text-footnote text-ink-3">{t("displayHint")}</p>
      </div>

      <div className="space-y-2">
        <span className="text-callout text-ink-2 block font-semibold">{t("enabledLabel")}</span>
        <ul className="divide-divider divide-y">
          {CURRENCY_CODES.map((code) => {
            const checked = enabledCurrencies.includes(code);
            const locked = code === displayCurrency;
            return (
              <li key={code}>
                <label
                  className={cn(
                    "flex min-h-12 items-center gap-3 py-2",
                    locked ? "cursor-not-allowed" : "cursor-pointer",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={locked}
                    onChange={(e) => toggle(code, e.target.checked)}
                    className="accent-ember-fill size-5"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="text-body text-ink block font-semibold">{code}</span>
                    <span className="text-callout text-ink-2 block truncate">
                      {t(`names.${code}`)}
                    </span>
                  </span>
                  {locked && (
                    <span className="text-footnote text-ink-3">{t("enabledLockedHint")}</span>
                  )}
                </label>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
