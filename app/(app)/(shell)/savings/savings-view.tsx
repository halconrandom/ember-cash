"use client";

/**
 * Contenido de Ahorros: resumen, tarjetas de meta y tarjeta para crear.
 * Los totales se convierten a la moneda elegida con la tasa más reciente;
 * si no hay tasa, solo se suman las metas que ya están en esa moneda.
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { MoneyAmount } from "@/components/money/money-amount";
import { useRate } from "@/components/money/rate-provider";
import { TopbarSubtitle } from "@/components/shell/topbar-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { ProgressBar } from "@/components/ui/progress-bar";
import type { CurrencyCode } from "@/lib/db/types";
import type { GoalSummary } from "@/lib/goals/queries";
import { goalPercent } from "@/lib/goals/status";
import { convert, latestRateFor, type Rate } from "@/lib/money/convert";
import { add, money, type Money } from "@/lib/money/money";
import { withFilters } from "@/lib/transactions/filters";

import { GoalCard } from "./goal-card";

/** Suma en `to` los importes convertibles; `partial` si alguno no se pudo convertir. */
function sumIn(
  items: Money[],
  to: CurrencyCode,
  rates: readonly Rate[],
): { total: Money; partial: boolean } {
  let total = money(0n, to);
  let partial = false;
  for (const m of items) {
    const rate = m.currency === to ? null : latestRateFor(rates, m.currency, to);
    if (m.currency === to) total = add(total, m);
    else if (rate) total = add(total, convert(m, to, rate));
    else partial = true;
  }
  return { total, partial };
}

export function SavingsView({ goals, today }: { goals: GoalSummary[]; today: string }) {
  const t = useTranslations("savings");
  const { rates, status, displayCurrency } = useRate();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const usable = status === "error" ? [] : rates;
  const openNew = () =>
    router.push(`${pathname}${withFilters(params, { goal: "new" })}`, { scroll: false });

  if (goals.length === 0) {
    return (
      <div id="help-see-savings">
        <TopbarSubtitle text={t("subtitleNoRate", { count: 0 })} />
        <EmptyState
          icon="piggy-bank"
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          actions={
            <Button icon="plus" onClick={openNew}>
              {t("newGoal")}
            </Button>
          }
        />
      </div>
    );
  }

  const saved = sumIn(
    goals.map((g) => g.saved),
    displayCurrency,
    usable,
  );
  const target = sumIn(
    goals.map((g) => g.target),
    displayCurrency,
    usable,
  );
  const monthly = sumIn(
    goals.flatMap((g) => (g.monthly ? [g.monthly] : [])),
    displayCurrency,
    usable,
  );
  const overall = goalPercent(saved.total.amountMinor, target.total.amountMinor);

  return (
    <div id="help-see-savings" className="space-y-6">
      <TopbarSubtitle
        text={
          saved.partial
            ? t("subtitleNoRate", { count: goals.length })
            : t("subtitle", { count: goals.length, percent: overall })
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 lg:gap-6">
        <SummaryCard icon="sack-dollar" label={t("totalSaved")}>
          <MoneyAmount
            variant="total"
            value={saved.total}
            primaryClassName="text-amount-xl"
            secondaryClassName="text-body text-ink-2"
          />
        </SummaryCard>
        <SummaryCard icon="calendar" label={t("monthlyContributions")}>
          <MoneyAmount
            variant="total"
            value={monthly.total}
            suffix={t("perMonth")}
            primaryClassName="text-amount-xl"
            secondaryClassName="text-body text-ink-2"
          />
        </SummaryCard>
        <SummaryCard icon="target" label={t("overallProgress")}>
          <p className="text-amount-xl text-ink tabular-nums">{overall}%</p>
          <ProgressBar
            percent={overall}
            label={t("progressLabel", { percent: overall })}
            className="mt-3"
          />
        </SummaryCard>
      </div>

      <div className="grid gap-6 min-[600px]:grid-cols-2 xl:grid-cols-3">
        {goals.map((goal) => (
          <GoalCard key={goal.id} goal={goal} today={today} />
        ))}
        <button
          type="button"
          onClick={openNew}
          className="rounded-card border-border hover:bg-surface flex min-h-[300px] flex-col items-center justify-center gap-3 border-2 border-dashed p-6 text-center transition-colors duration-100"
        >
          <span className="bg-ember-50 text-ember-text grid size-14 place-items-center rounded-full">
            <Icon name="plus" size={24} />
          </span>
          <span className="text-headline text-ink">{t("createTitle")}</span>
          <span className="text-body text-ink-2">{t("createDescription")}</span>
        </button>
      </div>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  children,
}: {
  icon: "sack-dollar" | "calendar" | "target";
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="space-y-2">
      <p className="text-body text-ink-2 flex items-center gap-2">
        <Icon name={icon} size={20} className="text-ember-text" />
        {label}
      </p>
      {children}
    </Card>
  );
}
