/**
 * Lecturas de suscripciones y del calendario. Antes de leer, deja al día los
 * pagos de deuda y materializa los vencimientos del rango, así la pantalla no
 * depende de que el cron ya haya corrido. Los vencimientos pendientes
 * (programados o vencidos) llevan su estado visible (lib/recurring/state.ts).
 */
import "server-only";

import type { IconName } from "@/components/ui/icon-registry";
import type {
  CategoryKey,
  CurrencyCode,
  RecurringFrequency,
  RecurringKind,
  RecurringStatus,
} from "@/lib/db/types";
import { money, type Money } from "@/lib/money/money";
import type { Scope } from "@/lib/scope/constants";
import { createClient } from "@/lib/supabase/server";
import { addDays, monthBounds } from "@/lib/transactions/dates";

import { calendarKind, type CalendarKind } from "./calendar";
import { syncDebtRecurring } from "./debts";
import { ensureOccurrences } from "./ensure";
import { recurringIcon } from "./schema";
import { HORIZON_DAYS, occurrenceDates } from "./schedule";
import { occurrenceState, type OccurrenceState, type PendingStatus } from "./state";
import { periodEquivalent } from "./totals";

type ItemRow = {
  id: string;
  kind: RecurringKind;
  name: string;
  subtitle: string | null;
  icon_key: string | null;
  category_key: string | null;
  amount_minor: number;
  currency: string;
  account_id: string | null;
  frequency: RecurringFrequency;
  interval: number;
  anchor_date: string;
  ends_on: string | null;
  status: RecurringStatus;
  household_id: string | null;
};

export type SubscriptionItem = {
  id: string;
  name: string;
  subtitle: string | null;
  iconKey: IconName;
  amount: Money;
  /** Equivalente mensual y anual, en la moneda del ítem. */
  monthly: Money;
  yearly: Money;
  frequency: RecurringFrequency;
  interval: number;
  anchorDate: string;
  endsOn: string | null;
  nextDate: string | null;
  status: "active" | "paused";
  categoryKey: CategoryKey | null;
};

export type AgendaItem = {
  occurrenceId: string;
  itemId: string;
  name: string;
  iconKey: IconName;
  amount: Money;
  dueOn: string;
  kind: RecurringKind;
  calendarKind: CalendarKind;
  /** Cuenta sugerida al marcar como pagado (la del recurrente, si tiene). */
  accountId: string | null;
  /** Por pagar (hoy), Vencida o próxima. */
  state: OccurrenceState;
};

function amountOf(row: ItemRow, override: number | null): Money {
  return money(override ?? row.amount_minor, row.currency as CurrencyCode);
}

function toSubscription(row: ItemRow, today: string): SubscriptionItem {
  const currency = row.currency as CurrencyCode;
  const minor = BigInt(row.amount_minor);
  const next =
    row.status === "active"
      ? (occurrenceDates(
          {
            frequency: row.frequency,
            interval: row.interval,
            anchorDate: row.anchor_date,
            endsOn: row.ends_on,
            status: "active",
          },
          today,
          addDays(today, 4000),
        )[0] ?? null)
      : null;
  return {
    id: row.id,
    name: row.name,
    subtitle: row.subtitle,
    iconKey: recurringIcon(row.kind, row.icon_key),
    amount: money(minor, currency),
    monthly: money(periodEquivalent(minor, row.frequency, row.interval, "month"), currency),
    yearly: money(periodEquivalent(minor, row.frequency, row.interval, "year"), currency),
    frequency: row.frequency,
    interval: row.interval,
    anchorDate: row.anchor_date,
    endsOn: row.ends_on,
    nextDate: next,
    status: row.status === "paused" ? "paused" : "active",
    categoryKey: row.category_key as CategoryKey | null,
  };
}

