/**
 * ¿Qué pendientes de Primeros pasos ya existen? Solo cuenta filas (head),
 * no trae transacciones para sumarlas. Un fallo se propaga: la tarjeta del
 * panel lo aísla con safe().
 */
import "server-only";

import { createClient } from "@/lib/supabase/server";

import type { FirstStepFlags } from "./first-steps";

/** Gasto, meta, deuda o una invitación / otra persona en el hogar. */
export async function loadFirstStepFlags(): Promise<FirstStepFlags> {
  const supabase = await createClient();
  const [expense, goal, debt, members, invites] = await Promise.all([
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("kind", "expense")
      .is("deleted_at", null),
    supabase.from("goals").select("id", { count: "exact", head: true }),
    supabase.from("debts").select("id", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("household_members").select("user_id", { count: "exact", head: true }),
    supabase.from("household_invites").select("id", { count: "exact", head: true }),
  ]);
  const failed = [expense, goal, debt, members, invites].find((result) => result.error);
  if (failed?.error)
    throw new Error(`No se pudieron leer los primeros pasos: ${failed.error.message}`);
  return {
    expense: (expense.count ?? 0) > 0,
    goal: (goal.count ?? 0) > 0,
    debt: (debt.count ?? 0) > 0,
    // Una persona sola no cuenta: hace falta alguien más, o una invitación enviada.
    household: (members.count ?? 0) > 1 || (invites.count ?? 0) > 0,
  };
}
