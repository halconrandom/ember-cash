"use server";

/**
 * Server Actions de la pantalla Hogar. Todo se valida con zod y pasa por RLS
 * con el cliente del usuario (nunca la service role).
 *
 * - createInviteLink: enlace de invitación (fase 2).
 * - createHouseholdAndSwitch: crea un hogar desde el interruptor y cambia el
 *   scope a Compartido.
 * - settleUp: registra una liquidación. "full" recalcula el balance en el
 *   servidor y guarda una liquidación por moneda, así queda exactamente en 0;
 *   "partial" guarda un solo monto en la moneda elegida.
 * - undoSettlement: Deshacer (borra las liquidaciones recién creadas).
 * - saveBudget / deleteBudget / copyBudgets: presupuestos compartidos por
 *   categoría y mes.
 * - leaveHousehold / removeMember: salir o quitar a alguien (solo con el
 *   saldo en cero; lo valida la base, 0010). dismissDepartureNotice cierra el
 *   aviso de suscripciones sin cobro automático.
 */
import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { getCurrentProfile, requireUser } from "@/lib/auth/session";
import { CURRENCY_CODES, EXPENSE_CATEGORY_KEYS } from "@/lib/db/types";
import { balancesByCurrency, fullSettlement } from "@/lib/household/balance";
import { listSettlements, listSharedTransactions } from "@/lib/household/queries";
import { householdErrorKey } from "@/lib/households/errors";
import { buildInviteUrl, generateInviteToken, hashInviteToken } from "@/lib/households/invites";
import { SCOPE_COOKIE, SCOPE_COOKIE_MAX_AGE } from "@/lib/scope/constants";
import { createClient } from "@/lib/supabase/server";
import { MONTH_PATTERN, todayIn } from "@/lib/transactions/dates";

/** Resultado de crear un link de invitación. */
export type InviteLinkResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * Genera un enlace de invitación para un hogar. El token se crea aquí y en
 * la base solo se guarda su hash. RLS impide que alguien que no sea owner
 * inserte la invitación. El error vuelve ya traducido.
 */
export async function createInviteLink(householdId: string): Promise<InviteLinkResult> {
  await requireUser();
  const supabase = await createClient();

  const token = generateInviteToken();
  const { error } = await supabase
    .from("household_invites")
    .insert({ household_id: householdId, token_hash: hashInviteToken(token) });

  if (error) {
    // 42501 = RLS rechazó el insert: el usuario no administra el hogar.
    const t = await getTranslations("householdErrors");
    return { ok: false, error: t(error.code === "42501" ? "onlyAdminCanInvite" : "inviteFailed") };
  }

  return { ok: true, url: buildInviteUrl(await requestOrigin(), token) };
}

/** Origen (protocolo + host) de la petición actual, para armar links. */
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Revalida las pantallas que dependen de datos compartidos. */
function revalidateShared() {
  revalidatePath("/household");
  revalidatePath("/transactions");
}

// ---------------------------------------------------------------------------
// Crear hogar desde el interruptor Personal / Compartido
// ---------------------------------------------------------------------------

export type CreateHouseholdResult = { ok: true } | { ok: false; error: string };

export async function createHouseholdAndSwitch(name: unknown): Promise<CreateHouseholdResult> {
  await requireUser();
  const t = await getTranslations();
  const parsed = z.string().trim().min(1).max(80).safeParse(name);
  if (!parsed.success) {
    const empty = typeof name !== "string" || name.trim().length === 0;
    return { ok: false, error: t(`onboarding.errors.${empty ? "nameRequired" : "nameTooLong"}`) };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_household", { p_name: parsed.data });
  if (error) return { ok: false, error: t(`householdErrors.${householdErrorKey(error)}`) };
  (await cookies()).set(SCOPE_COOKIE, data, {
    path: "/",
    maxAge: SCOPE_COOKIE_MAX_AGE,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Liquidaciones
// ---------------------------------------------------------------------------

const minorSchema = z
  .string()
  .regex(/^\d{1,15}$/)
  .transform((v) => BigInt(v))
  .refine((v) => v > 0n);

const settleSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("full"), householdId: z.uuid() }),
  z.object({
    mode: z.literal("partial"),
    householdId: z.uuid(),
    fromUser: z.uuid(),
    toUser: z.uuid(),
    amountMinor: minorSchema,
    currency: z.enum(CURRENCY_CODES),
  }),
]);

