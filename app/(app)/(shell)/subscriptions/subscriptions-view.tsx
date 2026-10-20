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
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";

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
import { needsAction, type OccurrenceState } from "@/lib/recurring/state";
import { withFilters } from "@/lib/transactions/filters";
import { cn } from "@/lib/utils";

import { markOccurrencePaid } from "../calendar/actions";
import { MarkPaidModal, StateBadge } from "../calendar/mark-paid-modal";
import { setRecurringStatus } from "./actions";

/** Máximo de filas visibles en "Próximos cobros" antes de "Ver todos". */
const MAX_AGENDA_ROWS = 5;

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

/**
 * Monto de una fila de "Próximos cobros": el convertido a la moneda de
 * visualización arriba (número y moneda separados, como en el total de la
 * cabecera: `MoneyAmount` variant="total") y, solo si la moneda original
 * difiere, esa cifra original debajo (sin la palabra "original" ni la
 * píldora de moneda: el símbolo ya la identifica). Sin tasa, el original
 * queda como único monto.
 */
function AgendaAmount({ value }: { value: Money }) {
  const { rates, status, displayCurrency } = useRate();
  const f = useFormat();
  const differs = value.currency !== displayCurrency;
  const rate = differs && status !== "error" ? latestRateFor(rates, value.currency, displayCurrency) : null;
  const primary = rate ? convert(value, displayCurrency, rate) : value;
  const { main, unit } = f.moneyParts(primary);
  return (
    <span className="shrink-0 text-right tabular-nums whitespace-nowrap">
      <span className="text-body text-ink font-semibold">
        {main}
        {unit && <span className="text-callout text-ink-2 font-normal">{` ${unit}`}</span>}
      </span>
      {differs && rate && (
        <span className="text-callout text-ink-2 block whitespace-nowrap">{f.money(value)}</span>
      )}
    </span>
  );
}

/**
 * Meta de una fila: fecha relativa y absoluta en un solo texto ("Hoy · 20
 * oct", "Vencido hace 3 días · 17 oct"). El color y el ícono de vencido se
 * aplican en el render, según `item.state`.
 */
function dueMeta(
  today: string,
  item: Pick<AgendaItem, "dueOn" | "state">,
  f: ReturnType<typeof useFormat>,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  const date = f.date(item.dueOn, "short");
  if (item.state === "overdue") {
    return t("overdueBy", { count: daysBetween(item.dueOn, today), date });
  }
  const days = daysBetween(today, item.dueOn);
  if (days === 0) return t("dueToday", { date });
  if (days === 1) return t("dueTomorrow", { date });
  return t("dueInDays", { count: days, date });
}

