"use client";

/**
 * Tarjeta de meta (03-savings.png): ícono, nombre, fecha objetivo y estado;
 * anillo de progreso; ahorrado, objetivo y equivalente; mensual y restante.
 * Regla de moneda (fase E2 §4, Ivern): la meta siempre se muestra en su
 * propia moneda ("€ 640 de € 1.200"); el anillo y el porcentaje también se
 * calculan en esa moneda. Si difiere de displayCurrency, una sola línea
 * "≈ … ahorrado" (solo lo ahorrado, con la tasa más reciente); sin esa tasa,
 * dice "Tasa no disponible", nunca 0.
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { useRate } from "@/components/money/rate-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/chip";
import { Icon } from "@/components/ui/icon";
import { ProgressRing } from "@/components/ui/progress-ring";
import type { GoalSummary } from "@/lib/goals/queries";
import { goalPercent, goalStatus, type GoalStatus } from "@/lib/goals/status";
import { useFormat } from "@/lib/i18n/use-format";
import { convert, latestRateFor } from "@/lib/money/convert";
import { subtract, type Money } from "@/lib/money/money";
import { withFilters } from "@/lib/transactions/filters";
import { cn } from "@/lib/utils";

/** Un color por estado (IVERN_FIXES §3). */
const STATUS_TONE: Record<GoalStatus, Tone> = {
  onTrack: "positive",
  behind: "warning",
  almostThere: "positive",
};

export function GoalCard({ goal, today }: { goal: GoalSummary; today: string }) {
  const t = useTranslations("savings");
  const f = useFormat();
  const { rates, status, displayCurrency } = useRate();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const differs = goal.target.currency !== displayCurrency;
  const dim = status === "updating" ? "opacity-60" : "";
  const rate =
    differs && status !== "error"
      ? latestRateFor(rates, goal.target.currency, displayCurrency)
      : null;

  const percent = goalPercent(goal.saved.amountMinor, goal.target.amountMinor);
  const state = goalStatus({
    savedMinor: goal.saved.amountMinor,
    targetMinor: goal.target.amountMinor,
    startedOn: goal.startedOn,
    targetDate: goal.targetDate,
    today,
  });
  const remainingOriginal = subtract(goal.target, goal.saved);
  const remaining =
    remainingOriginal.amountMinor < 0n
      ? { ...remainingOriginal, amountMinor: 0n }
      : remainingOriginal;

  const targetLabel = goal.targetDate
    ? t("targetDate", { date: f.date(goal.targetDate, "shortMonthYear") })
    : t("noTargetDate");
  const open = (key: "goal" | "contribute") =>
    router.push(`${pathname}${withFilters(params, { [key]: goal.id })}`, { scroll: false });

  return (
    <Card className="flex flex-col">
      <div className="flex items-start gap-3">
        <span className="rounded-control bg-ember-50 text-ember-text grid size-10 shrink-0 place-items-center">
          <Icon name={goal.iconKey} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-headline text-ink truncate">{goal.name}</h2>
          <p className="text-callout text-ink-2">{targetLabel}</p>
        </div>
        <Badge tone={STATUS_TONE[state]} dot>
          {t(`status.${state}`)}
        </Badge>
      </div>

      <div className="mt-6 flex items-center gap-6">
        <ProgressRing percent={percent} label={t("progressLabel", { percent })}>
          <span className="text-amount-l text-ink tabular-nums">{percent}%</span>
        </ProgressRing>
        <div className="min-w-0 space-y-0.5">
          <p className="text-callout text-ink-2">{t("saved")}</p>
          <Amount value={goal.saved} className="text-amount-l" />
          <p className="text-callout text-ink-2 tabular-nums">
            {t("of", { amount: f.money(goal.target) })}
          </p>
          {differs && (
            <p className={cn("text-callout text-ink-3 tabular-nums", dim)}>
              {rate
                ? t("approxSaved", { amount: f.money(convert(goal.saved, displayCurrency, rate)) })
                : t("rateUnavailableShort")}
            </p>
          )}
        </div>
      </div>

      <dl className="border-divider mt-6 grid grid-cols-2 gap-4 border-t pt-5">
        <div>
          <dt className="text-caption text-ink-2 uppercase">{t("monthly")}</dt>
          <dd className="mt-1">
            {goal.monthly ? (
              <Amount value={goal.monthly} className="text-body" />
            ) : (
              <span className="text-body text-ink-3">{t("noMonthly")}</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-caption text-ink-2 uppercase">{t("remaining")}</dt>
          <dd className="mt-1">
            <Amount value={remaining} className="text-body" />
          </dd>
        </div>
      </dl>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button
          variant="soft"
          size="sm"
          icon="plus"
          onClick={() => open("contribute")}
          aria-label={t("contributeTo", { name: goal.name })}
        >
          {t("addContribution")}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => open("goal")}
          aria-label={t("editGoal", { name: goal.name })}
        >
          {t("edit")}
        </Button>
      </div>
    </Card>
  );
}

/** Importe con el número en negrita y "COP" más pequeño. */
function Amount({ value, className }: { value: Money; className?: string }) {
  const f = useFormat();
  const { main, unit } = f.moneyParts(value);
  return (
    <p className={cn("text-ink font-semibold whitespace-nowrap tabular-nums", className)}>
      {main}
      {unit && <span className="text-callout text-ink-3 font-normal">{` ${unit}`}</span>}
    </p>
  );
}
