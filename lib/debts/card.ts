/**
 * Deuda enlazada a una tarjeta de crédito (0031). Una tarjeta personal con
 * deuda > 0 tiene a lo sumo una deuda con account_id; se crea o se reabre
 * al guardar la tarjeta en Ajustes y se cierra (closed_at) cuando la deuda
 * de la tarjeta llega a 0. original_principal_minor se mantiene en
 * saldo + pagado (debtBalances), para que el bot y cualquier consulta SQL
 * que use original − pagos vea el mismo saldo que la cuenta.
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { requireUser } from "@/lib/auth/session";
import type { Database } from "@/lib/db/types";
import { syncDebtRecurring } from "@/lib/recurring/debts";
import { createClient } from "@/lib/supabase/server";

type Client = SupabaseClient<Database>;

export type CardDebtTerms = { aprBps?: number | null; minPaymentMinor?: number | null };

/** Crea, reabre, cierra o resincroniza la deuda de una tarjeta. Idempotente. */
export async function syncCardDebt(
  supabase: Client,
  accountId: string,
  today: string,
  terms: CardDebtTerms = {},
): Promise<"ok" | "skipped" | "failed"> {
  const { data: account } = await supabase
    .from("accounts")
    .select("id, owner_id, name, type, currency, household_id, payment_day, archived_at")
    .eq("id", accountId)
    .maybeSingle();
  if (!account || account.type !== "credit_card" || account.household_id !== null) return "skipped";

  const [{ data: balance, error: balanceError }, { data: debt }] = await Promise.all([
    supabase.rpc("account_balance", { p_account_id: accountId }),
    supabase
      .from("debts")
      .select("id, closed_at, deleted_at, original_principal_minor, debt_payments(principal_minor)")
      .eq("account_id", accountId)
      .maybeSingle(),
  ]);
  if (balanceError || balance === null) return "failed";
  const cardDebt = Math.max(0, Number(balance));
  const termValues = {
    ...(terms.aprBps != null ? { apr_bps: terms.aprBps, apr_kind: "EA" as const } : {}),
    ...(terms.minPaymentMinor != null ? { min_payment_minor: terms.minPaymentMinor } : {}),
  };

  if (!debt) {
    if (cardDebt === 0 || account.archived_at) return "ok";
    const { error } = await supabase.from("debts").insert({
      name: account.name,
      icon_key: "credit-card",
      currency: account.currency,
      original_principal_minor: cardDebt,
      apr_bps: 0,
      apr_kind: "EA",
      min_payment_minor: 0,
      due_day: account.payment_day,
      started_on: today,
      account_id: accountId,
      ...termValues,
    });
    return error ? "failed" : "ok";
  }
  // Borrada a mano desde Deudas: se respeta.
  if (debt.deleted_at) return "ok";

  const paid = (debt.debt_payments ?? []).reduce((s, p) => s + p.principal_minor, 0);
  const open = cardDebt > 0;
  const { error } = await supabase
    .from("debts")
    .update({
      ...termValues,
      due_day: account.payment_day,
      currency: account.currency,
      // Con deuda 0, el principal se deja (> 0 por constraint) y se cierra.
      ...(open ? { original_principal_minor: cardDebt + paid } : {}),
      closed_at: open ? null : (debt.closed_at ?? new Date().toISOString()),
    })
    .eq("id", debt.id);
  return error ? "failed" : "ok";
}

/** Resincroniza todas las deudas enlazadas del usuario (antes de leer Deudas). */
export async function syncCardDebts(supabase: Client, ownerId: string, today: string) {
  const { data } = await supabase
    .from("debts")
    .select("account_id")
    .eq("owner_id", ownerId)
    .not("account_id", "is", null)
    .is("deleted_at", null);
  await Promise.all(
    (data ?? []).map((d) => (d.account_id ? syncCardDebt(supabase, d.account_id, today) : null)),
  );
}

/**
 * Para las pantallas (Deudas y el dashboard): resincroniza las deudas de
 * tarjeta del usuario y su cobro mensual antes de leer. Nunca rompe la
 * pantalla: si falla, se lee lo que haya.
 */
export async function syncMyCardDebts(today: string): Promise<void> {
  try {
    const [user, supabase] = await Promise.all([requireUser(), createClient()]);
    await syncCardDebts(supabase, user.id, today);
    await syncDebtRecurring(supabase, { ownerId: user.id, today });
  } catch {
    // Lectura igual: el saldo de la deuda sale de la cuenta de todos modos.
  }
}
