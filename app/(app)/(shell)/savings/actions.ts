"use server";

/**
 * Server Actions de metas. Validación con zod (lib/goals/schema) y RLS con
 * el cliente del usuario; nunca la service role.
 * - saveGoal: crea o edita una meta en el scope actual.
 * - setGoalArchived: archiva o desarchiva (archivar se deshace con el toast).
 * - addContribution: registra un aporte en la moneda de la meta, opcionalmente
 *   vinculado a una transacción (el trigger exige que sea visible).
 */
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";

import { getCurrentProfile, requireUser } from "@/lib/auth/session";
import { isRateLimitedDbError, limitOr } from "@/lib/security/rate-limit";
import {
  validateContribution,
  validateGoal,
  type ContributionErrorKey,
  type ContributionField,
  type GoalErrorKey,
  type GoalField,
} from "@/lib/goals/schema";
import { isLocale } from "@/lib/i18n/config";
import { scopeHouseholdId } from "@/lib/scope/constants";
import { getScope } from "@/lib/scope/server";
import { createClient } from "@/lib/supabase/server";
import { todayIn } from "@/lib/transactions/dates";

async function context() {
  await requireUser();
  const [locale, profile] = await Promise.all([getLocale(), getCurrentProfile()]);
  return { locale: isLocale(locale) ? locale : "es", today: todayIn(profile.timezone) };
}

export type GoalSaveResult =
  | { ok: true; id: string }
  | {
      ok: false;
      fieldErrors?: Partial<Record<GoalField, GoalErrorKey>>;
      error?: "failed" | "rateLimited";
    };

export async function saveGoal(input: unknown): Promise<GoalSaveResult> {
  const { locale, today } = await context();
  const result = validateGoal(input, locale, today);
  if (!result.ok) return { ok: false, fieldErrors: result.errors };
  const g = result.value;

  const supabase = await createClient();
  const values = {
    name: g.name,
    icon_key: g.iconKey,
    // Hasta 15 cifras (parseMoney): cabe sin pérdida en un number.
    target_minor: Number(g.target.amountMinor),
    currency: g.target.currency,
    target_date: g.targetDate,
    monthly_contribution_minor: g.monthly ? Number(g.monthly.amountMinor) : null,
  };
  const { data, error } = g.id
    ? await supabase.from("goals").update(values).eq("id", g.id).select("id").single()
    : await supabase
        .from("goals")
        .insert({ ...values, household_id: scopeHouseholdId(await getScope()), started_on: today })
        .select("id")
        .single();
  if (error) return { ok: false, error: limitOr(error, "failed") };
  revalidatePath("/savings");
  return { ok: true, id: data.id };
}

export async function setGoalArchived(
  id: string,
  archived: boolean,
): Promise<{ ok: boolean; error?: "rateLimited" }> {
  await requireUser();
  if (!z.uuid().safeParse(id).success) return { ok: false };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("goals")
    .update({ archived_at: archived ? new Date().toISOString() : null }, { count: "exact" })
    .eq("id", id);
  revalidatePath("/savings");
  if (isRateLimitedDbError(error)) return { ok: false, error: "rateLimited" };
  return { ok: !error && count === 1 };
}

export type ContributionResult =
  | { ok: true }
  | {
      ok: false;
      fieldErrors?: Partial<Record<ContributionField, ContributionErrorKey>>;
      error?: "currencyMismatch" | "failed" | "rateLimited";
    };

export async function addContribution(input: unknown): Promise<ContributionResult> {
  const { locale, today } = await context();
  const result = validateContribution(input, locale, today);
  if (!result.ok) return { ok: false, fieldErrors: result.errors };
  const c = result.value;

  const supabase = await createClient();
  // El aporte va en la moneda de la meta (RLS: si la meta no es visible, no existe).
  const { data: goal } = await supabase
    .from("goals")
    .select("currency")
    .eq("id", c.goalId)
    .maybeSingle();
  if (!goal) return { ok: false, error: "failed" };
  if (goal.currency !== c.amount.currency) return { ok: false, error: "currencyMismatch" };

  const { error } = await supabase.from("goal_contributions").insert({
    goal_id: c.goalId,
    amount_minor: Number(c.amount.amountMinor),
    currency: c.amount.currency,
    contributed_on: c.contributedOn,
    transaction_id: c.transactionId,
  });
  if (error) return { ok: false, error: limitOr(error, "failed") };
  revalidatePath("/savings");
  return { ok: true };
}
