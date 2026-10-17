/**
 * Corrida diaria: materializa 90 días hacia adelante (en la zona de cada
 * perfil) y registra las transacciones de hoy.
 *
 * Solo se auto-registran suscripciones y pagos de deuda con auto_post.
 * Las facturas (bill) y los días de cobro (income) quedan pendientes hasta
 * que alguien los confirma, aunque la columna auto_post esté en true.
 * Los pagos de deuda que crea la app nacen con auto_post en false.
 */
import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { addDays, todayIn } from "@/lib/transactions/dates";

import { syncDebtRecurring } from "./debts";
import { ensureOccurrences } from "./ensure";
import { HORIZON_DAYS } from "./schedule";

const AUTO_KINDS = ["subscription", "debt_payment"] as const;

export type CronResult =
  { ok: true; inserted: number; posted: number; skipped: number } | { ok: false; error: string };

/** Una pasada para todos los perfiles. Un fallo de base vuelve como ok: false. */
export async function runOccurrencesCron(now: Date = new Date()): Promise<CronResult> {
  try {
    return await runOccurrences(now);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "failed" };
  }
}

async function runOccurrences(now: Date): Promise<Extract<CronResult, { ok: true }>> {
  const supabase = createAdminClient();
  const { data: profiles, error } = await supabase.from("profiles").select("id, timezone");
  if (error) throw new Error(`No se pudieron leer los perfiles: ${error.message}`);

  let inserted = 0;
  let posted = 0;
  let skipped = 0;

  for (const profile of profiles ?? []) {
    const today = todayIn(profile.timezone, now);
    await syncDebtRecurring(supabase, { ownerId: profile.id, today });
    inserted += await ensureOccurrences(supabase, addDays(today, HORIZON_DAYS), {
      from: today,
      ownerId: profile.id,
    });

    const { data: due, error: dueError } = await supabase
      .from("recurring_occurrences")
      .select("id, recurring_items!inner(kind, auto_post, status, account_id, owner_id)")
      .eq("status", "scheduled")
      .eq("due_on", today)
      .eq("recurring_items.owner_id", profile.id)
      .eq("recurring_items.status", "active")
      .eq("recurring_items.auto_post", true)
      .in("recurring_items.kind", [...AUTO_KINDS]);
    if (dueError)
      throw new Error(`No se pudieron leer los vencimientos de hoy: ${dueError.message}`);

    for (const row of due ?? []) {
      const item = row.recurring_items;
      // El embed !inner devuelve el objeto, no un arreglo.
      const accountId = Array.isArray(item) ? item[0]?.account_id : item.account_id;
      if (!accountId) {
        skipped += 1;
        continue;
      }
      const { error: postError } = await supabase.rpc("post_occurrence", {
        p_occurrence_id: row.id,
        p_account_id: accountId,
      });
      if (postError) skipped += 1;
      else posted += 1;
    }
  }

  return { ok: true, inserted, posted, skipped };
}