export type SettleResult = { ok: true; ids: string[] } | { ok: false; error: "nothing" | "failed" };

export async function settleUp(input: unknown): Promise<SettleResult> {
  await requireUser();
  const parsed = settleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "failed" };
  const p = parsed.data;
  const profile = await getCurrentProfile();
  const settledOn = todayIn(profile.timezone);

  let rows: { from_user: string; to_user: string; amount_minor: number; currency: string }[];
  if (p.mode === "full") {
    // El balance se recalcula aquí: no se confía en montos del cliente.
    const [expenses, settlements] = await Promise.all([
      listSharedTransactions(p.householdId),
      listSettlements(p.householdId),
    ]);
    const plan = fullSettlement(
      balancesByCurrency(
        expenses.map((e) => ({ ...e, income: e.kind === "income" })),
        settlements,
      ),
    );
    if (plan.length === 0) return { ok: false, error: "nothing" };
    rows = plan.map((t) => ({
      from_user: t.from,
      to_user: t.to,
      amount_minor: Number(t.amount.amountMinor),
      currency: t.amount.currency,
    }));
  } else {
    if (p.fromUser === p.toUser) return { ok: false, error: "failed" };
    rows = [
      {
        from_user: p.fromUser,
        to_user: p.toUser,
        amount_minor: Number(p.amountMinor),
        currency: p.currency,
      },
    ];
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("settlements")
    .insert(rows.map((r) => ({ ...r, household_id: p.householdId, settled_on: settledOn })))
    .select("id");
  if (error) return { ok: false, error: "failed" };
  revalidateShared();
  return { ok: true, ids: data.map((d) => d.id) };
}

export async function undoSettlement(ids: unknown): Promise<{ ok: boolean }> {
  await requireUser();
  const parsed = z.array(z.uuid()).min(1).max(10).safeParse(ids);
  if (!parsed.success) return { ok: false };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("settlements")
    .delete({ count: "exact" })
    .in("id", parsed.data);
  revalidateShared();
  return { ok: !error && count === parsed.data.length };
}

// ---------------------------------------------------------------------------
// Presupuestos compartidos
// ---------------------------------------------------------------------------

const budgetSchema = z.object({
  householdId: z.uuid(),
  categoryKey: z.enum(EXPENSE_CATEGORY_KEYS),
  month: z.string().regex(MONTH_PATTERN),
  limitMinor: minorSchema,
  currency: z.enum(CURRENCY_CODES),
});

export type BudgetResult = { ok: true } | { ok: false; error: "failed" };

/** Crea o actualiza el límite de una categoría en un mes. */
export async function saveBudget(input: unknown): Promise<BudgetResult> {
  await requireUser();
  const parsed = budgetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "failed" };
  const b = parsed.data;
  const supabase = await createClient();
  const values = {
    limit_minor: Number(b.limitMinor),
    currency: b.currency,
  };
  // El índice único es parcial (household_id no nulo), así que PostgREST no
  // puede hacer upsert con on_conflict: se busca y luego se edita o inserta.
  const { data: existing } = await supabase
    .from("budgets")
    .select("id")
    .eq("household_id", b.householdId)
    .eq("category_key", b.categoryKey)
    .eq("month", `${b.month}-01`)
    .maybeSingle();
  const { error } = existing
    ? await supabase.from("budgets").update(values).eq("id", existing.id)
    : await supabase.from("budgets").insert({
        ...values,
        household_id: b.householdId,
        category_key: b.categoryKey,
        month: `${b.month}-01`,
      });
  if (error) return { ok: false, error: "failed" };
  revalidatePath("/household");
  return { ok: true };
}

