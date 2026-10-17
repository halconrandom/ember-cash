"use client";

/**
 * Calendario (06/16-calendar.png): mes de lunes a domingo, tres tipos de
 * cargo, "+N más", el día seleccionado (hoy y seleccionado a la vez) y el
 * resumen del mes. Los vencimientos de hoy dicen "Por pagar" y los que
 * pasaron sin confirmar, "Vencida". "Marcar como pagado" abre el modal con la
 * fecha real de pago y la cuenta: es lo único que crea la transacción.
 * "Reprogramar" mueve solo la ocurrencia elegida.
 *
 * Movimiento (spec §7): el contorno del día elegido se desliza entre celdas
 * (layoutId) y el cambio de mes hace un fundido de 150 ms (CalendarMonthFade).
 * Bajo 600 px (docs/Phone/ember-cash-mobile-1-frames/m05 y docs/Phone/full/)
 * la celda muestra hasta 3 puntos con forma; desde 600 px siguen los chips.
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { MoneyAmount } from "@/components/money/money-amount";
import { useRate } from "@/components/money/rate-provider";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/chip";
import { DateField } from "@/components/ui/date-field";
import { Icon } from "@/components/ui/icon";
import type { IconName } from "@/components/ui/icon-registry";
import type { AccountSummary } from "@/lib/accounts/queries";
import type { CurrencyCode } from "@/lib/db/types";
import { useFormat } from "@/lib/i18n/use-format";
import { convert, type Rate } from "@/lib/money/convert";
import { add, money, type Money } from "@/lib/money/money";
import {
  calendarCells,
  hiddenCount,
  VISIBLE_CHIPS,
  type CalendarKind,
} from "@/lib/recurring/calendar";
import type { AgendaItem } from "@/lib/recurring/queries";
import { daysBetween } from "@/lib/recurring/schedule";
import { monthBounds } from "@/lib/transactions/dates";
import { withFilters } from "@/lib/transactions/filters";
import { cn } from "@/lib/utils";

import { rescheduleOccurrence } from "./actions";
import { MarkPaidModal, StateBadge } from "./mark-paid-modal";

const TONE: Record<CalendarKind, string> = {
  payment_due: "bg-negative-tint text-negative-text",
  payday: "bg-positive-tint text-positive-text",
  recurring: "bg-violet-tint text-violet-text",
};
const DOT: Record<CalendarKind, string> = {
  payment_due: "bg-negative",
  payday: "bg-positive",
  recurring: "bg-violet",
};
/** Forma del punto en el teléfono: círculo due, cuadrado payday, rombo recurring. */
const DOT_SHAPE: Record<CalendarKind, string> = {
  payment_due: "rounded-full",
  payday: "rounded-[1px]",
  recurring: "rotate-45 rounded-[1px]",
};
const PHONE_DOTS = 3;
const GLANCE_ICON: Record<CalendarKind, IconName> = {
  payday: "arrow-small-down",
  payment_due: "file-invoice-dollar",
  recurring: "refresh",
};

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

function sumIn(items: Money[], to: CurrencyCode, rate: Rate | null): Money {
  let total = money(0n, to);
  for (const item of items) {
    if (item.currency === to) total = add(total, item);
    else if (rate) total = add(total, convert(item, to, rate));
  }
  return total;
}

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

