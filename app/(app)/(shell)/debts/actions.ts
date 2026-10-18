"use server";

/**
 * Server Actions de deudas. Validación con zod (lib/debts/schema) y RLS con
 * el cliente del usuario.
 * - saveDebt: crea o edita.
 * - deleteDebt / restoreDebt / purgeDebt: borrado irreversible con un margen
 *   de 6 s para deshacer (deleted_at) y borrado definitivo al vencer.
 * - recordPayment: registra un pago (interés + capital) y, si se pide, la
 *   transacción vinculada (gasto en la cuenta elegida, con debt_id).
 */
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";

import { getCurrentProfile, requireUser } from "@/lib/auth/session";
import { limitOr } from "@/lib/security/rate-limit";
import {
  validateDebt,
  validatePayment,
  type DebtErrorKey,
  type DebtField,
  type PaymentErrorKey,
  type PaymentField,
} from "@/lib/debts/schema";
import { isLocale } from "@/lib/i18n/config";
import { markDebtOccurrencePaid, syncDebtRecurring } from "@/lib/recurring/debts";
import { createClient } from "@/lib/supabase/server";
import { todayIn } from "@/lib/transactions/dates";

async function context() {
  const user = await requireUser();
  const [locale, profile] = await Promise.all([getLocale(), getCurrentProfile()]);
  return { user, locale: isLocale(locale) ? locale : "es", today: todayIn(profile.timezone) };
}

export type DebtSaveResult =
  | { ok: true; id: string }
  | {
      ok: false;
      fieldErrors?: Partial<Record<DebtField, DebtErrorKey>>;
      error?: "failed" | "rateLimited";
    };

export async function saveDebt(input: unknown): Promise<DebtSaveResult> {
  const { user, locale, today } = await context();
  const result = validateDebt(input, locale);
  if (!result.ok) return { ok: false, fieldErrors: result.errors };
  const d = result.value;
  const values = {
    name: d.name,
    subtitle: d.subtitle,
    icon_key: d.iconKey,
    currency: d.principal.currency,
    // Hasta 15 cifras (parseMoney): cabe sin pérdida en un number.
    original_principal_minor: Number(d.principal.amountMinor),
    apr_bps: d.aprBps,
    apr_kind: d.aprKind,
    min_payment_minor: Number(d.minPayment.amountMinor),
    due_day: d.dueDay,
  };
  const supabase = await createClient();
  const { data, error } = d.id
    ? await supabase.from("debts").update(values).eq("id", d.id).select("id").single()
    : await supabase
        .from("debts")
        .insert({ ...values, started_on: today })
        .select("id")
        .single();
  if (error) return { ok: false, error: limitOr(error, "failed") };
  await syncDebtRecurring(supabase, { ownerId: user.id, today });
  revalidatePath("/debts");
  revalidatePath("/calendar");
  return { ok: true, id: data.id };
}

async function setDeleted(id: string, deleted: boolean) {
  const { user, today } = await context();
  if (!z.uuid().safeParse(id).success) return { ok: false };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("debts")
    .update({ deleted_at: deleted ? new Date().toISOString() : null }, { count: "exact" })
    .eq("id", id);
  if (!error && count === 1) await syncDebtRecurring(supabase, { ownerId: user.id, today });
  revalidatePath("/debts");
  revalidatePath("/calendar");
  return { ok: !error && count === 1 };
}

export async function deleteDebt(id: string) {
  return setDeleted(id, true);
}

export async function restoreDebt(id: string) {
  return setDeleted(id, false);
}

/** Borrado definitivo (con sus pagos), solo si sigue marcada como borrada. */
export async function purgeDebt(id: string): Promise<{ ok: boolean }> {
  await requireUser();
  if (!z.uuid().safeParse(id).success) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase
    .from("debts")
    .delete()
    .eq("id", id)
    .not("deleted_at", "is", null);
  return { ok: !error };
}

export type PaymentResult =
  | { ok: true }
  | {
      ok: false;
      fieldErrors?: Partial<Record<PaymentField, PaymentErrorKey>>;
      error?: "failed" | "rateLimited";
    };

export async function recordPayment(input: unknown): Promise<PaymentResult> {
  const { user, locale, today } = await context();
  const result = validatePayment(input, locale, today);
  if (!result.ok) return { ok: false, fieldErrors: result.errors };
  const p = result.value;
  const supabase = await createClient();

  const { data: debt } = await supabase
    .from("debts")
    .select("name, currency")
    .eq("id", p.debtId)
    .maybeSingle();
  if (!debt || debt.currency !== p.amount.currency) return { ok: false, error: "failed" };

  // Transacción vinculada (opcional): gasto personal con debt_id.
  let transactionId: string | null = null;
  if (p.accountId) {
    const { data: tx, error } = await supabase
      .from("transactions")
      .insert({
        account_id: p.accountId,
        kind: "expense",
        category_key: "other",
        description: debt.name,
        amount_minor: Number(p.amount.amountMinor),
        currency: p.amount.currency,
        occurred_on: p.paidOn,
        paid_by: user.id,
        debt_id: p.debtId,
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: limitOr(error, "failed") };
    transactionId = tx.id;
  }

  const { error } = await supabase.from("debt_payments").insert({
    debt_id: p.debtId,
    paid_on: p.paidOn,
    amount_minor: Number(p.amount.amountMinor),
    interest_minor: Number(p.interest.amountMinor),
    principal_minor: Number(p.principal.amountMinor),
    transaction_id: transactionId,
  });
  if (error) {
    // Sin pago no debe quedar la transacción suelta.
    if (transactionId) await supabase.from("transactions").delete().eq("id", transactionId);
    return { ok: false, error: limitOr(error, "failed") };
  }
  await markDebtOccurrencePaid(supabase, p.debtId, p.paidOn, transactionId);
  revalidatePath("/debts");
  revalidatePath("/transactions");
  revalidatePath("/calendar");
  return { ok: true };
}
