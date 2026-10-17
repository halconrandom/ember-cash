"use client";

/**
 * Tarjeta "Paga X extra al mes" (04-debts.png): cuántos meses antes se
 * termina y cuánto interés se ahorra frente al plan sin extra. El monto
 * sugerido es el 15 % de los mínimos, redondeado hacia arriba a una cifra
 * significativa (1.230.000 COP → 200.000; US$ 307,50 → US$ 50); se puede
 * cambiar.
 */
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { Icon } from "@/components/ui/icon";
import type { CurrencyCode } from "@/lib/db/types";
import { extraSavings, type PayoffInput } from "@/lib/debts/payoff";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config";
import { useFormat } from "@/lib/i18n/use-format";
import { suggestedExtra } from "@/lib/debts/extra";
import { money, type Money } from "@/lib/money/money";
import { parseMoney } from "@/lib/money/parse";

type Props = { currency: CurrencyCode; minimums: Money; input: Omit<PayoffInput, "extraMinor"> };

export function ExtraPaymentCard({ currency, minimums, input }: Props) {
  const t = useTranslations("debts");
  const f = useFormat();
  const localeRaw = useLocale();
  const locale = isLocale(localeRaw) ? localeRaw : DEFAULT_LOCALE;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(f.amount(suggestedExtra(minimums)));

  const parsed = parseMoney(text, currency, locale);
  const extra = parsed.ok ? parsed.value : suggestedExtra(minimums);
  const savings = extraSavings(input, extra.amountMinor);

  return (
    <section className="rounded-card bg-ember-50 flex gap-4 p-5">
      <span className="rounded-control bg-surface text-ember-text grid size-10 shrink-0 place-items-center">
        <Icon name="sparkles" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <h3 className="text-headline text-ink">{t("extraTitle", { amount: f.money(extra) })}</h3>
        <p className="text-body text-ink-2">
          {savings
            ? t("extraBody", {
                months: savings.months,
                interest: f.money(money(savings.interest, currency)),
              })
            : t("extraNever")}
        </p>
        {editing ? (
          <label className="text-callout text-ink-2 mt-2 flex items-center gap-2">
            {t("extraLabel")}
            <input
              inputMode="decimal"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="rounded-control border-border bg-surface text-body text-ink h-9 w-36 border px-3 tabular-nums"
            />
            <span>{currency}</span>
          </label>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-callout text-ember-text mt-1 font-medium underline-offset-4 hover:underline"
          >
            {t("extraChange")}
          </button>
        )}
      </div>
    </section>
  );
}
