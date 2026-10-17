"use client";

/**
 * Suscripciones (05/15-subscriptions.png): cuatro tarjetas de resumen, la
 * lista con filtro Todas / Mensuales / Anuales y los cobros de los próximos
 * 14 días. La franja de 7 días marca cuáles tienen cobro; no filtra la lista
 * (en el frame el día de hoy está activo y la lista muestra otros días).
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { MoneyAmount } from "@/components/money/money-amount";
import { useRate } from "@/components/money/rate-provider";
import { TopbarSubtitle } from "@/components/shell/topbar-context";
import { Badge } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import type { IconName } from "@/components/ui/icon-registry";
import { useToast } from "@/components/ui/toast";
import type { CurrencyCode, RecurringFrequency } from "@/lib/db/types";
import { useFormat } from "@/lib/i18n/use-format";
import { convert, type Rate } from "@/lib/money/convert";
import { add, money, type Money } from "@/lib/money/money";
import type { AgendaItem, SubscriptionItem } from "@/lib/recurring/queries";
import { daysBetween } from "@/lib/recurring/schedule";
import { withFilters } from "@/lib/transactions/filters";
import { cn } from "@/lib/utils";

import { setRecurringStatus } from "./actions";

type Filter = "all" | "monthly" | "yearly";

function sumIn(items: Money[], to: CurrencyCode, rate: Rate | null): Money {
  let total = money(0n, to);
  for (const item of items) {
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
}: {
  items: SubscriptionItem[];
  upcoming: AgendaItem[];
  today: string;
}) {
  const t = useTranslations("subscriptions");
  const f = useFormat();
  const toast = useToast();
  const { rate, status, displayCurrency } = useRate();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [filter, setFilter] = useState<Filter>("all");
  const [, startTransition] = useTransition();
  const usable = status === "error" ? null : rate;
  const active = items.filter((item) => item.status === "active");

  const openNew = () =>
    router.push(`${pathname}${withFilters(params, { sub: "new" })}`, { scroll: false });
  const openEdit = (id: string) =>
    router.push(`${pathname}${withFilters(params, { sub: id })}`, { scroll: false });

  function cancel(item: SubscriptionItem) {
    startTransition(async () => {
      const result = await setRecurringStatus(item.id, "cancelled");
      if (!result.ok) {
        toast.show({ message: t("cancelFailed") });
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
  const yearly = active.filter((item) => item.frequency === "yearly").length;
  const weekly = active.filter((item) => item.frequency === "weekly").length;
  const breakdown = [
    cop ? t("breakdownCop", { count: cop }) : null,
    usd ? t("breakdownUsd", { count: usd }) : null,
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
    <div className="space-y-6">
      <TopbarSubtitle text={t("subtitle", { count: active.length })} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard icon="refresh" label={t("monthlyTotal")}>
          <MoneyAmount
            kind="total"
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
            kind="total"
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
              <p className="text-title2 text-ink">{relativeLabel(today, next.dueOn, t, f)}</p>
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
            <div
              role="radiogroup"
              aria-label={t("filterLabel")}
              className="border-seg-border bg-seg-track inline-flex h-10 items-center rounded-full border p-1"
            >
              {(["all", "monthly", "yearly"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={filter === value}
                  onClick={() => setFilter(value)}
                  className={cn(
                    "text-callout h-8 rounded-full px-4 font-semibold",
                    filter === value ? "bg-surface text-ink shadow-card" : "text-ink-2",
                  )}
                >
                  {t(`filter.${value}`)}
                </button>
              ))}
            </div>
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
            <div className="grid gap-4 md:grid-cols-2">
              {visible.map((item) => (
                <article
                  key={item.id}
                  className="rounded-card border-card-edge bg-surface shadow-card relative border p-5"
                >
                  <button
                    type="button"
                    onClick={() => openEdit(item.id)}
                    className="flex w-full items-start gap-4 text-left"
                  >
                    <span className="bg-violet-tint text-violet grid size-12 shrink-0 place-items-center rounded-full">
                      <Icon name={item.iconKey} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-headline text-ink block">{item.name}</span>
                      {item.subtitle && (
                        <span className="text-footnote text-ink-3 mt-0.5 block">
                          {item.subtitle}
                        </span>
                      )}
                      <span className="mt-3 flex flex-wrap items-center gap-2">
                        <Badge tone="violet" size="sm">
                          {frequencyLabel(item, t)}
                        </Badge>
                        {item.status === "paused" ? (
                          <Badge tone="warning" size="sm">
                            {t("paused")}
                          </Badge>
                        ) : (
                          item.nextDate && (
                            <span className="text-footnote text-ink-2">
                              {t("nextOn", { date: f.date(item.nextDate) })}
                            </span>
                          )
                        )}
                      </span>
                    </span>
                    <MoneyAmount value={item.amount} className="shrink-0 text-right" />
                  </button>
                  <button
                    type="button"
                    onClick={() => cancel(item)}
                    className="text-footnote text-ink-3 hover:text-negative-text mt-3"
                  >
                    {t("cancel")}
                  </button>
                </article>
              ))}
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
                      "text-footnote grid size-9 place-items-center rounded-full tabular-nums",
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
              {upcoming.map((item) => (
                <li key={item.occurrenceId} className="flex items-start gap-3">
                  <span aria-hidden className="bg-violet mt-2 size-2 shrink-0 rounded-full" />
                  <span className="min-w-0 flex-1">
                    <span className="text-body text-ink block font-semibold">{item.name}</span>
                    <span className="text-footnote text-ink-3">
                      {f.date(item.dueOn, "weekdayShort")}
                    </span>
                  </span>
                  <MoneyAmount value={item.amount} className="shrink-0 text-right" />
                </li>
              ))}
            </ul>
          )}
          <div className="border-border flex items-center justify-between gap-3 border-t pt-4">
            <span className="text-body text-ink-2">{t("dueNext")}</span>
            <MoneyAmount kind="total" value={dueSoon} />
          </div>
        </Card>
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
