/**
 * Los pagos mínimos de las deudas abiertas son un recurrente mensual
 * kind 'debt_payment'. No se auto-registran: aparecen en el calendario como
 * pago por vencer hasta que alguien los confirma.
 *
 * El día de ancla es el due_day (el 31 cae el último día del mes). Si la
 * deuda se cierra, se borra o el mínimo pasa a 0, el recurrente se cancela.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { CurrencyCode, Database } from "@/lib/db/types";
import { monthBounds } from "@/lib/transactions/dates";

import { recurringIcon } from "./schema";
import { firstDueOnOrAfter } from "./schedule";

type Client = SupabaseClient<Database>;

type DebtRow = {
  id: string;
  owner_id: string;
  name: string;
  icon_key: string | null;
  currency: string;
  min_payment_minor: number;
  due_day: number | null;
  started_on: string;
  closed_at: string | null;
  deleted_at: string | null;
};

type ItemRow = {
  id: string;
  debt_id: string | null;
  anchor_date: string;
  amount_minor: number;
  name: string;
  status: string;
};

function keepsSchedule(debt: DebtRow): debt is DebtRow & { due_day: number } {
  return (
    debt.deleted_at == null &&
    debt.closed_at == null &&
    debt.min_payment_minor > 0 &&
    debt.due_day != null
  );
}

/**
 * Crea o actualiza el recurrente de cada deuda visible. `today` (zona del
 * perfil, o la de cada dueño en el cron) decide desde cuándo se reemplazan
 * vencimientos si cambia el día de pago.
 */
export async function syncDebtRecurring(
  supabase: Client,
  options: { ownerId?: string; today: string },
): Promise<void> {
  let debtsQuery = supabase
    .from("debts")
    .select(
      "id, owner_id, name, icon_key, currency, min_payment_minor, due_day, started_on, closed_at, deleted_at",
    );
  if (options.ownerId) debtsQuery = debtsQuery.eq("owner_id", options.ownerId);
  const { data: debts, error } = await debtsQuery;
  if (error) throw new Error(`No se pudieron leer las deudas: ${error.message}`);
  if (!debts || debts.length === 0) return;

  const debtIds = debts.map((debt) => debt.id);
  const { data: items, error: itemsError } = await supabase
    .from("recurring_items")
    .select("id, debt_id, anchor_date, amount_minor, name, status")
    .eq("kind", "debt_payment")
    .in("debt_id", debtIds);
  if (itemsError) throw new Error(`No se pudieron leer los pagos de deuda: ${itemsError.message}`);
  const byDebt = new Map<string, ItemRow>();
  for (const item of items ?? []) {
    if (item.debt_id) byDebt.set(item.debt_id, item);
  }

  for (const debt of debts as DebtRow[]) {
    const current = byDebt.get(debt.id);
    if (!keepsSchedule(debt)) {
      if (current && current.status !== "cancelled") {
        const { error: cancelError } = await supabase
          .from("recurring_items")
          .update({ status: "cancelled" })
          .eq("id", current.id);
        if (cancelError) throw new Error(cancelError.message);
      }
      continue;
    }

    const anchor = firstDueOnOrAfter(debt.started_on, debt.due_day);
    const values = {
      name: debt.name,
      icon_key: recurringIcon("debt_payment", debt.icon_key),
      category_key: "other" as const,
      amount_minor: debt.min_payment_minor,
      currency: debt.currency as CurrencyCode,
      frequency: "monthly" as const,
      interval: 1,
      anchor_date: anchor,
      status: "active" as const,
      debt_id: debt.id,
    };

    if (!current) {
      const { error: insertError } = await supabase.from("recurring_items").insert({
        ...values,
        owner_id: debt.owner_id,
        kind: "debt_payment",
      });
      if (insertError) throw new Error(insertError.message);
      continue;
    }

    const anchorChanged = current.anchor_date !== anchor;
    const { error: updateError } = await supabase
      .from("recurring_items")
      .update(values)
      .eq("id", current.id);
    if (updateError) throw new Error(updateError.message);

    // El monto vive en el ítem; solo el cambio de ancla deja vencimientos
    // futuros en el día viejo. Los movidos a mano (rescheduled_from) se quedan.
    if (anchorChanged) {
      const { error: dropError } = await supabase
        .from("recurring_occurrences")
        .delete()
        .eq("recurring_item_id", current.id)
        .eq("status", "scheduled")
        .gte("due_on", options.today)
        .is("rescheduled_from", null);
      if (dropError) throw new Error(dropError.message);
    }
  }
}

/**
 * Un pago registrado en Deudas salda el vencimiento de ese mes, para que no
 * siga en el calendario ni se vuelva a registrar.
 */
export async function markDebtOccurrencePaid(
  supabase: Client,
  debtId: string,
  paidOn: string,
  transactionId: string | null,
): Promise<void> {
  const { data: item } = await supabase
    .from("recurring_items")
    .select("id")
    .eq("debt_id", debtId)
    .eq("kind", "debt_payment")
    .maybeSingle();
  if (!item) return;

  const { from, to } = monthBounds(paidOn.slice(0, 7));
  const { data: occurrence } = await supabase
    .from("recurring_occurrences")
    .select("id")
    .eq("recurring_item_id", item.id)
    // Por pagar o vencida: el pago de ese mes la confirma.
    .in("status", ["scheduled", "overdue"])
    .gte("due_on", from)
    .lte("due_on", to)
    .limit(1)
    .maybeSingle();
  if (!occurrence) return;

  await supabase
    .from("recurring_occurrences")
    .update({ status: "paid", transaction_id: transactionId })
    .eq("id", occurrence.id);
}