export async function deleteBudget(id: unknown): Promise<{ ok: boolean }> {
  await requireUser();
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return { ok: false };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("budgets")
    .delete({ count: "exact" })
    .eq("id", parsed.data);
  revalidatePath("/household");
  return { ok: !error && count === 1 };
}

/** Copia los límites de `fromMonth` a `toMonth` (solo las categorías que faltan). */
export async function copyBudgets(input: unknown): Promise<{ ok: boolean; count: number }> {
  await requireUser();
  const parsed = z
    .object({
      householdId: z.uuid(),
      fromMonth: z.string().regex(MONTH_PATTERN),
      toMonth: z.string().regex(MONTH_PATTERN),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, count: 0 };
  const { householdId, fromMonth, toMonth } = parsed.data;
  const supabase = await createClient();
  const [{ data: source }, { data: target }] = await Promise.all([
    supabase
      .from("budgets")
      .select("category_key, limit_minor, currency")
      .eq("household_id", householdId)
      .eq("month", `${fromMonth}-01`),
    supabase
      .from("budgets")
      .select("category_key")
      .eq("household_id", householdId)
      .eq("month", `${toMonth}-01`),
  ]);
  const taken = new Set((target ?? []).map((b) => b.category_key));
  const rows = (source ?? [])
    .filter((b) => !taken.has(b.category_key))
    .map((b) => ({ ...b, household_id: householdId, month: `${toMonth}-01` }));
  if (rows.length === 0) return { ok: true, count: 0 };
  const { error } = await supabase.from("budgets").insert(rows);
  revalidatePath("/household");
  return { ok: !error, count: error ? 0 : rows.length };
}

// ---------------------------------------------------------------------------
// Salir del hogar / quitar a un miembro
// ---------------------------------------------------------------------------

/** Errores de las RPC de salida que tienen texto propio. */
const LEAVE_ERRORS = [
  "balance_not_settled",
  "owner_cannot_leave",
  "only_owner_can_remove",
] as const;

export type LeaveResult = { ok: true } | { ok: false; error: string };

async function leaveError(message: string): Promise<LeaveResult> {
  const t = await getTranslations("household.leaveErrors");
  const key = (LEAVE_ERRORS as readonly string[]).includes(message) ? message : "generic";
  return { ok: false, error: t(key) };
}

/** La persona sale del hogar y su scope vuelve a Personal. */
export async function leaveHousehold(householdId: unknown): Promise<LeaveResult> {
  await requireUser();
  const parsed = z.uuid().safeParse(householdId);
  if (!parsed.success) return leaveError("generic");
  const supabase = await createClient();
  const { error } = await supabase.rpc("leave_household", { hid: parsed.data });
  if (error) return leaveError(error.message);
  (await cookies()).set(SCOPE_COOKIE, "personal", {
    path: "/",
    maxAge: SCOPE_COOKIE_MAX_AGE,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Quien administra quita a otra persona del hogar. */
export async function removeMember(input: unknown): Promise<LeaveResult> {
  await requireUser();
  const parsed = z.object({ householdId: z.uuid(), userId: z.uuid() }).safeParse(input);
  if (!parsed.success) return leaveError("generic");
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_household_member", {
    hid: parsed.data.householdId,
    uid: parsed.data.userId,
  });
  if (error) return leaveError(error.message);
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Cierra el aviso de una salida (para todo el hogar). */
export async function dismissDepartureNotice(id: unknown): Promise<{ ok: boolean }> {
  await requireUser();
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase
    .from("household_departures")
    .update({ notice_dismissed_at: new Date().toISOString() })
    .eq("id", parsed.data);
  revalidatePath("/household");
  return { ok: !error };
}
