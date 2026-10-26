"use server";

/**
 * Gestión mínima de cuentas (Ajustes y el modal de transacción): crear,
 * renombrar, archivar y desarchivar, y los datos de una tarjeta (cupo, día
 * de pago y saldo actual). Validación con zod y validateCreditForm (las
 * mismas reglas del wizard); RLS hace el resto.
 */
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";

import { getCurrentProfile, requireUser } from "@/lib/auth/session";
import { ACCOUNT_TYPES } from "@/lib/categories";
import { CURRENCY_CODES } from "@/lib/db/types";
import { isRateLimitedDbError, limitOr } from "@/lib/security/rate-limit";
import { scopeHouseholdId } from "@/lib/scope/constants";
import { getScope } from "@/lib/scope/server";
import { isLocale } from "@/lib/i18n/config";
import { createClient } from "@/lib/supabase/server";
import { todayIn } from "@/lib/transactions/dates";

import { creditColumns, openingFor, validateCreditForm, type CreditField } from "./credit";

export type AccountActionResult =
  | { ok: true; id: string }
  | {
      ok: false;
      error: "nameRequired" | "nameTooLong" | "invalid" | "failed" | "rateLimited";
      /** Errores de los campos de tarjeta: claves completas de messages. */
      fields?: Partial<Record<CreditField, string>>;
    };

const nameSchema = z.string().trim().min(1, "nameRequired").max(80, "nameTooLong");

function nameError(name: unknown): "nameRequired" | "nameTooLong" | null {
  const r = nameSchema.safeParse(name);
  return r.success ? null : (r.error.issues[0].message as "nameRequired" | "nameTooLong");
}

const createSchema = z.object({
  name: z.string(),
  type: z.enum(ACCOUNT_TYPES),
  currency: z.enum(CURRENCY_CODES),
  /** Cupo en unidades menores. Solo se guarda en una tarjeta; si no, null. */
  creditLimitMinor: z.number().int().positive().nullable().optional(),
  /** Día de pago (1 a 31). Solo se guarda en una tarjeta; si no, null. */
  paymentDay: z.number().int().min(1).max(31).nullable().optional(),
  /** Campos de tarjeta como los escribió la persona (Ajustes). */
  credit: z.object({ limit: z.string(), payDay: z.string(), balance: z.string() }).optional(),
});

const creditInputSchema = z.object({ limit: z.string(), payDay: z.string(), balance: z.string() });

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * Deja la deuda de hoy de la tarjeta en `targetMinor` con un único saldo
 * inicial vivo (kind opening, 0024): no es gasto ni ingreso de ningún mes.
 * 0024 no deja cambiar el monto de un opening, así que el viejo se marca
 * deleted_at y se crea otro (si falla, se restaura el viejo). Los demás
 * movimientos no se tocan. "negative" si los movimientos ya suman más deuda.
 */
async function syncCardOpening(
  supabase: Client,
  account: { id: string; name: string; currency: string; household_id: string | null },
  targetMinor: number,
): Promise<"ok" | "negative" | "failed" | "rateLimited"> {
  const [{ data: balance, error: balanceError }, { data: opening, error: openingError }] =
    await Promise.all([
      supabase.rpc("account_balance", { p_account_id: account.id }),
      supabase
        .from("transactions")
        .select("id, amount_minor, occurred_on")
        .eq("account_id", account.id)
        .eq("kind", "opening")
        .is("deleted_at", null)
        .maybeSingle(),
    ]);
  if (balanceError || openingError || balance === null) return "failed";
  const amount = openingFor(targetMinor, Number(balance), opening?.amount_minor ?? 0);
  if (amount === null) return "negative";
  if (amount === (opening?.amount_minor ?? 0)) return "ok";

  if (opening) {
    const { error } = await supabase
      .from("transactions")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", opening.id);
    if (error) return isRateLimitedDbError(error) ? "rateLimited" : "failed";
  }
  if (amount === 0) return "ok";
  const profile = await getCurrentProfile();
  const { error } = await supabase.from("transactions").insert({
    household_id: account.household_id,
    account_id: account.id,
    kind: "opening",
    description: account.name,
    amount_minor: amount,
    currency: account.currency,
    occurred_on: opening?.occurred_on ?? todayIn(profile.timezone),
  });
  if (error) {
    if (opening) {
      await supabase.from("transactions").update({ deleted_at: null }).eq("id", opening.id);
    }
    return isRateLimitedDbError(error) ? "rateLimited" : "failed";
  }
  return "ok";
}

async function currentLocale() {
  const locale = await getLocale();
  return isLocale(locale) ? locale : "es";
}

