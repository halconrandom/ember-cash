"use client";

/**
 * Tarjeta de meta (03-savings.png): ícono, nombre, fecha objetivo y estado;
 * anillo de progreso; ahorrado, objetivo y equivalente; mensual y restante.
 * Reglas de moneda (spec §4):
 * - Meta en la moneda elegida: ahorrado y objetivo tal cual, y "≈" en la
 *   otra moneda (es una línea de detalle).
 * - Meta en otra moneda: convertido a la moneda elegida y debajo
 *   "original US$ 640,00 de US$ 1.200,00" (los dos importes con su símbolo).
 * - Sin tasa: el original queda como principal y lo convertido dice
 *   "tasa no disponible".
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
import { convert, otherCurrency } from "@/lib/money/convert";
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
  const { rate, status, displayCurrency } = useRate();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const usable = status === "error" ? null : rate;
  const differs = goal.target.currency !== displayCurrency;
  const canConvert = Boolean(usable);
  const dim = status === "updating" ? "opacity-60" : "";
  /** En la moneda elegida si se puede; si no, el original. */
  const shown = (m: Money) => (differs && usable ? convert(m, displayCurrency, usable) : m);

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
          <Amount value={shown(goal.saved)} className={cn("text-amount-l", differs && dim)} />
          <p className={cn("text-callout text-ink-2 tabular-nums", differs && dim)}>
            {t("of", { amount: f.money(shown(goal.target)) })}
          </p>
          <p className="text-callout text-ink-3 tabular-nums">
            {differs ? (
              canConvert ? (
                t("originalOf", { saved: f.money(goal.saved), target: f.money(goal.target) })
              ) : (
                t("rateUnavailableShort")
              )
            ) : canConvert ? (
              <span className={dim}>
                {f.money(convert(goal.saved, otherCurrency(goal.saved.currency), usable!), {
                  approx: true,
                })}
              </span>
            ) : (
              t("rateUnavailableShort")
            )}
          </p>
        </div>
      </div>

      <dl className="border-divider mt-6 grid grid-cols-2 gap-4 border-t pt-5">
        <div>
          <dt className="text-caption text-ink-2 uppercase">{t("monthly")}</dt>
          <dd className="mt-1">
            {goal.monthly ? (
              <Amount value={shown(goal.monthly)} className={cn("text-body", differs && dim)} />
            ) : (
              <span className="text-body text-ink-3">{t("noMonthly")}</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-caption text-ink-2 uppercase">{t("remaining")}</dt>
          <dd className="mt-1">
            <Amount value={shown(remaining)} className={cn("text-body", differs && dim)} />
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