/** Suscripciones del scope (activas y en pausa; las canceladas no se listan). */
export async function listSubscriptions(
  scope: Scope,
  today: string,
  ownerId: string,
): Promise<{ items: SubscriptionItem[]; upcoming: AgendaItem[] }> {
  const supabase = await createClient();
  // Sin ownerId: RLS ya limita a lo visible, incluidos los ítems del hogar
  // cuyo dueño es la otra persona. `ownerId` queda para el cron.
  void ownerId;
  await ensureOccurrences(supabase, addDays(today, HORIZON_DAYS), { from: today });

  let query = supabase
    .from("recurring_items")
    .select("*")
    .eq("kind", "subscription")
    .in("status", ["active", "paused"])
    .order("name");
  query =
    scope.kind === "personal"
      ? query.is("household_id", null)
      : query.eq("household_id", scope.householdId);
  const { data, error } = await query;
  if (error) throw new Error(`No se pudieron leer las suscripciones: ${error.message}`);
  const rows = (data ?? []) as ItemRow[];
  const items = rows.map((row) => toSubscription(row, today));

  const activeIds = rows.filter((row) => row.status === "active").map((row) => row.id);
  const until = addDays(today, 13);
  // Sin límite hacia atrás: los vencidos sin confirmar siguen apareciendo.
  const upcoming = await agenda(rows, activeIds, null, until, today);
  return { items, upcoming };
}

/** Mes del calendario: grilla, día y el próximo día de cobro. */
export async function listCalendar(
  scope: Scope,
  month: string,
  today: string,
  ownerId: string,
): Promise<{ events: AgendaItem[]; nextPayday: AgendaItem | null }> {
  const supabase = await createClient();
  await syncDebtRecurring(supabase, { ownerId, today });
  // Igual que en suscripciones: materializa lo visible, no solo lo propio.

  const gridStart = addDays(monthBounds(month).from, -6);
  const gridEnd = addDays(monthBounds(month).to, 6);
  const horizon = addDays(today, HORIZON_DAYS);
  const from = gridStart < today ? gridStart : today;
  const until = gridEnd > horizon ? gridEnd : horizon;
  await ensureOccurrences(supabase, until, { from });

  let query = supabase.from("recurring_items").select("*").eq("status", "active").order("name");
  // Las deudas son personales: se ven también cuando el scope es un hogar.
  query =
    scope.kind === "personal"
      ? query.is("household_id", null)
      : query.or(
          `household_id.eq.${scope.householdId},and(kind.eq.debt_payment,household_id.is.null)`,
        );
  const { data, error } = await query;
  if (error) throw new Error(`No se pudo leer el calendario: ${error.message}`);
  const rows = (data ?? []) as ItemRow[];
  const events = await agenda(
    rows,
    rows.map((row) => row.id),
    from,
    until,
    today,
  );
  const nextPayday =
    events
      .filter((event) => event.calendarKind === "payday" && event.dueOn >= today)
      .sort((a, b) => a.dueOn.localeCompare(b.dueOn))[0] ?? null;
  return { events, nextPayday };
}

/**
 * Vencimientos pendientes (programados o vencidos) de esos ítems, con el
 * monto del ítem o el override. `from` nulo: sin límite hacia atrás.
 */
async function agenda(
  rows: ItemRow[],
  ids: string[],
  from: string | null,
  until: string,
  today: string,
): Promise<AgendaItem[]> {
  if (ids.length === 0) return [];
  const supabase = await createClient();
  let query = supabase
    .from("recurring_occurrences")
    .select("id, recurring_item_id, due_on, amount_override_minor, status")
    .in("recurring_item_id", ids)
    .in("status", ["scheduled", "overdue"])
    .lte("due_on", until)
    .order("due_on");
  if (from) query = query.gte("due_on", from);
  const { data, error } = await query;
  if (error) throw new Error(`No se pudieron leer los vencimientos: ${error.message}`);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const items: AgendaItem[] = [];
  for (const row of data ?? []) {
    const item = byId.get(row.recurring_item_id);
    if (!item) continue;
    items.push({
      occurrenceId: row.id,
      itemId: item.id,
      name: item.name,
      iconKey: recurringIcon(item.kind, item.icon_key),
      amount: amountOf(item, row.amount_override_minor),
      dueOn: row.due_on,
      kind: item.kind,
      calendarKind: calendarKind(item.kind),
      accountId: item.account_id,
      state: occurrenceState(row.status as PendingStatus, row.due_on, today),
    });
  }
  return items;
}
