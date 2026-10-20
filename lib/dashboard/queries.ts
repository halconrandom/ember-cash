/**
 * Lecturas del dashboard (servidor). Cada tarjeta pide solo un resumen:
 *
 * - Ingresos, gastos, categorías y tendencia: la RPC dashboard_totals suma en
 *   la base por mes, tipo, categoría y moneda, y además convierte cada fila a
 *   profiles.display_currency con la tasa vigente en la fecha de esa fila
 *   (fase E3). Unas decenas de filas, nunca las transacciones; una sola
 *   llamada por petición (cache de React) sirve a las cinco tarjetas.
 * - Próximos pagos: los vencimientos pendientes de 7 días (y los vencidos),
 *   con límite de filas.
 * - Metas, deudas y suscripciones: se resumen aquí y al cliente solo llegan
 *   los totales por moneda y lo que se muestra (3 metas, 6 íconos).
 *
 * Todo respeta el scope, salvo las deudas, que siempre son personales.
 */
import "server-only";

import { cache } from "react";

import type { IconName } from "@/components/ui/icon-registry";
import { getCurrentProfile } from "@/lib/auth/session";
import type { CategoryKey, CurrencyCode, RecurringFrequency, RecurringKind } from "@/lib/db/types";
import { nextDueDate } from "@/lib/debts/dates";
import { listDebts } from "@/lib/debts/queries";
import { listGoals, type GoalSummary } from "@/lib/goals/queries";
import { add, money, type Money } from "@/lib/money/money";
import { syncDebtRecurring } from "@/lib/recurring/debts";
import { ensureOccurrences } from "@/lib/recurring/ensure";
import { recurringIcon } from "@/lib/recurring/schema";
import { occurrenceState, type OccurrenceState, type PendingStatus } from "@/lib/recurring/state";
import { periodEquivalent } from "@/lib/recurring/totals";
import { scopeHouseholdId, type Scope } from "@/lib/scope/constants";
import { createClient } from "@/lib/supabase/server";
import { addDays, monthBounds } from "@/lib/transactions/dates";

import type { AggregateRow } from "./aggregate";

/** Agrupa importes por moneda: el cliente convierte cada subtotal una vez. */
function byCurrency(items: readonly Money[]): Money[] {
  const map = new Map<CurrencyCode, Money>();
  for (const m of items)
    map.set(m.currency, map.has(m.currency) ? add(map.get(m.currency)!, m) : m);
  return [...map.values()];
}

/** Sumas de ingresos y gastos entre dos meses (AAAA-MM, inclusive), ya convertidas a display_currency. */
export const getAggregates = cache(
  async (scope: Scope, fromMonth: string, toMonth: string): Promise<AggregateRow[]> => {
    const [supabase, profile] = await Promise.all([createClient(), getCurrentProfile()]);
    const displayCurrency = profile.display_currency as CurrencyCode;
    const { data, error } = await supabase.rpc("dashboard_totals", {
      p_household_id: scopeHouseholdId(scope) as string,
      p_from: monthBounds(fromMonth).from,
      p_to: monthBounds(toMonth).to,
      p_display_currency: displayCurrency,
    });
    if (error) throw new Error(`No se pudieron leer los totales: ${error.message}`);
    return data.map((r) => ({
      month: r.month.slice(0, 7),
      kind: r.kind as AggregateRow["kind"],
      categoryKey: r.category_key as CategoryKey,
      amount: money(r.total_minor, r.currency as CurrencyCode),
      converted: money(r.converted_minor, displayCurrency),
      uncovered: r.uncovered_minor > 0 ? money(r.uncovered_minor, r.currency as CurrencyCode) : null,
      count: r.tx_count,
    }));
  },
);

export type UpcomingPayment = {
  occurrenceId: string;
  name: string;
  iconKey: IconName;
  amount: Money;
  dueOn: string;
  state: OccurrenceState;
};

/** Días hacia adelante de "Próximos pagos" (07/09-dashboard: "Next 7 days"). */
export const UPCOMING_DAYS = 7;
const UPCOMING_LIMIT = 5;

type OccurrenceRow = {
  id: string;
  due_on: string;
  status: string;
  amount_override_minor: number | null;
  recurring_items: {
    name: string;
    kind: RecurringKind;
    icon_key: string | null;
    amount_minor: number;
    currency: string;
  };
};

/**
 * Pagos pendientes de hoy a hoy + 7 días, más los vencidos sin confirmar,
 * primero los más antiguos. Los días de cobro (ingresos) no son pagos.
 */
