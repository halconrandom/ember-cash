"use server";

/**
 * Acciones del día en el calendario.
 * - markOccurrencesPaid: crea la transacción (post_occurrence) y marca el
 *   vencimiento. La cuenta es la del ítem, o la que elige la persona si falta.
 * - rescheduleOccurrence: mueve solo esa ocurrencia y guarda rescheduled_from.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { rescheduleUpdate } from "@/lib/recurring/schedule";
import { createClient } from "@/lib/supabase/server";
import { DATE_PATTERN } from "@/lib/transactions/dates";

function revalidate() {
  revalidatePath("/calendar");
  revalidatePath("/subscriptions");
  revalidatePath("/transactions");
  revalidatePath("/debts");
}

export type PaidResult =
  { ok: true; count: number } | { ok: false; error: "accountRequired" | "failed" | "forbidden" };

export async function markOccurrencesPaid(
  ids: string[],
  accountId: string | null,
): Promise<PaidResult> {
  await requireUser();
  const unique = [...new Set(ids)].filter((id) => z.uuid().safeParse(id).success);
  if (unique.length === 0) return { ok: true, count: 0 };
  const fallback = accountId && z.uuid().safeParse(accountId).success ? accountId : null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recurring_occurrences")
    .select("id, recurring_items!inner(account_id, status)")
    .in("id", unique)
    .eq("status", "scheduled");
  if (error || !data) return { ok: false, error: "failed" };

  const plan: { id: string; accountId: string }[] = [];
  for (const row of data) {
    const item = Array.isArray(row.recurring_items) ? row.recurring_items[0] : row.recurring_items;
    if (!item || item.status !== "active") continue;
    const account = item.account_id ?? fallback;
    if (!account) return { ok: false, error: "accountRequired" };
    plan.push({ id: row.id, accountId: account });
  }

  let count = 0;
  for (const row of plan) {
    const { error: postError } = await supabase.rpc("post_occurrence", {
      p_occurrence_id: row.id,
      p_account_id: row.accountId,
    });
    if (postError) {
      return {
        ok: false,
        error: postError.code === "42501" ? "forbidden" : "failed",
      };
    }
    count += 1;
  }
  revalidate();
  return { ok: true, count };
}

export type RescheduleResult = { ok: true } | { ok: false; error: "conflict" | "failed" };

/** Mueve un vencimiento programado. La serie no cambia. */
export async function rescheduleOccurrence(id: string, dueOn: string): Promise<RescheduleResult> {
  await requireUser();
  if (!z.uuid().safeParse(id).success || !DATE_PATTERN.test(dueOn))
    return { ok: false, error: "failed" };

  const supabase = await createClient();
  const { data: current, error } = await supabase
    .from("recurring_occurrences")
    .select("id, recurring_item_id, due_on, rescheduled_from, status")
    .eq("id", id)
    .maybeSingle();
  if (error || !current || current.status !== "scheduled") return { ok: false, error: "failed" };

  const next = rescheduleUpdate(
    { dueOn: current.due_on, rescheduledFrom: current.rescheduled_from },
    dueOn,
  );
  if (!next.abandon) return { ok: true };

  const { data: occupied } = await supabase
    .from("recurring_occurrences")
    .select("id, status")
    .eq("recurring_item_id", current.recurring_item_id)
    .eq("due_on", next.dueOn)
    .maybeSingle();
  // Una fila skipped en la fecha de destino es el hueco de un movimiento
  // anterior: se quita para poder volver.
  if (occupied && occupied.status !== "skipped") return { ok: false, error: "conflict" };
  if (occupied) {
    const { error: dropError } = await supabase
      .from("recurring_occurrences")
      .delete()
      .eq("id", occupied.id);
    if (dropError) return { ok: false, error: "failed" };
  }

  const { error: updateError } = await supabase
    .from("recurring_occurrences")
    .update({ due_on: next.dueOn, rescheduled_from: next.rescheduledFrom })
    .eq("id", current.id);
  if (updateError)
    return { ok: false, error: updateError.code === "23505" ? "conflict" : "failed" };

  const { error: skipError } = await supabase.from("recurring_occurrences").insert({
    recurring_item_id: current.recurring_item_id,
    due_on: next.abandon,
    status: "skipped",
  });
  // Si ya había una fila en la fecha abandonada, el generador tampoco la recrea.
  if (skipError && skipError.code !== "23505") return { ok: false, error: "failed" };

  revalidate();
  return { ok: true };
}