export async function createAccount(input: unknown): Promise<AccountActionResult> {
  await requireUser();
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const err = nameError(parsed.data.name);
  if (err) return { ok: false, error: err };
  // Campos de tarjeta escritos en Ajustes: mismas reglas del wizard.
  let form = null;
  if (parsed.data.credit && parsed.data.type === "credit_card") {
    const checked = validateCreditForm(
      parsed.data.credit,
      parsed.data.currency,
      await currentLocale(),
    );
    if (!checked.ok) return { ok: false, error: "invalid", fields: checked.fields };
    form = checked.value;
  }
  // Una tarjeta puede ir sin cupo (Ajustes). Otro tipo con cupo o día se rechaza.
  const credit = creditColumns(
    parsed.data.type,
    form ? form.creditLimitMinor : parsed.data.creditLimitMinor,
    form ? form.paymentDay : parsed.data.paymentDay,
  );
  if (!credit) return { ok: false, error: "invalid" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("accounts")
    .insert({
      name: parsed.data.name.trim(),
      type: parsed.data.type,
      currency: parsed.data.currency,
      household_id: scopeHouseholdId(await getScope()),
      credit_limit_minor: credit.credit_limit_minor,
      payment_day: credit.payment_day,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: limitOr(error, "failed") };
  if (form?.balanceMinor) {
    const opening = await syncCardOpening(
      supabase,
      {
        id: data.id,
        name: parsed.data.name.trim(),
        currency: parsed.data.currency,
        household_id: scopeHouseholdId(await getScope()),
      },
      form.balanceMinor,
    );
    if (opening !== "ok") {
      // Sin saldo no debe quedar la tarjeta a medias.
      await supabase.from("accounts").delete().eq("id", data.id);
      return { ok: false, error: opening === "rateLimited" ? "rateLimited" : "failed" };
    }
  }
  revalidatePath("/", "layout");
  return { ok: true, id: data.id };
}

/**
 * Edita cupo, día de pago y saldo actual de una tarjeta. Saldo vacío = no
 * se toca. Repetirlo no duplica el saldo inicial (syncCardOpening).
 */
export async function updateCreditCard(id: string, input: unknown): Promise<AccountActionResult> {
  await requireUser();
  const parsed = creditInputSchema.safeParse(input);
  if (!z.uuid().safeParse(id).success || !parsed.success) return { ok: false, error: "invalid" };
  const supabase = await createClient();
  const { data: account } = await supabase
    .from("accounts")
    .select("id, name, type, currency, household_id")
    .eq("id", id)
    .maybeSingle();
  if (!account || account.type !== "credit_card") return { ok: false, error: "invalid" };
  const checked = validateCreditForm(
    parsed.data,
    account.currency as (typeof CURRENCY_CODES)[number],
    await currentLocale(),
  );
  if (!checked.ok) return { ok: false, error: "invalid", fields: checked.fields };
  const { error } = await supabase
    .from("accounts")
    .update({
      credit_limit_minor: checked.value.creditLimitMinor,
      payment_day: checked.value.paymentDay,
    })
    .eq("id", id);
  if (error) return { ok: false, error: limitOr(error, "failed") };
  if (checked.value.balanceMinor !== null) {
    const opening = await syncCardOpening(supabase, account, checked.value.balanceMinor);
    if (opening === "negative") {
      return {
        ok: false,
        error: "invalid",
        fields: { balance: "accounts.errors.balanceBelowMovements" },
      };
    }
    if (opening !== "ok") return { ok: false, error: opening };
  }
  revalidatePath("/", "layout");
  return { ok: true, id };
}

export async function renameAccount(id: string, name: string): Promise<AccountActionResult> {
  await requireUser();
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "invalid" };
  const err = nameError(name);
  if (err) return { ok: false, error: err };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("accounts")
    .update({ name: name.trim() }, { count: "exact" })
    .eq("id", id);
  if (isRateLimitedDbError(error)) return { ok: false, error: "rateLimited" };
  if (error || count === 0) return { ok: false, error: "failed" };
  revalidatePath("/", "layout");
  return { ok: true, id };
}

export async function setAccountArchived(
  id: string,
  archived: boolean,
): Promise<AccountActionResult> {
  await requireUser();
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "invalid" };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("accounts")
    .update({ archived_at: archived ? new Date().toISOString() : null }, { count: "exact" })
    .eq("id", id);
  if (isRateLimitedDbError(error)) return { ok: false, error: "rateLimited" };
  if (error || count === 0) return { ok: false, error: "failed" };
  revalidatePath("/", "layout");
  return { ok: true, id };
}
