"use client";

/**
 * Suscripciones (05/15-subscriptions.png): cuatro tarjetas de resumen, la
 * lista con filtro Todas / Mensuales / Anuales y los cobros de los próximos
 * 14 días. La franja de 7 días marca cuáles tienen cobro; no filtra la lista
 * (en el frame el día de hoy está activo y la lista muestra otros días).
 * Las tarjetas y los cobros próximos son Animated Lists (entrada solo en la
 * primera carga; lo que llega o se va se acomoda con `layout`).
 * Nada se registra solo: el cobro de hoy dice "Por pagar", uno pasado sin
 * confirmar dice "Vencida", y "Marcar como pagado" abre el modal con la fecha
 * real de pago y la cuenta.
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { MoneyAmount } from "@/components/money/money-amount";
import { useRate } from "@/components/money/rate-provider";
import { TopbarSubtitle } from "@/components/shell/topbar-context";
import { AnimatedList, AnimatedListItem } from "@/components/ui/animated-list";
import { Badge } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { IconName } from "@/components/ui/icon-registry";
import { useToast } from "@/components/ui/toast";
import type { AccountSummary } from "@/lib/accounts/queries";
import type { CurrencyCode, RecurringFrequency } from "@/lib/db/types";
import { useFormat } from "@/lib/i18n/use-format";
import { convert, latestRateFor, type Rate } from "@/lib/money/convert";
import { add, money, type Money } from "@/lib/money/money";
import type { AgendaItem, SubscriptionItem } from "@/lib/recurring/queries";
import { daysBetween } from "@/lib/recurring/schedule";
import { useEntrance, useFirstView } from "@/lib/motion/first-view";
import { needsAction } from "@/lib/recurring/state";
import { withFilters } from "@/lib/transactions/filters";
import { cn } from "@/lib/utils";

import { MarkPaidModal, StateBadge } from "../calendar/mark-paid-modal";
import { setRecurringStatus } from "./actions";

type Filter = "all" | "monthly" | "yearly";

function sumIn(items: Money[], to: CurrencyCode, rates: readonly Rate[]): Money {
  let total = money(0n, to);
  for (const item of items) {
    const rate = item.currency === to ? null : latestRateFor(rates, item.currency, to);
    if (item.currency === to) total = add(total, item);
    else if (rate) total = add(total, convert(item, to, rate));
  }
  return total;
}

function SummaryCard({
  icon,
  label,
  children,
}: {
  icon: IconName;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="space-y-3">
      <p className="text-callout text-ink-2 flex items-center gap-2 font-semibold">
        <Icon name={icon} size={16} className="text-violet" />
        {label}
      </p>
      {children}
    </Card>
  );
}

export function SubscriptionsView({
  items,
  upcoming,
  today,
  accounts,
}: {
  items: SubscriptionItem[];
  /** Vencimientos pendientes: los vencidos y los de los próximos 14 días. */
  upcoming: AgendaItem[];
  today: string;
  accounts: AccountSummary[];
}) {
  const t = useTranslations("subscriptions");
  const rateLimit = useTranslations("rateLimit");
  const f = useFormat();
  const toast = useToast();
  const { rates, status, displayCurrency } = useRate();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [filter, setFilter] = useState<Filter>("all");
  const [paying, setPaying] = useState<AgendaItem | null>(null);
  // Animated List (spec §7): entrada solo en la primera carga; cambiar el
  // filtro muestra la lista nueva sin animar.
  const first = useFirstView();
  const cardsEntrance = useEntrance(filter);
  const [, startTransition] = useTransition();
  const usable = status === "error" ? [] : rates;
  const active = items.filter((item) => item.status === "active");

  const openNew = () =>
    router.push(`${pathname}${withFilters(params, { sub: "new" })}`, { scroll: false });
  const openEdit = (id: string) =>
    router.push(`${pathname}${withFilters(params, { sub: id })}`, { scroll: false });

  function cancel(item: SubscriptionItem) {
    startTransition(async () => {
      const result = await setRecurringStatus(item.id, "cancelled");
      if (!result.ok) {
        toast.show({
          message: result.error === "rateLimited" ? rateLimit("write") : t("cancelFailed"),
        });
        return;
      }
      toast.show({
        message: t("cancelled"),
        onUndo: () => {
          startTransition(() => {
            void setRecurringStatus(item.id, "active");
          });
        },
      });
    });
  }

  const visible = items.filter((item) => (filter === "all" ? true : item.frequency === filter));
  const cop = active.filter((item) => item.amount.currency === "COP").length;
  const usd = active.filter((item) => item.amount.currency === "USD").length;
  const eur = active.filter((item) => item.amount.currency === "EUR").length;
  const yearly = active.filter((item) => item.frequency === "yearly").length;
  const weekly = active.filter((item) => item.frequency === "weekly").length;
  const breakdown = [
    cop ? t("breakdownCop", { count: cop }) : null,
    usd ? t("breakdownUsd", { count: usd }) : null,
    eur ? t("breakdownEur", { count: eur }) : null,
    yearly ? t("breakdownYearly", { count: yearly }) : null,
    weekly ? t("breakdownWeekly", { count: weekly }) : null,
  ]
    .filter(Boolean)
    .join(", ");

  const next = upcoming[0];
  const nextItem = next ? items.find((item) => item.id === next.itemId) : undefined;
  const week = Array.from({ length: 7 }, (_, index) => addDaysLocal(today, index));
  const dueSoon = sumIn(
    upcoming.map((item) => item.amount),
    displayCurrency,
    usable,
  );

  return (
    <div id="help-see-subscriptions" className="space-y-6">
      <TopbarSubtitle text={t("subtitle", { count: active.length })} />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <SummaryCard icon="refresh" label={t("monthlyTotal")}>
          <MoneyAmount
            variant="total"
            value={sumIn(
              active.map((item) => item.monthly),
              displayCurrency,
              usable,
            )}
            primaryClassName="text-amount-xl"
          />
        </SummaryCard>
        <SummaryCard icon="calendar" label={t("yearlyTotal")}>
          <MoneyAmount
            variant="total"
            value={sumIn(
              active.map((item) => item.yearly),
              displayCurrency,
              usable,
            )}
            primaryClassName="text-amount-xl"
          />
        </SummaryCard>
        <SummaryCard icon="layers" label={t("active")}>
          <p className="text-amount-xl text-ink tabular-nums">{active.length}</p>
          {breakdown && <p className="text-footnote text-ink-3">{breakdown}</p>}
        </SummaryCard>
        <SummaryCard icon="clock" label={t("nextCharge")}>
          {next && nextItem ? (
            <>
              <p className="text-title2 text-ink">
                {next.state === "overdue"
                  ? t("overdueLabel")
                  : relativeLabel(today, next.dueOn, t, f)}
              </p>
              <p className="text-footnote text-ink-3">
                {nextItem.name}
                {", "}
                <span className="tabular-nums">{f.money(next.amount)}</span>
              </p>
            </>
          ) : (
            <p className="text-title2 text-ink-2">{t("nextNone")}</p>
          )}
        </SummaryCard>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-headline text-ink">{t("allTitle")}</h2>
            <SegmentedControl
              label={t("filterLabel")}
              value={filter}
              onChange={setFilter}
              options={(["all", "monthly", "yearly"] as const).map((value) => ({
                value,
                label: t(`filter.${value}`),
              }))}
            />
          </div>

          {items.length === 0 ? (
            <EmptyState
              icon="refresh"
              title={t("emptyTitle")}
              description={t("emptyDescription")}
              actions={
                <Button icon="plus" onClick={openNew}>
                  {t("add")}
                </Button>
              }
            />
          ) : visible.length === 0 ? (
            <EmptyState
              icon="refresh"
              title={t("emptyFilterTitle")}
              description={t("emptyFilterDescription")}
            />
          ) : (
            <div className="grid gap-4 min-[600px]:grid-cols-2">
              <AnimatedList key={filter} animateOnMount={cardsEntrance}>
                {visible.map((item) => {
                  // Cobro de hoy o vencido de esta suscripción (el más antiguo).
                  const pendingNow = upcoming.find(
                    (event) => event.itemId === item.id && needsAction(event.state),
                  );
                  return (
                    <AnimatedListItem
                      as="article"
                      key={item.id}
                      className="rounded-card border-card-edge bg-surface shadow-card relative border p-5"
                    >
                      <button
                        type="button"
                        onClick={() => openEdit(item.id)}
                        className="flex w-full flex-col gap-3 text-left"
                      >
                        <span className="flex w-full items-center gap-4">
                          <span className="bg-violet-tint text-violet grid size-12 shrink-0 place-items-center rounded-full">
                            <Icon name={item.iconKey} />
                          </span>
                          <span className="flex min-w-0 flex-1 items-start justify-between gap-3">
                            <span className="min-w-0">
                              <span className="text-headline text-ink block truncate">
                                {item.name}
                              </span>
                              {item.subtitle && (
                                <span className="text-footnote text-ink-3 mt-0.5 block truncate">
                                  {item.subtitle}
                                </span>
                              )}
                            </span>
                            <MoneyAmount
                              value={item.amount}
                              className="shrink-0 text-right whitespace-nowrap"
                            />
                          </span>
                        </span>
                        <span className="flex flex-wrap items-center gap-2">
                          <Badge tone="violet" size="sm">
                            {frequencyLabel(item, t)}
                          </Badge>
                          {pendingNow && <StateBadge state={pendingNow.state} />}
                          {item.status === "paused" ? (
                            <Badge tone="warning" size="sm">
                              {t("paused")}
                            </Badge>
                          ) : (
                            item.nextDate && (
                              <span className="text-footnote text-ink-2 whitespace-nowrap">
                                {t("nextOn", { date: f.date(item.nextDate) })}
                              </span>
                            )
                          )}
                        </span>
                      </button>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => cancel(item)}
                          className="text-footnote text-ink-3 hover:text-negative-text whitespace-nowrap"
                        >
                          {t("cancel")}
                        </button>
                        <Button
                          size="sm"
                          variant="secondary"
                          icon="check"
                          onClick={() => pendingNow && setPaying(pendingNow)}
                          className={cn(!pendingNow && "invisible")}
                          tabIndex={pendingNow ? undefined : -1}
                          aria-hidden={!pendingNow}
                        >
                          {t("markPaid")}
                        </Button>
                      </div>
                    </AnimatedListItem>
                  );
                })}
              </AnimatedList>
              <button
                type="button"
                onClick={openNew}
                className="rounded-card border-border hover:bg-surface flex min-h-36 flex-col items-center justify-center gap-3 border-2 border-dashed p-6 transition-colors duration-100"
              >
                <span className="bg-ember-50 text-ember-text grid size-10 place-items-center rounded-full">
                  <Icon name="plus" />
                </span>
                <span className="text-body text-ink font-semibold">{t("addCard")}</span>
              </button>
            </div>
          )}
        </section>

        <Card className="space-y-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-headline text-ink">{t("upcoming")}</h2>
            <p className="text-footnote text-ink-3">{t("upcomingWindow")}</p>
          </div>
          <div className="grid grid-cols-7 gap-1" aria-label={t("weekLabel")}>
            {week.map((date) => {
              const has = upcoming.some((item) => item.dueOn === date);
              const isToday = date === today;
              return (
                <div key={date} className="flex flex-col items-center gap-1">
                  <span className="text-footnote text-ink-3">
                    {capitalize(f.date(date, "weekday"))}
                  </span>
                  <span
                    className={cn(
                      "text-footnote grid size-11 place-items-center rounded-full tabular-nums",
                      isToday ? "bg-ember-fill font-semibold text-white" : "bg-surface2 text-ink",
                    )}
                  >
                    {f.date(date, "day")}
                  </span>
                  <span
                    aria-hidden
                    className={cn("size-1.5 rounded-full", has ? "bg-violet" : "bg-transparent")}
                  />
                </div>
              );
            })}
          </div>
          {upcoming.length === 0 ? (
            <p className="text-body text-ink-2">{t("upcomingEmpty")}</p>
          ) : (
            <ul className="space-y-3">
              <AnimatedList animateOnMount={first}>
                {upcoming.map((item) => (
                  <AnimatedListItem key={item.occurrenceId} className="flex items-start gap-3">
                    <span aria-hidden className="bg-violet mt-2 size-2 shrink-0 rounded-full" />
                    <span className="min-w-0 flex-1">
                      <span className="text-body text-ink block font-semibold">{item.name}</span>
                      <span className="text-footnote text-ink-3 flex flex-wrap items-center gap-2">
                        {f.date(item.dueOn, "weekdayShort")}
                        <StateBadge state={item.state} />
                      </span>
                      {needsAction(item.state) && (
                        <button
                          type="button"
                          onClick={() => setPaying(item)}
                          className="text-callout text-ember-text mt-1 block font-semibold whitespace-nowrap hover:underline"
                        >
                          {t("markPaid")}
                        </button>
                      )}
                    </span>
                    <MoneyAmount value={item.amount} className="shrink-0 text-right" />
                  </AnimatedListItem>
                ))}
              </AnimatedList>
            </ul>
          )}
          <div className="border-border flex items-center justify-between gap-3 border-t pt-4">
            <span className="text-body text-ink-2">{t("dueNext")}</span>
            <MoneyAmount variant="total" value={dueSoon} />
          </div>
        </Card>
        <MarkPaidModal
          event={paying}
          accounts={accounts}
          today={today}
          onClose={() => setPaying(null)}
        />
      </div>
    </div>
  );
}

function addDaysLocal(date: string, days: number): string {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function relativeLabel(
  today: string,
  date: string,
  t: (key: "today" | "tomorrow") => string,
  f: ReturnType<typeof useFormat>,
): string {
  const days = daysBetween(today, date);
  if (days <= 0) return t("today");
  if (days === 1) return t("tomorrow");
  return f.date(date, "short");
}

function frequencyLabel(
  item: SubscriptionItem,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  const name = t(`frequency.${item.frequency as RecurringFrequency}`);
  return item.interval === 1 ? name : t("every", { count: item.interval, name });
}
