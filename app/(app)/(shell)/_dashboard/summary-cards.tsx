"use client";

/**
 * Tercera fila del dashboard: próximos pagos (de los vencimientos), metas de
 * ahorro, deudas y suscripciones. Cada tarjeta es un enlace a su pantalla y
 * recibe solo el resumen que calculó el servidor; aquí se convierte a la
 * moneda elegida con la tasa más reciente.
 */
import { useTranslations } from "next-intl";

import { MoneyAmount } from "@/components/money/money-amount";
import { useRate } from "@/components/money/rate-provider";
import { AnimatedList, AnimatedListItem } from "@/components/ui/animated-list";
import { Badge } from "@/components/ui/chip";
import { Icon } from "@/components/ui/icon";
import { ProgressBar } from "@/components/ui/progress-bar";
import { sumIn } from "@/lib/dashboard/aggregate";
import type {
  DebtsSummary,
  GoalsSummary,
  SubscriptionsSummary,
  UpcomingPayment,
} from "@/lib/dashboard/queries";
import type { UpcomingDebt } from "@/lib/debts/upcoming";
import { goalPercent } from "@/lib/goals/status";
import { useFormat } from "@/lib/i18n/use-format";
import { useFirstView } from "@/lib/motion/first-view";
import { convert, latestRateFor } from "@/lib/money/convert";
import type { Money } from "@/lib/money/money";
import { daysBetween } from "@/lib/recurring/schedule";

import { StateBadge } from "../calendar/mark-paid-modal";
import { DashboardCard } from "./card-frame";