export async function getUpcomingPayments(
  scope: Scope,
  today: string,
  ownerId: string,
): Promise<{ items: UpcomingPayment[]; total: number }> {
  const supabase = await createClient();
  const until = addDays(today, UPCOMING_DAYS);
  // Como el Calendario: deja al día los pagos mínimos de deuda y materializa
  // los vencimientos, sin depender de que el cron ya haya corrido.
  await syncDebtRecurring(supabase, { ownerId, today });
  await ensureOccurrences(supabase, until, { from: today });

  let query = supabase
    .from("recurring_occurrences")
    .select(
      "id, due_on, status, amount_override_minor, recurring_items!inner(name, kind, icon_key, amount_minor, currency, household_id, status)",
      { count: "exact" },
    )
    .in("status", ["scheduled", "overdue"])
    .lte("due_on", until)
    .eq("recurring_items.status", "active")
    .neq("recurring_items.kind", "income")
    .order("due_on")
    .limit(UPCOMING_LIMIT);
  // Las deudas son personales: sus pagos se ven también en un hogar.
  query =
    scope.kind === "personal"
      ? query.is("recurring_items.household_id", null)
      : query.or(
          `household_id.eq.${scope.householdId},and(kind.eq.debt_payment,household_id.is.null)`,
          { referencedTable: "recurring_items" },
        );
  const { data, error, count } = await query;
  if (error) throw new Error(`No se pudieron leer los próximos pagos: ${error.message}`);
  const items = (data as unknown as OccurrenceRow[]).map((row) => {
    const item = row.recurring_items;
    return {
      occurrenceId: row.id,
      name: item.name,
      iconKey: recurringIcon(item.kind, item.icon_key),
      amount: money(row.amount_override_minor ?? item.amount_minor, item.currency as CurrencyCode),
      dueOn: row.due_on,
      state: occurrenceState(row.status as PendingStatus, row.due_on, today),
    };
  });
  return { items, total: count ?? items.length };
}

export type GoalsSummary = { count: number; top: GoalSummary[] };

/** Metas activas del scope: cuántas y las 3 primeras (mismo orden que Ahorros). */
export async function getGoalsSummary(scope: Scope): Promise<GoalsSummary> {
  const goals = await listGoals(scope);
  return { count: goals.length, top: goals.slice(0, 3) };
}

export type DebtsSummary = {
  count: number;
  /** Totales por moneda (el cliente convierte). */
  balances: Money[];
  originals: Money[];
  paid: Money[];
  minimums: Money[];
  nextDue: string | null;
};

/** Deudas abiertas: saldo, pagado, mínimos y el próximo vencimiento. */
export async function getDebtsSummary(today: string): Promise<DebtsSummary> {
  const debts = (await listDebts()).filter((d) => d.balance.amountMinor > 0n);
  const dues = debts
    .filter((d) => d.dueDay !== null)
    .map((d) => nextDueDate(d.dueDay!, today))
    .sort();
  return {
    count: debts.length,
    balances: byCurrency(debts.map((d) => d.balance)),
    originals: byCurrency(debts.map((d) => d.original)),
    paid: byCurrency(debts.map((d) => d.paid)),
    minimums: byCurrency(debts.map((d) => d.minPayment)),
    nextDue: dues[0] ?? null,
  };
}

export type SubscriptionsSummary = {
  count: number;
  /** Equivalente mensual por moneda. */
  monthly: Money[];
  /** Íconos de las primeras suscripciones (06 en el frame) y cuántas faltan. */
  icons: IconName[];
};

const SUBSCRIPTION_ICONS = 6;

/** Suscripciones activas del scope y su total mensual. */
export async function getSubscriptionsSummary(scope: Scope): Promise<SubscriptionsSummary> {
  const supabase = await createClient();
  let query = supabase
    .from("recurring_items")
    .select("kind, icon_key, amount_minor, currency, frequency, interval")
    .eq("kind", "subscription")
    .eq("status", "active")
    .order("name");
  query =
    scope.kind === "personal"
      ? query.is("household_id", null)
      : query.eq("household_id", scope.householdId);
  const { data, error } = await query;
  if (error) throw new Error(`No se pudieron leer las suscripciones: ${error.message}`);
  return {
    count: data.length,
    monthly: byCurrency(
      data.map((s) =>
        money(
          periodEquivalent(
            BigInt(s.amount_minor),
            s.frequency as RecurringFrequency,
            s.interval,
            "month",
          ),
          s.currency as CurrencyCode,
        ),
      ),
    ),
    icons: data
      .slice(0, SUBSCRIPTION_ICONS)
      .map((s) => recurringIcon(s.kind as RecurringKind, s.icon_key)),
  };
}