export function CalendarView({
  month,
  today,
  initialDay,
  events,
  nextPayday,
  accounts,
}: {
  month: string;
  today: string;
  initialDay: string;
  events: AgendaItem[];
  nextPayday: AgendaItem | null;
  accounts: AccountSummary[];
}) {
  const t = useTranslations("calendar");
  const f = useFormat();
  const { rate, status, displayCurrency } = useRate();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [day, setDay] = useState(initialDay);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [rescheduleOn, setRescheduleOn] = useState(false);
  const [nextDate, setNextDate] = useState(initialDay);
  const [message, setMessage] = useState<string | null>(null);
  const [paying, setPaying] = useState<AgendaItem | null>(null);
  const usable = status === "error" ? null : rate;

  const cells = calendarCells(month, events);
  const dayEvents = events.filter((event) => event.dueOn === day);
  const selected =
    dayEvents.find((event) => event.occurrenceId === selectedId) ?? dayEvents[0] ?? null;
  const { from, to } = monthBounds(month);
  const inMonth = events.filter((event) => event.dueOn >= from && event.dueOn <= to);

  function goMonth(delta: number) {
    const [year, monthNumber] = month.split("-").map(Number);
    const next = new Date(Date.UTC(year, monthNumber - 1 + delta, 1)).toISOString().slice(0, 7);
    router.replace(`${pathname}${withFilters(params, { month: next, day: null })}`, {
      scroll: false,
    });
  }

  function pickDay(date: string, occurrenceId?: string) {
    setDay(date);
    setSelectedId(occurrenceId ?? null);
    setRescheduleOn(false);
    setNextDate(date);
    setMessage(null);
    router.replace(`${pathname}${withFilters(params, { day: date })}`, { scroll: false });
  }

  function reschedule() {
    if (!selected) return;
    setMessage(null);
    startTransition(async () => {
      const result = await rescheduleOccurrence(selected.occurrenceId, nextDate);
      if (!result.ok) {
        setMessage(result.error === "conflict" ? t("rescheduleConflict") : t("rescheduleFailed"));
        return;
      }
      setRescheduleOn(false);
      setDay(nextDate);
      setMessage(t("rescheduleDone"));
    });
  }

  const weekdayLabels = WEEKDAYS.map((offset) => {
    // 2026-10-12 fue lunes. Sirve solo para el nombre del día.
    return capitalize(f.date(`2026-10-${String(12 + offset).padStart(2, "0")}`, "weekday"));
  });

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <Card className="p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-title2 text-ink">
              {capitalize(f.date(`${month}-01`, "monthYear"))}
            </h2>
            <button
              type="button"
              className="text-ink-2 hover:bg-surface2 grid size-8 place-items-center rounded-full"
              aria-label={t("previousMonth")}
              onClick={() => goMonth(-1)}
            >
              <Icon name="angle-small-left" size={18} />
            </button>
            <button
              type="button"
              className="text-ink-2 hover:bg-surface2 grid size-8 place-items-center rounded-full"
              aria-label={t("nextMonth")}
              onClick={() => goMonth(1)}
            >
              <Icon name="angle-small-right" size={18} />
            </button>
          </div>
          <div className="text-footnote text-ink-2 flex flex-wrap items-center gap-3">
            {(["payment_due", "payday", "recurring"] as const).map((kind) => (
              <span key={kind} className="inline-flex items-center gap-1.5">
                <span aria-hidden className={cn("size-2 rounded-full", DOT[kind])} />
                {t(`legend.${kind}`)}
              </span>
            ))}
          </div>
        </div>

        <div className="text-footnote text-ink-3 grid grid-cols-7 px-1 pb-2 font-semibold">
          {weekdayLabels.map((label) => (
            <div key={label} className="text-center">
              {label}
            </div>
          ))}
        </div>
        <div className="border-border grid grid-cols-7 border-r border-b">
          {cells.map((cell) => {
            const isToday = cell.date === today;
            const isSelected = cell.date === day;
            const open = expanded === cell.date;
            const shown = open ? cell.events : cell.events.slice(0, VISIBLE_CHIPS);
            const extra = hiddenCount(cell.events.length);
            return (
              <div
                key={cell.date}
                className={cn(
                  "border-border relative border-t border-l p-1 min-[600px]:min-h-28 min-[600px]:p-1.5",
                  "max-[599px]:min-h-16",
                  !cell.inMonth && "bg-canvas",
                  isToday && "min-[600px]:bg-ember-50",
                )}
              >
                {isSelected && (
                  // El id lleva el mes: en el fundido hay dos meses montados
                  // y el contorno no debe cruzar de uno al otro. Es absoluto,
                  // así que no cambia el tamaño de la celda.
                  <motion.span
                    aria-hidden
                    layoutId={`calendar-selected-day-${month}`}
                    transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                    className="ring-ember-text pointer-events-none absolute inset-0 ring-2 ring-inset"
                  />
                )}
                <button
                  type="button"
                  onClick={() => pickDay(cell.date)}
                  className={cn(
                    "text-footnote mb-1 tabular-nums",
                    "max-[599px]:mx-auto max-[599px]:mb-0.5 max-[599px]:grid max-[599px]:size-11 max-[599px]:place-items-center max-[599px]:rounded-full",
                    cell.inMonth ? "text-ink" : "text-ink-3",
                    isToday && "font-semibold",
                    isToday && "max-[599px]:bg-ember-fill max-[599px]:text-white",
                  )}
                >
                  {Number(cell.date.slice(8))}
                </button>
                <div className="flex items-center justify-center gap-0.5 min-[600px]:hidden">
                  {cell.events.slice(0, PHONE_DOTS).map((event) => (
                    <span
                      key={event.occurrenceId}
                      aria-hidden
                      className={cn(
                        "size-1.5",
                        DOT[event.calendarKind],
                        DOT_SHAPE[event.calendarKind],
                      )}
                    />
                  ))}
                  {cell.events.length > PHONE_DOTS && (
                    <span className="text-footnote text-ink-2">
                      {t("more", { count: cell.events.length - PHONE_DOTS })}
                    </span>
                  )}
                </div>
                <div className="hidden space-y-1 min-[600px]:block">
                  {shown.map((event) => (
                    <button
                      key={event.occurrenceId}
                      type="button"
                      onClick={() => pickDay(cell.date, event.occurrenceId)}
                      className={cn(
                        "text-footnote block w-full truncate rounded-md px-1.5 py-0.5 text-left",
                        TONE[event.calendarKind],
                      )}
                    >
                      {event.name}
                    </button>
                  ))}
                  {extra > 0 && (
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : cell.date)}
                      className="text-footnote text-ink-2 w-full text-left"
                    >
                      {open ? t("showLess") : t("more", { count: extra })}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="space-y-6">
        <Card className="space-y-4">
          <div className="flex items-center gap-2">
            <p className="text-footnote text-ink-3 font-semibold tracking-wide uppercase">
              {t("selectedDay")}
            </p>
            {day === today && (
              <Badge tone="neutral" size="sm">
                {t("todayBadge")}
              </Badge>
            )}
          </div>
          <h2 className="text-title2 text-ink">{capitalize(f.date(day, "weekdayDate"))}</h2>
          {dayEvents.length === 0 ? (
            <p className="text-body text-ink-2">{t("noEvents")}</p>
          ) : (
            <ul className="space-y-2">
              {dayEvents.map((event) => {
                const active = selected?.occurrenceId === event.occurrenceId;
                return (
                  <li key={event.occurrenceId}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(event.occurrenceId);
                        setRescheduleOn(false);
                      }}
                      aria-pressed={active}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left",
                        active ? "bg-surface2" : "hover:bg-surface2",
                      )}
                    >
                      <span
                        className={cn(
                          "grid size-10 shrink-0 place-items-center rounded-full",
                          TONE[event.calendarKind],
                        )}
                      >
                        <Icon name={event.iconKey} size={18} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="text-body text-ink block font-semibold">{event.name}</span>
                        <span className="text-footnote text-ink-3 flex flex-wrap items-center gap-2">
                          {t(`legend.${event.calendarKind}`)}
                          <StateBadge state={event.state} />
                        </span>
                      </span>
                      <MoneyAmount
                        value={event.amount}
                        insideInteractive
                        className="shrink-0 text-right"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex items-center justify-between gap-3">
            <span className="text-body text-ink-2">
              {day === today ? t("totalToday") : t("totalDay")}
            </span>
            <MoneyAmount
              kind="total"
              value={sumIn(
                dayEvents.map((event) => event.amount),
                displayCurrency,
                usable,
              )}
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              icon="check"
              variant="secondary"
              onClick={() => {
                setMessage(null);
                setPaying(selected);
              }}
              disabled={pending || !selected}
            >
              {t("markPaid")}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setRescheduleOn((value) => !value)}
              disabled={pending || !selected}
            >
              {t("reschedule")}
            </Button>
          </div>
          {rescheduleOn && selected && (
            <div className="space-y-3">
              <p className="text-footnote text-ink-2">
                {t("rescheduleHint", { name: selected.name })}
              </p>
              <DateField label={t("rescheduleDate")} value={nextDate} onChange={setNextDate} />
              <Button variant="secondary" onClick={reschedule} disabled={pending}>
                {t("rescheduleSave")}
              </Button>
            </div>
          )}
          {message && <p className="text-callout text-ink-2">{message}</p>}
          <MarkPaidModal
            event={paying}
            accounts={accounts}
            today={today}
            onClose={() => setPaying(null)}
          />
        </Card>

        <Card className="space-y-4">
          <CardTitle>
            {t("glanceTitle", { month: capitalize(f.date(`${month}-01`, "monthYear")) })}
          </CardTitle>
          {(["payday", "payment_due", "recurring"] as const).map((kind) => {
            const group = inMonth.filter((event) => event.calendarKind === kind);
            return (
              <div key={kind} className="flex items-center gap-3">
                <span
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-full",
                    TONE[kind],
                  )}
                >
                  <Icon name={GLANCE_ICON[kind]} size={18} />
                </span>
                <span className="text-body text-ink flex-1">
                  {t(`glance.${kind}`, { count: group.length })}
                </span>
                <MoneyAmount
                  kind="total"
                  value={sumIn(
                    group.map((event) => event.amount),
                    displayCurrency,
                    usable,
                  )}
                  className="text-right"
                />
              </div>
            );
          })}
          {nextPayday && (
            <div className="bg-positive-tint flex items-center gap-3 rounded-2xl p-4">
              <span className="bg-surface text-positive-text grid size-10 place-items-center rounded-full">
                <Icon name="calendar" size={18} />
              </span>
              <span>
                <span className="text-footnote text-positive-text block">{t("nextPayday")}</span>
                <span className="text-headline text-ink block">
                  {capitalize(f.date(nextPayday.dueOn, "weekdayDate"))}
                </span>
                <span className="text-footnote text-positive-text">
                  {t("inDays", { count: Math.max(0, daysBetween(today, nextPayday.dueOn)) })}
                </span>
              </span>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

/** Curva ease-out de la spec §7. */
const EASE_OUT = [0.23, 1, 0.32, 1] as const;

/**
 * Fundido cruzado de 150 ms al cambiar de mes (spec §7). Los dos meses
 * ocupan la misma celda (`grid-cols-1`), así la altura no se duplica y solo
 * se anima la opacidad. AnimatePresence deja el mes que sale antes que el
 * nuevo, así el nuevo queda encima y recibe los clics. El primer mes
 * (también al volver a la pantalla) entra sin animar.
 */
export function CalendarMonthFade({
  month,
  children,
}: {
  month: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1">
      <AnimatePresence initial={false}>
        <motion.div
          key={month}
          className="col-start-1 row-start-1 min-w-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: EASE_OUT }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
