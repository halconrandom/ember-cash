"use server";

/**
 * Server Actions de deudas. Validación con zod (lib/debts/schema) y RLS con
 * el cliente del usuario.
 * - saveDebt: crea o edita, con el pago inicial opcional (saldo actual).
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
import { ensureOccurrences } from "@/lib/recurring/ensure";
import { syncCardDebt } from "@/lib/debts/card";
import { createClient } from "@/lib/supabase/server";
import { monthBounds, todayIn } from "@/lib/transactions/dates";

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
  // Hasta 15 cifras (parseMoney): cabe sin pérdida en un number.
  const principalMinor = Number(d.principal.amountMinor);
  const values = {
    name: d.name,
    subtitle: d.subtitle,
    icon_key: d.iconKey,
    currency: d.principal.currency,
    apr_bps: d.aprBps,
    apr_kind: d.aprKind,
    min_payment_minor: Number(d.minPayment.amountMinor),
    due_day: d.dueDay,
    exclude_from_plan: !d.includeInPlan,
  };
  const supabase = await createClient();
  // Deuda enlazada a una tarjeta (0031): principal y moneda vienen de la
  // cuenta; aquí solo cambian nombre, ícono, tasa, mínimo, día y plan. El
  // día de pago se guarda también en la tarjeta (es el mismo cobro).
  if (d.id) {
    const { data: linked } = await supabase
      .from("debts")
      .select("account_id, currency")
      .eq("id", d.id)
      .maybeSingle();
    if (linked?.account_id) {
      const { error } = await supabase
        .from("debts")
        .update({ ...values, currency: linked.currency })
        .eq("id", d.id);
      if (error) return { ok: false, error: limitOr(error, "failed") };
      await supabase.from("accounts").update({ payment_day: d.dueDay }).eq("id", linked.account_id);
      await syncCardDebt(supabase, linked.account_id, today);
      await syncDebtRecurring(supabase, { ownerId: user.id, today });
      revalidatePath("/debts");
      revalidatePath("/calendar");
      revalidatePath("/settings");
      return { ok: true, id: d.id };
    }
  }
  // Al editar, el principal lo fija set_debt_opening junto con el pago
  // inicial (así bajar el principal y el pago inicial a la vez no choca con
  // debts_guard_principal).
  const { data, error } = d.id
    ? await supabase.from("debts").update(values).eq("id", d.id).select("id").single()
    : await supabase
        .from("debts")
        .insert({ ...values, original_principal_minor: principalMinor, started_on: today })
        .select("id")
        .single();
  if (error) return { ok: false, error: limitOr(error, "failed") };

  // Pago inicial: sin transacción ni vencimiento saldado (0029). Al crear sin
  // saldo actual no hace falta llamarlo (no hay nada que fijar).
  if (d.id || d.balance) {
    const { data: opening, error: openingError } = await supabase.rpc("set_debt_opening", {
      p_debt_id: data.id,
      p_principal_minor: principalMinor,
      // Nulable en SQL (= sin pago inicial); gen types lo marca obligatorio.
      p_balance_minor: (d.balance ? Number(d.balance.amountMinor) : null) as unknown as number,
    });
    if (openingError || opening !== "ok") {
      // Al crear, que no quede la deuda a medias.
      if (!d.id) await supabase.from("debts").delete().eq("id", data.id);
      if (opening === "balance_too_high")
        return { ok: false, fieldErrors: { balance: "balanceTooHigh" } };
      if (opening === "principal_below_paid")
        return { ok: false, fieldErrors: { principal: "principalBelowPaid" } };
      return { ok: false, error: openingError ? limitOr(openingError, "failed") : "failed" };
    }
  }
  await syncDebtRecurring(supabase, { ownerId: user.id, today });
  // "El saldo ya incluye el pago de este mes" (solo al crear): el vencimiento
  // del mes queda pagado sin transacción ni pago de capital. Si el día de
  // pago de este mes ya pasó, no hay vencimiento este mes y no hace nada.
  if (d.paidThisMonth) await settleMonth(supabase, user.id, data.id, today, null);
  revalidatePath("/debts");
  revalidatePath("/calendar");
  return { ok: true, id: data.id };
}

/**
 * Salda el vencimiento del mes de `date`. Primero materializa los
 * vencimientos de ese mes (idempotente), por si el cron o el calendario
 * todavía no los crearon: si no, markDebtOccurrencePaid no encuentra nada y
 * la tarjeta seguiría diciendo "Vence el …".
 */
async function settleMonth(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ownerId: string,
  debtId: string,
  date: string,
  transactionId: string | null,
) {
  const { from, to } = monthBounds(date.slice(0, 7));
  await ensureOccurrences(supabase, to, { from, ownerId });
  await markDebtOccurrencePaid(supabase, debtId, date, transactionId);
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
    .select("name, currency, account_id")
    .eq("id", p.debtId)
    .maybeSingle();
  if (!debt || debt.currency !== p.amount.currency) return { ok: false, error: "failed" };

  // Tarjeta enlazada (0031): el pago es una transferencia de otra cuenta a la
  // tarjeta. Baja la deuda de la tarjeta y no es gasto ni ingreso (las
  // compras de la tarjeta ya son los gastos). Todo el monto es capital: el
  // interés que cobre el banco entra como movimiento de la tarjeta.
  if (debt.account_id) {
    if (!p.accountId || p.accountId === debt.account_id) {
      return { ok: false, fieldErrors: { accountId: "accountRequired" } };
    }
    const { data: tx, error: txError } = await supabase
      .from("transactions")
      .insert({
        account_id: p.accountId,
        transfer_to_account_id: debt.account_id,
        kind: "transfer",
        description: debt.name,
        amount_minor: Number(p.amount.amountMinor),
        currency: p.amount.currency,
        occurred_on: p.paidOn,
        debt_id: p.debtId,
      })
      .select("id")
      .single();
    if (txError) return { ok: false, error: limitOr(txError, "failed") };
    const { error: payError } = await supabase.from("debt_payments").insert({
      debt_id: p.debtId,
      paid_on: p.paidOn,
      amount_minor: Number(p.amount.amountMinor),
      interest_minor: 0,
      principal_minor: Number(p.amount.amountMinor),
      transaction_id: tx.id,
    });
    if (payError) {
      await supabase.from("transactions").delete().eq("id", tx.id);
      return { ok: false, error: limitOr(payError, "failed") };
    }
    await settleMonth(supabase, user.id, p.debtId, p.paidOn, tx.id);
    await syncCardDebt(supabase, debt.account_id, today);
    revalidatePath("/debts");
    revalidatePath("/transactions");
    revalidatePath("/calendar");
    revalidatePath("/settings");
    return { ok: true };
  }

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
  await settleMonth(supabase, user.id, p.debtId, p.paidOn, transactionId);
  revalidatePath("/debts");
  revalidatePath("/transactions");
  revalidatePath("/calendar");
  return { ok: true };
}
