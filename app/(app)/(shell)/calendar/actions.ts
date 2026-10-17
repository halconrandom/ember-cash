"use server";

/**
 * Acciones de vencimientos (calendario y suscripciones).
 * - markOccurrencePaid: lo único que crea la transacción de un vencimiento
 *   (post_occurrence), con la cuenta y la fecha real de pago que elige la
 *   persona. Sirve para Por pagar, Vencida o uno futuro que se paga antes.
 * - rescheduleOccurrence: mueve solo esa ocurrencia y guarda rescheduled_from.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentProfile, requireUser } from "@/lib/auth/session";
import { rescheduleUpdate } from "@/lib/recurring/schedule";
import { createClient } from "@/lib/supabase/server";
import { DATE_PATTERN, todayIn } from "@/lib/transactions/dates";

function revalidate() {
  revalidatePath("/calendar");
  revalidatePath("/subscriptions");
  revalidatePath("/transactions");
  revalidatePath("/debts");
  revalidatePath("/household");
}

const markPaidSchema = z.object({
  occurrenceId: z.uuid(),
  accountId: z.uuid().nullable(),
  paidOn: z.string().regex(DATE_PATTERN),
});

export type PaidResult =
  | { ok: true; transactionId: string }
  | { ok: false; error: "accountRequired" | "futureDate" | "failed" | "forbidden" };

export async function markOccurrencePaid(input: unknown): Promise<PaidResult> {
  await requireUser();
  const parsed = markPaidSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "failed" };
  const { occurrenceId, accountId, paidOn } = parsed.data;
  if (!accountId) return { ok: false, error: "accountRequired" };
  // La fecha real de pago no puede ser futura (día civil de la zona del perfil).
  const profile = await getCurrentProfile();
  if (paidOn > todayIn(profile.timezone)) return { ok: false, error: "futureDate" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("post_occurrence", {
    p_occurrence_id: occurrenceId,
    p_account_id: accountId,
    p_paid_on: paidOn,
  });
  if (error || !data) {
    return { ok: false, error: error?.code === "42501" ? "forbidden" : "failed" };
  }
  revalidate();
  return { ok: true, transactionId: data };
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
  // Una vencida también se puede mover; vuelve a quedar programada (si la
  // nueva fecha ya pasó, el cron la marca otra vez como vencida).
  if (error || !current || !["scheduled", "overdue"].includes(current.status))
    return { ok: false, error: "failed" };

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
    .update({ due_on: next.dueOn, rescheduled_from: next.rescheduledFrom, status: "scheduled" })
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
