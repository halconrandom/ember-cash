/**
 * Valores actuales para "Repetir la introducción" (fase F3): la cuenta, la
 * meta, la deuda o la suscripción que ya existen, para precargar el wizard.
 * Solo lectura; no crea ni borra nada. Si el paso de cuenta o de foco ya
 * tiene algo, el wizard lo muestra y deja seguir sin duplicarlo (el mismo
 * nombre + moneda ya evita la duplicación en wizard-actions.ts).
 */
import "server-only";

import { getAccounts } from "@/lib/accounts/queries";
import type { CurrencyCode } from "@/lib/db/types";
import { listDebts } from "@/lib/debts/queries";
import { listGoals } from "@/lib/goals/queries";
import type { Locale } from "@/lib/i18n/config";
import { formatAmount } from "@/lib/money/format";
import { money } from "@/lib/money/money";
import type { Scope } from "@/lib/scope/constants";
import { createClient } from "@/lib/supabase/server";

import { wizardAccountTypeOf, type WizardAccountType } from "./logic";

export type ReplayAccountDefault = {
  type: WizardAccountType;
  name: string;
  currency: CurrencyCode;
} | null;

export type ReplayFocusDefault =
  | { choice: "savings"; name: string; target: string; current: string; currency: CurrencyCode }
  | { choice: "debt"; name: string; balance: string; currency: CurrencyCode }
  | { choice: "subscription"; name: string; amount: string; currency: CurrencyCode }
  | null;

/** La primera cuenta activa (orden alfabético, como en Ajustes). */
export async function getReplayAccountDefault(scope: Scope): Promise<ReplayAccountDefault> {
  const accounts = await getAccounts(scope);
  const first = accounts[0];
  if (!first) return null;
  return {
    type: wizardAccountTypeOf(first.type),
    name: first.name,
    currency: first.currency as CurrencyCode,
  };
}

/** La primera suscripción activa; consulta directa, sin lo de Calendario/upcoming. */
async function firstSubscription(
  scope: Scope,
): Promise<{ name: string; amount_minor: number; currency: string } | null> {
  const supabase = await createClient();
  let query = supabase
    .from("recurring_items")
    .select("name, amount_minor, currency")
    .eq("kind", "subscription")
    .eq("status", "active")
    .order("name")
    .limit(1);
  query =
    scope.kind === "personal"
      ? query.is("household_id", null)
      : query.eq("household_id", scope.householdId);
  const { data } = await query;
  return data?.[0] ?? null;
}

/**
 * Meta, deuda o suscripción existente, en ese orden (el mismo de "¿Qué
 * quieres controlar primero?"). Null si no hay ninguna todavía.
 */
export async function getReplayFocusDefault(
  scope: Scope,
  locale: Locale,
): Promise<ReplayFocusDefault> {
  const [goals, debts, sub] = await Promise.all([
    listGoals(scope),
    listDebts(),
    firstSubscription(scope),
  ]);
  const goal = goals[0];
  if (goal) {
    return {
      choice: "savings",
      name: goal.name,
      target: formatAmount(goal.target, locale),
      current: goal.saved.amountMinor > 0n ? formatAmount(goal.saved, locale) : "",
      currency: goal.target.currency,
    };
  }
  const debt = debts[0];
  if (debt) {
    return {
      choice: "debt",
      name: debt.name,
      balance: formatAmount(debt.original, locale),
      currency: debt.original.currency,
    };
  }
  if (sub) {
    const currency = sub.currency as CurrencyCode;
    return {
      choice: "subscription",
      name: sub.name,
      amount: formatAmount(money(sub.amount_minor, currency), locale),
      currency,
    };
  }
  return null;
}
