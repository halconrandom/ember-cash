"use client";

/**
 * Gastos por categoría (IVERN_FIXES §2: barras horizontales ordenadas de
 * mayor a menor, en lugar de donut). Cada barra usa el color de su categoría
 * (nunca naranja) y lleva el valor y el porcentaje al lado. La barra más
 * larga es la categoría mayor; las demás, en proporción a ella. Cada fila
 * abre Transacciones filtrada por esa categoría y ese mes.
 */
import Link from "next/link";
import { useTranslations } from "next-intl";

import { useRate } from "@/components/money/rate-provider";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { CATEGORY_META } from "@/lib/categories";
import { spendingByCategory, type AggregateRow } from "@/lib/dashboard/aggregate";
import { useFormat } from "@/lib/i18n/use-format";
import type { Money } from "@/lib/money/money";
import { cn } from "@/lib/utils";

/** Color del ícono y de la barra por tono de categoría. */
const TONE_TEXT: Record<string, string> = {
  teal: "text-teal",
  warning: "text-amber",
  info: "text-info",
  violet: "text-violet",
  pink: "text-pink",
  olive: "text-olive",
  neutral: "text-slate",
  positive: "text-positive",
};
const TONE_BAR: Record<string, string> = {
  teal: "bg-teal",
  warning: "bg-amber",
  info: "bg-info",
  violet: "bg-violet",
  pink: "bg-pink",
  olive: "bg-olive",
  neutral: "bg-slate",
  positive: "bg-positive",
};

export function CategoryCard({ rows, month }: { rows: AggregateRow[]; month: string }) {
  const t = useTranslations("dashboard");
  const tc = useTranslations("categories");
  const f = useFormat();
  const { rate, status, displayCurrency } = useRate();
  const usable = status === "error" ? null : rate;
  const { slices, total, partial } = spendingByCategory(rows, month, displayCurrency, usable);
  const max = slices[0]?.amount.amountMinor ?? 0n;
  /** En COP, solo el número (la unidad va en el total); en USD, con "US$". */
  const amountText = (m: Money) => (m.currency === "COP" ? f.moneyParts(m).main : f.money(m));

  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-title2 text-ink">
          <Link href={`/transactions?month=${month}&type=expense`} className="hover:underline">
            {t("byCategory")}
          </Link>{" "}
          <span className="text-callout text-ink-2 font-normal">{t("highestFirst")}</span>
        </h2>
        {slices.length > 0 && (
          <p className="text-body text-ink font-semibold tabular-nums">
            {t("total", { amount: f.money(total) })}
          </p>
        )}
      </div>
      {slices.length === 0 ? (
        <p className="text-body text-ink-2 py-8 text-center">{t("byCategoryEmpty")}</p>
      ) : (
        <ul className="space-y-1">
          {slices.map((s) => {
            const meta = CATEGORY_META[s.categoryKey];
            const width = max > 0n ? Number((s.amount.amountMinor * 1000n) / max) / 10 : 0;
            return (
              <li key={s.categoryKey}>
                <Link
                  href={`/transactions?month=${month}&category=${s.categoryKey}`}
                  className="rounded-row hover:bg-surface2 grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_7.5rem_3rem] items-center gap-4 px-2 py-1.5 transition-colors duration-100"
                >
                  <span className="text-body text-ink flex min-w-0 items-center gap-3">
                    <Icon name={meta.icon} size={20} className={TONE_TEXT[meta.tone]} />
                    <span className="truncate">{tc(s.categoryKey)}</span>
                  </span>
                  <span
                    role="img"
                    aria-label={t("shareLabel", { percent: s.percent })}
                    className="bg-track h-2 overflow-hidden rounded-full"
                  >
                    <span
                      className={cn("block h-full rounded-full", TONE_BAR[meta.tone])}
                      style={{ width: `${width}%` }}
                    />
                  </span>
                  <span className="text-body text-ink text-right font-semibold whitespace-nowrap tabular-nums">
                    {amountText(s.amount)}
                  </span>
                  <span className="text-callout text-ink-2 text-right tabular-nums">
                    {s.percent}%
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {partial && <p className="text-footnote text-ink-3">{t("partial")}</p>}
    </Card>
  );
}
