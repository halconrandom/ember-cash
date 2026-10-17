"use server";

/**
 * Server Actions de transacciones. Todo pasa por validación con zod
 * (validateTransaction) y por RLS con el cliente del usuario: nunca se usa la
 * service role desde aquí.
 *
 * - saveTransaction: crea o edita con la RPC save_transaction (que también
 *   rehace los repartos de las compartidas).
 * - deleteTransaction: borrado suave (deleted_at), para el toast con Deshacer.
 * - restoreTransaction: Deshacer.
 * - purgeTransaction: borrado definitivo cuando vence el toast (solo si sigue
 *   marcada como borrada).
 */
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { isLocale } from "@/lib/i18n/config";
import { CATEGORY_META } from "@/lib/categories";
import { recurringFromTransaction } from "@/lib/recurring/from-transaction";
import { scopeHouseholdId } from "@/lib/scope/constants";
import { getScope } from "@/lib/scope/server";
import { createClient } from "@/lib/supabase/server";
import {
  validateTransaction,
  type TransactionErrorKey,
  type TransactionField,
} from "@/lib/transactions/schema";

export type SaveResult =
  | { ok: true; id: string }
  | {
      ok: false;
      fieldErrors?: Partial<Record<TransactionField, TransactionErrorKey>>;
      error?: "forbidden" | "notFound" | "locked" | "failed";
    };

export async function saveTransaction(input: unknown): Promise<SaveResult> {
  const user = await requireUser();
  const locale = await getLocale();
  const result = validateTransaction(input, isLocale(locale) ? locale : "es");
  if (!result.ok) return { ok: false, fieldErrors: result.errors };
  const t = result.value;

  const scope = await getScope();
  const householdId = scopeHouseholdId(scope);
  // En Personal el pagador siempre es el usuario; en un hogar, el elegido
  // (la política "paid_by válido" exige que sea miembro).
  const paidBy = t.kind === "transfer" ? null : householdId ? (t.paidBy ?? user.id) : user.id;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_transaction", {
    p_id: t.id as string,
    p_household_id: householdId as string,
    p_account_id: t.accountId,
    p_kind: t.kind,
    p_category_key: t.categoryKey as string,
    p_description: t.description,
    p_note: t.note as string,
    // Hasta 15 cifras (parseMoney): cabe sin pérdida en un number.
    p_amount_minor: Number(t.amount.amountMinor),
    p_currency: t.amount.currency,
    p_occurred_on: t.occurredOn,
    p_paid_by: paidBy as string,
    p_transfer_to_account_id: t.transferToAccountId as string,
  });
  if (error) {
    return {
      ok: false,
      error:
        error.code === "42501"
          ? "forbidden"
          : error.code === "P0002"
            ? "notFound"
            : // Gasto con un ex miembro: solo categoría y nota (0010).
              error.message === "former_member_locked"
              ? "locked"
              : "failed",
    };
  }
  // Repetir solo al crear. La ocurrencia de esta fecha queda pagada: la
  // transacción que se acaba de guardar es ese vencimiento.
  const draft = recurringFromTransaction(t);
  if (draft) {
    const { data: item, error: itemError } = await supabase
      .from("recurring_items")
      .insert({
        household_id: householdId,
        kind: draft.kind,
        name: draft.name,
        icon_key: t.categoryKey
          ? CATEGORY_META[t.categoryKey as keyof typeof CATEGORY_META].icon
          : null,
        category_key: t.categoryKey,
        amount_minor: Number(t.amount.amountMinor),
        currency: t.amount.currency,
        account_id: t.accountId,
        frequency: draft.frequency,
        interval: 1,
        anchor_date: draft.anchorDate,
      })
      .select("id")
      .single();
    if (itemError || !item) {
      await supabase
        .from("transactions")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", data);
      return { ok: false, error: "failed" };
    }
    const { error: occurrenceError } = await supabase.from("recurring_occurrences").insert({
      recurring_item_id: item.id,
      due_on: t.occurredOn,
      status: "paid",
      transaction_id: data,
    });
    if (occurrenceError) {
      await supabase.from("recurring_items").delete().eq("id", item.id);
      await supabase
        .from("transactions")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", data);
      return { ok: false, error: "failed" };
    }
    await supabase.from("transactions").update({ recurring_item_id: item.id }).eq("id", data);
  }

  revalidatePath("/transactions");
  revalidatePath("/household");
  revalidatePath("/subscriptions");
  revalidatePath("/calendar");
  return { ok: true, id: data };
}

const idSchema = z.uuid();

async function setDeleted(id: string, deleted: boolean): Promise<{ ok: boolean }> {
  await requireUser();
  if (!idSchema.safeParse(id).success) return { ok: false };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("transactions")
    .update({ deleted_at: deleted ? new Date().toISOString() : null }, { count: "exact" })
    .eq("id", id);
  revalidatePath("/transactions");
  revalidatePath("/household");
  return { ok: !error && count === 1 };
}

export async function deleteTransaction(id: string) {
  return setDeleted(id, true);
}

export async function restoreTransaction(id: string) {
  return setDeleted(id, false);
}

export async function purgeTransaction(id: string): Promise<{ ok: boolean }> {
  await requireUser();
  if (!idSchema.safeParse(id).success) return { ok: false };
  const supabase = await createClient();
  // Solo si sigue borrada: si alguien la restauró, no se toca.
  const { error } = await supabase
    .from("transactions")
    .delete()
    .eq("id", id)
    .not("deleted_at", "is", null);
  return { ok: !error };
}