/** Encabezado de tarjeta: título, detalle y, a la derecha, un extra. */
function Header({
  title,
  detail,
  extra,
}: {
  title: string;
  detail?: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-title2 text-ink">
        {title} {detail && <span className="text-callout text-ink-2 font-normal">{detail}</span>}
      </h2>
      {extra}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Próximos pagos
// ---------------------------------------------------------------------------

export function UpcomingCard({
  items,
  total,
  today,
}: {
  items: UpcomingPayment[];
  total: number;
  today: string;
}) {
  const t = useTranslations("dashboard");
  const f = useFormat();
  // Animated List: entrada solo en la primera carga del dashboard.
  const first = useFirstView();
  return (
    <DashboardCard href="/calendar" className="space-y-4">
      <Header title={t("upcoming")} detail={t("upcomingWindow")} />
      {items.length === 0 ? (
        <p className="text-body text-ink-2 py-6 text-center">{t("upcomingEmpty")}</p>
      ) : (
        <ul className="space-y-3">
          <AnimatedList animateOnMount={first}>
            {items.map((item) => {
              const days = daysBetween(today, item.dueOn);
              return (
                <AnimatedListItem key={item.occurrenceId} className="flex items-center gap-3">
                  <span className="bg-ember-50 text-ember-text rounded-control grid size-10 shrink-0 place-items-center">
                    <Icon name={item.iconKey} size={20} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-body text-ink block truncate font-semibold">
                      {item.name}
                    </span>
                    <span className="text-footnote text-ink-3 flex flex-wrap items-center gap-1.5">
                      {f.date(item.dueOn, "weekdayShort")}
                      {item.state === "upcoming" && <span>· {t("inDays", { count: days })}</span>}
                      <StateBadge state={item.state} />
                    </span>
                  </span>
                  <MoneyAmount value={item.amount} className="shrink-0 text-right" />
                </AnimatedListItem>
              );
            })}
          </AnimatedList>
        </ul>
      )}
      {total > items.length && (
        <p className="text-footnote text-ink-3">
          {t("upcomingMore", { count: total - items.length })}
        </p>
      )}
    </DashboardCard>
  );
}

// ---------------------------------------------------------------------------
// Metas de ahorro
// ---------------------------------------------------------------------------

export function GoalsCard({ summary }: { summary: GoalsSummary }) {
  const t = useTranslations("dashboard");
  const f = useFormat();
  const { rates, status, displayCurrency } = useRate();
  const usable = status === "error" ? [] : rates;
  const show = (m: Money) => {
    if (m.currency === displayCurrency) return m;
    const rate = latestRateFor(usable, m.currency, displayCurrency);
    return rate ? convert(m, displayCurrency, rate) : m;
  };

  return (
    <DashboardCard href="/savings" className="space-y-4">
      <Header
        title={t("goals")}
        detail={summary.count > 0 ? t("activeCount", { count: summary.count }) : undefined}
        extra={
          <span className="text-callout text-ember-text flex items-center gap-1 font-semibold">
            {t("allGoals")}
            <Icon name="angle-small-right" size={16} />
          </span>
        }
      />
      {summary.top.length === 0 ? (
        <p className="text-body text-ink-2 py-6 text-center">{t("goalsEmpty")}</p>
      ) : (
        <ul className="space-y-4">
          {summary.top.map((goal) => {
            const percent = goalPercent(goal.saved.amountMinor, goal.target.amountMinor);
            const saved = show(goal.saved);
            const target = show(goal.target);
            return (
              <li key={goal.id} className="space-y-2">
                <div className="text-body flex items-center justify-between gap-3">
                  <span className="text-ink flex min-w-0 items-center gap-2">
                    <Icon name={goal.iconKey} size={20} className="text-ember-text" />
                    <span className="truncate">{goal.name}</span>
                  </span>
                  <span className="text-ink font-semibold tabular-nums">{percent}%</span>
                </div>
                <ProgressBar
                  percent={percent}
                  label={t("goalProgress", { name: goal.name, percent })}
                />
                <p className="text-footnote text-ink-2 tabular-nums">
                  {t("of", {
                    saved: target.currency === "COP" ? f.moneyParts(saved).main : f.money(saved),
                    target: f.money(target),
                  })}
                  {goal.target.currency !== displayCurrency &&
                    ` · ${t("original", { amount: f.money(goal.target) })}`}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </DashboardCard>
  );
}

// ---------------------------------------------------------------------------
// Deudas
// ---------------------------------------------------------------------------

export function DebtsCard({ summary }: { summary: DebtsSummary }) {
  const t = useTranslations("dashboard");
  const f = useFormat();
  const { rates, status, displayCurrency } = useRate();
  const usable = status === "error" ? [] : rates;
  const balance = sumIn(summary.balances, displayCurrency, usable);
  const original = sumIn(summary.originals, displayCurrency, usable);
  const paid = sumIn(summary.paid, displayCurrency, usable);
  const minimums = sumIn(summary.minimums, displayCurrency, usable);
  const percent =
    original.total.amountMinor > 0n
      ? Number((paid.total.amountMinor * 100n) / original.total.amountMinor)
      : 0;

  return (
    <DashboardCard href="/debts" className="space-y-4">
      <Header
        title={t("debts")}
        extra={
          summary.count > 0 && (
            <span className="text-callout text-ember-text font-medium">{t("debtsViewAll")}</span>
          )
        }
      />
      {summary.count === 0 ? (
        <p className="text-body text-ink-2 py-4">{t("debtsEmpty")}</p>
      ) : (
        <>
          <MoneyAmount
            variant="total"
            value={balance.total}
            className="flex-row! flex-wrap items-baseline gap-x-2"
            primaryClassName="text-amount-xl"
            secondaryClassName="text-callout text-ink-2"
          />
          <ProgressBar
            percent={percent}
            label={t("debtsPaid", { percent })}
            barClassName="bg-debt-bar"
          />
          <p className="text-callout text-ink-2 tabular-nums">
            {t("debtsPaid", { percent })} ·{" "}
            {t("debtsPaidPair", { paid: f.money(paid.total), total: f.money(original.total) })}
            {" · "}
            {t("minimums", { amount: f.money(minimums.total) })}
          </p>
          {balance.partial && <p className="text-footnote text-ink-3">{t("partial")}</p>}
          {summary.top.length > 0 && (
            <ul className="border-divider space-y-3 border-t pt-4">
              {summary.top.map((d) => (
                <DebtLine key={d.id} debt={d} />
              ))}
            </ul>
          )}
        </>
      )}
    </DashboardCard>
  );
}

/**
 * Una deuda en la tarjeta: nombre, estado del próximo vencimiento (misma
 * lógica que /debts: debtDueState), barra de pagado y "pagado de original"
 * en la moneda elegida (o en la suya si falta la tasa).
 */
function DebtLine({ debt }: { debt: UpcomingDebt }) {
  const t = useTranslations("dashboard");
  const f = useFormat();
  const { rates, status, displayCurrency } = useRate();
  const usable = status === "error" ? [] : rates;
  const shown = (m: Money) => {
    if (m.currency === displayCurrency) return m;
    const rate = latestRateFor(usable, m.currency, displayCurrency);
    return rate ? convert(m, displayCurrency, rate) : m;
  };
  const s = debt.dueState;
  return (
    <li className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-body text-ink flex min-w-0 items-center gap-2 font-semibold">
          <Icon name={debt.iconKey} size={16} className="text-ember-text shrink-0" />
          <span className="truncate">{debt.name}</span>
        </span>
        <span className="flex flex-wrap gap-1.5">
          {s?.paidThisCycle && (
            <Badge tone="positive" size="sm">
              {t("debtPaidThisMonth")}
            </Badge>
          )}
          {s && (
            <Badge
              tone={s.tone === "today" ? "warning" : s.tone === "soon" ? "negative" : "neutral"}
              size="sm"
            >
              {s.tone === "today" ? t("debtDueToday") : t("debtDue", { date: f.date(s.due) })}
            </Badge>
          )}
        </span>
      </div>
      <ProgressBar
        percent={debt.percent}
        label={t("debtsPaid", { percent: debt.percent })}
        barClassName="bg-debt-bar"
        className="h-1.5"
      />
      <p className="text-footnote text-ink-2 tabular-nums">
        {t("debtsPaid", { percent: debt.percent })} ·{" "}
        {t("debtsPaidPair", {
          paid: f.money(shown(debt.paid)),
          total: f.money(shown(debt.original)),
        })}
      </p>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Suscripciones
// ---------------------------------------------------------------------------

export function SubscriptionsCard({ summary }: { summary: SubscriptionsSummary }) {
  const t = useTranslations("dashboard");
  const { rates, status, displayCurrency } = useRate();
  const usable = status === "error" ? [] : rates;
  const monthly = sumIn(summary.monthly, displayCurrency, usable);
  const more = summary.count - summary.icons.length;

  return (
    <DashboardCard href="/subscriptions" className="space-y-4">
      <Header
        title={t("subscriptions")}
        extra={
          summary.count > 0 && (
            <Badge tone="violet" size="sm">
              {t("activeCount", { count: summary.count })}
            </Badge>
          )
        }
      />
      {summary.count === 0 ? (
        <p className="text-body text-ink-2 py-4">{t("subscriptionsEmpty")}</p>
      ) : (
        <>
          <MoneyAmount
            variant="total"
            value={monthly.total}
            suffix={t("perMonth")}
            suffixClassName="text-callout text-ink-2 font-normal"
            className="flex-row! flex-wrap items-baseline gap-x-2"
            primaryClassName="text-amount-xl"
            secondaryClassName="text-callout text-ink-2"
          />
          <div className="flex flex-wrap items-center gap-2">
            {summary.icons.map((icon, i) => (
              <span
                key={i}
                className="bg-violet-tint text-violet rounded-control grid size-9 place-items-center"
              >
                <Icon name={icon} size={18} />
              </span>
            ))}
            {more > 0 && (
              <span className="text-callout text-ink-2">{t("more", { count: more })}</span>
            )}
          </div>
          {monthly.partial && <p className="text-footnote text-ink-3">{t("partial")}</p>}
        </>
      )}
    </DashboardCard>
  );
}
