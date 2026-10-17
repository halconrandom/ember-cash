/**
 * Corrida diaria: deja al día los pagos de deuda, materializa 90 días hacia
 * adelante (en la zona de cada perfil) y marca como vencidos ("overdue") los
 * vencimientos con fecha pasada que nadie confirmó.
 *
 * Nunca crea transacciones (regla desde 0.10.2): la única forma de
 * registrar un pago es "Marcar como pagado". La base también lo impide:
 * post_occurrence exige un usuario y la service role no puede ejecutarla.
 */
import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { addDays, todayIn } from "@/lib/transactions/dates";

import { syncDebtRecurring } from "./debts";
import { ensureOccurrences } from "./ensure";
import { HORIZON_DAYS } from "./schedule";

export type CronResult =
  { ok: true; inserted: number; overdue: number } | { ok: false; error: string };

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
  let overdue = 0;

  for (const profile of profiles ?? []) {
    const today = todayIn(profile.timezone, now);
    await syncDebtRecurring(supabase, { ownerId: profile.id, today });
    inserted += await ensureOccurrences(supabase, addDays(today, HORIZON_DAYS), {
      from: today,
      ownerId: profile.id,
    });
    // Antes de hoy (día civil de su zona) y sin confirmar: Vencida.
    const { data: marked, error: markError } = await supabase.rpc("mark_overdue_occurrences", {
      p_owner: profile.id,
      p_today: today,
    });
    if (markError) throw new Error(`No se pudieron marcar los vencidos: ${markError.message}`);
    overdue += marked ?? 0;
  }

  return { ok: true, inserted, overdue };
}