/** Orden de los subgrupos de "Próximos cobros"; los vacíos no se muestran. */
const AGENDA_GROUPS: readonly { state: OccurrenceState; labelKey: string }[] = [
  { state: "overdue", labelKey: "groupOverdue" },
  { state: "due", labelKey: "groupToday" },
  { state: "upcoming", labelKey: "groupUpcoming" },
];

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
  const occurrences = useTranslations("occurrences");
  const rateLimit = useTranslations("rateLimit");
  const f = useFormat();
  const toast = useToast();
  const { rates, status, displayCurrency } = useRate();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [filter, setFilter] = useState<Filter>("all");
  const [paying, setPaying] = useState<AgendaItem | null>(null);
  // Día elegido en la tira de 7 días: filtra "Próximos cobros" a esa fecha.
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  // Fila que se marca como pagada ahora mismo (deshabilita su botón) y, tras
  // guardar, a qué fila le toca el foco (spec: "el foco pasa a la siguiente
  // fila").
  const [payingId, setPayingId] = useState<string | null>(null);
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  const payButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  // Animated List (spec §7): entrada solo en la primera carga; cambiar el
  // filtro muestra la lista nueva sin animar.
  const first = useFirstView();
  const cardsEntrance = useEntrance(filter);
  const [, startTransition] = useTransition();
  const usable = status === "error" ? [] : rates;
  const active = items.filter((item) => item.status === "active");

  useEffect(() => {
    if (!pendingFocusId) return;
    const el = payButtonRefs.current.get(pendingFocusId);
    if (el) {
      el.focus();
      setPendingFocusId(null);
    }
  }, [pendingFocusId, upcoming]);

  function markPaidQuick(item: AgendaItem, list: readonly AgendaItem[]) {
    const index = list.findIndex((event) => event.occurrenceId === item.occurrenceId);
    const nextId = list[index + 1]?.occurrenceId ?? null;
    setPayingId(item.occurrenceId);
    startTransition(async () => {
      const result = await markOccurrencePaid({
        occurrenceId: item.occurrenceId,
        accountId: item.accountId ?? accounts[0]?.id ?? null,
        paidOn: today,
      });
      setPayingId(null);
      if (!result.ok) {
        toast.show({
          message:
            result.error === "rateLimited" ? rateLimit("write") : occurrences(`errors.${result.error}`),
        });
        return;
      }
      toast.show({ message: t("markedPaid", { name: item.name }) });
      setPendingFocusId(nextId);
      router.refresh();
    });
  }

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

  // El día elegido en la tira filtra la lista; el total de la cabecera
  // siempre es el del periodo completo (14 días), sin filtrar.
  const relevantUpcoming = selectedDay
    ? upcoming.filter((item) => item.dueOn === selectedDay)
    : upcoming;
  const visibleUpcoming = relevantUpcoming.slice(0, MAX_AGENDA_ROWS);
  const hasMoreUpcoming = relevantUpcoming.length > MAX_AGENDA_ROWS;
  const groupedUpcoming = AGENDA_GROUPS.map((group) => ({
    ...group,
    items: visibleUpcoming.filter((item) => item.state === group.state),
  }));

  function toggleDay(date: string) {
    setSelectedDay((current) => (current === date ? null : date));
  }

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
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-headline text-ink">{t("upcoming")}</h2>
            <MoneyAmount variant="total" value={dueSoon} className="shrink-0 text-right" />
          </div>

          <div>
            <div className="grid grid-cols-7 gap-1" aria-label={t("weekLabel")}>
              {week.map((date) => {
                const has = upcoming.some((item) => item.dueOn === date);
                const isToday = date === today;
                const selected = selectedDay === date;
                return (
                  <button
                    key={date}
                    type="button"
                    onClick={() => toggleDay(date)}
                    aria-pressed={selected}
                    aria-label={f.date(date, "short")}
                    className={cn(
                      "rounded-control flex flex-col items-center gap-1 py-1 transition-colors duration-100",
                      selected ? "bg-surface2" : "hover:bg-surface2",
                    )}
                  >
                    <span className="text-caption text-ink-2" aria-hidden>
                      {capitalize(f.date(date, "weekday")).charAt(0)}
                    </span>
                    <span
                      className={cn(
                        "text-body font-semibold tabular-nums",
                        isToday
                          ? "text-ember-text underline decoration-2 underline-offset-4"
                          : "text-ink",
                      )}
                    >
                      {f.date(date, "day")}
                    </span>
                    <span
                      aria-hidden
                      className={cn("size-1 rounded-full", has ? "bg-violet" : "bg-transparent")}
                    />
                  </button>
                );
              })}
            </div>
            {selectedDay && (
              <p className="text-footnote text-ink-2 mt-2">
                {t("filteredBy", { date: f.date(selectedDay, "short") })}
                {" · "}
                <button
                  type="button"
                  onClick={() => setSelectedDay(null)}
                  className="text-ember-text font-semibold hover:underline"
                >
                  {t("clearFilter")}
                </button>
              </p>
            )}
          </div>

          {relevantUpcoming.length === 0 ? (
            <p className="text-body text-ink-2">{t("upcomingEmpty")}</p>
          ) : (
            <div className="space-y-4">
              {groupedUpcoming.map(
                (group) =>
                  group.items.length > 0 && (
                    <div key={group.state}>
                      <p role="heading" aria-level={3} className="text-caption text-ink-2 mb-1 uppercase">
                        {group.state === "overdue"
                          ? t("groupOverdue", { count: group.items.length })
                          : t(group.labelKey)}
                      </p>
                      <ul>
                        <AnimatedList animateOnMount={first}>
                          {group.items.map((item, index) => (
                            <AnimatedListItem
                              as="li"
                              key={item.occurrenceId}
                              className="flex min-h-16 items-center px-4"
                            >
                              <div
                                className={cn(
                                  "flex min-w-0 flex-1 flex-col gap-0.5 py-3",
                                  index > 0 && "border-border border-t",
                                )}
                              >
                                <div className="flex min-w-0 items-center gap-3">
                                  <span className="flex min-w-0 flex-1 items-center gap-2">
                                    <span
                                      aria-hidden
                                      className="bg-violet size-2 shrink-0 rounded-full"
                                    />
                                    <span className="text-body text-ink min-w-0 truncate font-semibold">
                                      {item.name}
                                    </span>
                                  </span>
                                  <div className="flex shrink-0 items-center gap-2">
                                    <AgendaAmount value={item.amount} />
                                    {needsAction(item.state) && (
                                      <button
                                        type="button"
                                        ref={(el) => {
                                          if (el) payButtonRefs.current.set(item.occurrenceId, el);
                                          else payButtonRefs.current.delete(item.occurrenceId);
                                        }}
                                        onClick={() => markPaidQuick(item, visibleUpcoming)}
                                        disabled={payingId === item.occurrenceId}
                                        aria-label={t("markPaidAria", { name: item.name })}
                                        className="press-scale -mr-1 grid size-11 shrink-0 place-items-center rounded-full disabled:opacity-60"
                                      >
                                        <span className="border-border bg-surface text-ink-2 hover:bg-surface2 hover:text-ink grid size-9 place-items-center rounded-full border transition-colors duration-100">
                                          <Icon name="check" size={16} />
                                        </span>
                                      </button>
                                    )}
                                  </div>
                                </div>
                                <div className="pl-4">
                                  {item.state === "overdue" ? (
                                    <span className="text-callout text-negative-text flex w-full min-w-0 items-center gap-1">
                                      <Icon name="exclamation" size={14} className="shrink-0" />
                                      <span className="min-w-0 truncate">{dueMeta(today, item, f, t)}</span>
                                    </span>
                                  ) : item.state === "due" ? (
                                    <span className="text-callout text-ink block truncate font-medium">
                                      {dueMeta(today, item, f, t)}
                                    </span>
                                  ) : (
                                    <span className="text-callout text-ink-2 block truncate">
                                      {dueMeta(today, item, f, t)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </AnimatedListItem>
                          ))}
                        </AnimatedList>
                      </ul>
                    </div>
                  ),
              )}
              {hasMoreUpcoming && (
                <Link
                  href="/calendar"
                  className="text-callout text-ember-text block pt-1 text-center font-semibold hover:underline"
                >
                  {t("viewAll", { count: relevantUpcoming.length })}
                </Link>
              )}
            </div>
          )}
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
