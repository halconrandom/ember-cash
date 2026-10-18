"use server";

/**
 * Server Actions de suscripciones y del resto de recurrentes que se crean a
 * mano (factura, día de cobro). Validación con zod y RLS del usuario.
 * Pausar y cancelar cambian `status`; cancelar se puede deshacer.
 */
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";

import { getCurrentProfile, requireUser } from "@/lib/auth/session";
import { isRateLimitedDbError } from "@/lib/security/rate-limit";
import { isLocale } from "@/lib/i18n/config";
import {
  validateRecurring,
  type RecurringErrorKey,
  type RecurringField,
} from "@/lib/recurring/schema";
import { scopeHouseholdId } from "@/lib/scope/constants";
import { getScope } from "@/lib/scope/server";
import { createClient } from "@/lib/supabase/server";
import { todayIn } from "@/lib/transactions/dates";

function revalidate() {
  revalidatePath("/subscriptions");
  revalidatePath("/calendar");
  revalidatePath("/transactions");
}

export type RecurringSaveResult =
  | { ok: true; id: string }
  | {
      ok: false;
      fieldErrors?: Partial<Record<RecurringField, RecurringErrorKey>>;
      error?: "failed" | "rateLimited";
    };

export async function saveRecurringItem(input: unknown): Promise<RecurringSaveResult> {
  await requireUser();
  const [locale, profile] = await Promise.all([getLocale(), getCurrentProfile()]);
  const result = validateRecurring(input, isLocale(locale) ? locale : "es");
  if (!result.ok) return { ok: false, fieldErrors: result.errors };
  const item = result.value;
  const scope = await getScope();
  const values = {
    kind: item.kind,
    name: item.name,
    subtitle: item.subtitle,
    icon_key: item.iconKey,
    category_key: item.categoryKey,
    // Hasta 15 cifras (parseMoney): cabe sin pérdida en un number.
    amount_minor: Number(item.amount.amountMinor),
    currency: item.amount.currency,
    frequency: item.frequency,
    interval: item.interval,
    anchor_date: item.anchorDate,
    ends_on: item.endsOn,
    household_id: scopeHouseholdId(scope),
  };
  const supabase = await createClient();
  const { data, error } = item.id
    ? await supabase.from("recurring_items").update(values).eq("id", item.id).select("id").single()
    : await supabase.from("recurring_items").insert(values).select("id").single();
  if (isRateLimitedDbError(error)) return { ok: false, error: "rateLimited" };
  if (error || !data) return { ok: false, error: "failed" };

  if (item.id) {
    // Los vencimientos futuros se rehacen al abrir la pantalla. Los que el
    // usuario movió (rescheduled_from) no se tocan.
    await supabase
      .from("recurring_occurrences")
      .delete()
      .eq("recurring_item_id", item.id)
      .eq("status", "scheduled")
      .gte("due_on", todayIn(profile.timezone))
      .is("rescheduled_from", null);
  }
  revalidate();
  return { ok: true, id: data.id };
}

const statusSchema = z.object({
  id: z.uuid(),
  status: z.enum(["active", "paused", "cancelled"]),
});

/** Pausa, reanuda o cancela. Cancelar es reversible (el toast llama con active). */
export async function setRecurringStatus(
  id: string,
  status: "active" | "paused" | "cancelled",
): Promise<{ ok: boolean; error?: "rateLimited" }> {
  await requireUser();
  const parsed = statusSchema.safeParse({ id, status });
  if (!parsed.success) return { ok: false };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("recurring_items")
    .update({ status }, { count: "exact" })
    .eq("id", id);
  revalidate();
  if (isRateLimitedDbError(error)) return { ok: false, error: "rateLimited" };
  return { ok: !error && count === 1 };
}
