"use server";

/**
 * Acciones del wizard. Extienden /onboarding: guardan profiles.onboarding_step
 * y, al terminar o al omitir, onboarded_at. No crean un segundo flujo.
 * La cuenta, la meta, la deuda y la suscripción pasan por las acciones que
 * ya existen. El saldo inicial es un movimiento kind opening: no es un
 * ingreso ni un gasto del mes, y la cuenta sigue sin columna de saldo.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

import { saveDebt } from "@/app/(app)/(shell)/debts/actions";
import { addContribution, saveGoal } from "@/app/(app)/(shell)/savings/actions";
import { saveRecurringItem } from "@/app/(app)/(shell)/subscriptions/actions";
import { createAccount } from "@/lib/accounts/actions";
import { getCurrentProfile, requireUser } from "@/lib/auth/session";
import type { CurrencyCode } from "@/lib/db/types";
import { recordEventOnce } from "@/lib/events/record";
import type { EventName } from "@/lib/events/validate";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/i18n/config";
import { parseMoney } from "@/lib/money/parse";
import {
  defaultCurrencyForLocale,
  validateAccountForm,
  validateFocusForm,
  type FieldErrors,
} from "@/lib/onboarding/logic";
import { isRateLimitedDbError } from "@/lib/security/rate-limit";
import { scopeHouseholdId, type Scope } from "@/lib/scope/constants";
import { getScope } from "@/lib/scope/server";
import { createClient } from "@/lib/supabase/server";
import { todayIn } from "@/lib/transactions/dates";

/** Error ya como clave de messages. fields usa la misma forma. */
export type StepResult = { formError: string | null; fields: FieldErrors };

function failed(
  kind: "failed" | "rateLimited",
  fallback = "onboarding.errors.saveFailed",
): StepResult {
  return { formError: kind === "rateLimited" ? "rateLimit.write" : fallback, fields: {} };
}

async function localeOf(): Promise<Locale> {
  const [raw, profile] = await Promise.all([getLocale(), getCurrentProfile()]);
  if (isLocale(raw)) return raw;
  // El CHECK de la base solo admite es|en; el tipo generado sigue siendo string.
  return isLocale(profile.locale) ? profile.locale : DEFAULT_LOCALE;
}

async function patchProfile(
  userId: string,
  patch: {
    display_currency?: CurrencyCode;
    onboarding_step?: number;
    onboarded_at?: string;
    dashboard_hint_dismissed_at?: string;
    first_steps_dismissed_at?: string;
  },
): Promise<"ok" | "failed" | "rateLimited"> {
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("profiles")
    .update(patch, { count: "exact" })
    .eq("id", userId);
  if (isRateLimitedDbError(error)) return "rateLimited";
  if (error || count !== 1) return "failed";
  return "ok";
}

/** ¿Ya quedó registrado este paso? Un reintento no debe volver a emitirlo. */
async function stepWasCompleted(step: number): Promise<boolean | "failed"> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select("id")
    .eq("name", "onboarding_step_completed")
    .contains("props", { step })
    .limit(1);
  if (error) return "failed";
  return (data?.length ?? 0) > 0;
}

/**
 * Si todavía no confirmó la moneda, deja la del idioma. Omitir y Empezar
 * pasan por aquí: un paso 1 ya guardado no se pisa.
 */
async function ensureLocaleCurrency(userId: string): Promise<"ok" | "failed" | "rateLimited"> {
  const done = await stepWasCompleted(1);
  if (done === "failed") return "failed";
  if (done === true) return "ok";
  const [profile, locale] = await Promise.all([getCurrentProfile(), localeOf()]);
  const next = defaultCurrencyForLocale(locale);
  if (profile.display_currency === next) return "ok";
  return patchProfile(userId, { display_currency: next });
}

async function mark(name: EventName, props: unknown): Promise<"ok" | "failed" | "rateLimited"> {
  const result = await recordEventOnce(name, props);
  if (result.ok) return "ok";
  return result.error === "rateLimited" ? "rateLimited" : "failed";
}

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "");
}

/** Bienvenida → moneda. Emite started y el paso 0 una sola vez. */
export async function startOnboarding(prev: StepResult, formData: FormData): Promise<StepResult> {
  // useActionState siempre pasa el estado y el formulario; este paso no los lee.
  void prev;
  void formData;
  const user = await requireUser();
  const currency = await ensureLocaleCurrency(user.id);
  if (currency !== "ok") return failed(currency);
  const started = await mark("onboarding_started", {});
  if (started !== "ok") return failed(started);
  const welcome = await mark("onboarding_step_completed", { step: 0 });
  if (welcome !== "ok") return failed(welcome);
  const profile = await getCurrentProfile();
  if ((profile.onboarding_step ?? 0) < 1) {
    const saved = await patchProfile(user.id, { onboarding_step: 1 });
    if (saved !== "ok") return failed(saved);
  }
  redirect("/onboarding");
}

/** Guarda la moneda principal y avanza a la cuenta. */
export async function saveCurrency(_prev: StepResult, formData: FormData): Promise<StepResult> {
  const user = await requireUser();
  const currency = text(formData, "currency");
  if (currency !== "COP" && currency !== "USD" && currency !== "EUR") {
    return { formError: "onboarding.currency.error", fields: {} };
  }
  const saved = await patchProfile(user.id, { display_currency: currency });
  if (saved !== "ok") return failed(saved);
  const marked = await mark("onboarding_step_completed", { step: 1 });
  if (marked !== "ok") return failed(marked);
  const profile = await getCurrentProfile();
  if ((profile.onboarding_step ?? 0) < 2) {
    const step = await patchProfile(user.id, { onboarding_step: 2 });
    if (step !== "ok") return failed(step);
  }
  redirect("/onboarding");
}

async function findAccount(
  name: string,
  type: string,
  currency: string,
  scope: Scope,
): Promise<string | null | "failed"> {
  const supabase = await createClient();
  const householdId = scopeHouseholdId(scope);
  let query = supabase
    .from("accounts")
    .select("id")
    .eq("name", name)
    .eq("type", type)
    .eq("currency", currency)
    .is("archived_at", null);
  query = householdId ? query.eq("household_id", householdId) : query.is("household_id", null);
  const { data, error } = await query.limit(1);
  if (error) return "failed";
  return data?.[0]?.id ?? null;
}

/** Crea la primera cuenta (o reutiliza la misma) y, si hay saldo, una transacción. */
export async function saveFirstAccount(_prev: StepResult, formData: FormData): Promise<StepResult> {
  const user = await requireUser();
  const locale = await localeOf();
  const parsed = validateAccountForm(
    {
      type: text(formData, "type"),
      name: text(formData, "name"),
      currency: text(formData, "currency"),
      balance: text(formData, "balance"),
      limit: text(formData, "limit"),
      payDay: text(formData, "payDay"),
    },
    locale,
  );
  if (!parsed.ok) return { formError: parsed.formError, fields: parsed.fields };
  const draft = parsed.value;
  const scope = await getScope();
  const found = await findAccount(draft.name, draft.dbType, draft.currency, scope);
  if (found === "failed") return failed("failed", "onboarding.account.errors.save");

  let accountId = found;
  if (!accountId) {
    const created = await createAccount({
      name: draft.name,
      type: draft.dbType,
      currency: draft.currency,
      creditLimitMinor: draft.creditLimitMinor,
      paymentDay: draft.paymentDay,
    });
    if (!created.ok) {
      return failed(
        created.error === "rateLimited" ? "rateLimited" : "failed",
        "onboarding.account.errors.save",
      );
    }
    accountId = created.id;
  } else if (draft.dbType === "credit_card") {
    const supabase = await createClient();
    const { error, count } = await supabase
      .from("accounts")
      .update(
        { credit_limit_minor: draft.creditLimitMinor, payment_day: draft.paymentDay },
        { count: "exact" },
      )
      .eq("id", accountId);
    if (isRateLimitedDbError(error)) return failed("rateLimited");
    if (error || count !== 1) return failed("failed", "onboarding.account.errors.save");
  }

  if (draft.balance) {
    const supabase = await createClient();
    const { count, error } = await supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId)
      .is("deleted_at", null);
    if (error) return failed("failed", "onboarding.account.errors.save");
    if ((count ?? 0) === 0) {
      const profile = await getCurrentProfile();
      const amount = parseMoney(draft.balance, draft.currency, locale);
      if (!amount.ok) return failed("failed", "onboarding.account.errors.balance");
      // opening no pasa por save_transaction: esa RPC solo reparte gastos e
      // ingresos. En una tarjeta el signo (deuda) lo pone account_balance.
      const { error: insertError } = await supabase.from("transactions").insert({
        household_id: scopeHouseholdId(scope),
        account_id: accountId,
        kind: "opening",
        description: draft.name,
        amount_minor: Number(amount.value.amountMinor),
        currency: draft.currency,
        occurred_on: todayIn(profile.timezone),
      });
      if (isRateLimitedDbError(insertError)) {
        return failed("rateLimited", "onboarding.account.errors.save");
      }
      if (insertError) return failed("failed", "onboarding.account.errors.save");
    }
  }

  const item = await mark("first_item_created", { type: "account" });
  if (item !== "ok") return failed(item, "onboarding.account.errors.save");
  const step = await mark("onboarding_step_completed", { step: 2 });
  if (step !== "ok") return failed(step, "onboarding.account.errors.save");
  const profile = await getCurrentProfile();
  if ((profile.onboarding_step ?? 0) < 3) {
    const advanced = await patchProfile(user.id, { onboarding_step: 3 });
    if (advanced !== "ok") return failed(advanced, "onboarding.account.errors.save");
  }
  revalidatePath("/", "layout");
  redirect("/onboarding");
}

/** Busca un elemento igual para no duplicarlo si el paso se reintenta. */
async function existingGoal(name: string, currency: string, scope: Scope) {
  const supabase = await createClient();
  const householdId = scopeHouseholdId(scope);
  let query = supabase
    .from("goals")
    .select("id")
    .eq("name", name)
    .eq("currency", currency)
    .is("archived_at", null)
    .limit(1);
  query = householdId ? query.eq("household_id", householdId) : query.is("household_id", null);
  const { data, error } = await query;
  if (error) return "failed" as const;
  return data?.[0]?.id ?? null;
}

async function existingDebt(name: string, currency: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("debts")
    .select("id")
    .eq("name", name)
    .eq("currency", currency)
    .is("deleted_at", null)
    .limit(1);
  if (error) return "failed" as const;
  return data?.[0]?.id ?? null;
}

async function existingSubscription(name: string, currency: string, scope: Scope) {
  const supabase = await createClient();
  const householdId = scopeHouseholdId(scope);
  let query = supabase
    .from("recurring_items")
    .select("id")
    .eq("name", name)
    .eq("currency", currency)
    .eq("kind", "subscription")
    .limit(1);
  query = householdId ? query.eq("household_id", householdId) : query.is("household_id", null);
  const { data, error } = await query;
  if (error) return "failed" as const;
  return data?.[0]?.id ?? null;
}

/** Crea una meta, una deuda o una suscripción y abre el panel. */
export async function saveFocus(_prev: StepResult, formData: FormData): Promise<StepResult> {
  const user = await requireUser();
  const [locale, profile, scope] = await Promise.all([localeOf(), getCurrentProfile(), getScope()]);
  const today = todayIn(profile.timezone);
  const currency = profile.display_currency;
  // El catálogo de la base solo admite estas tres; el tipo generado es string.
  if (currency !== "COP" && currency !== "USD" && currency !== "EUR") return failed("failed");
  const parsed = validateFocusForm(
    {
      choice: text(formData, "choice"),
      name: text(formData, "name"),
      target: text(formData, "target"),
      current: text(formData, "current"),
      date: text(formData, "date"),
      balance: text(formData, "balance"),
      rate: text(formData, "rate"),
      payment: text(formData, "payment"),
      dueDay: text(formData, "dueDay"),
      amount: text(formData, "amount"),
      day: text(formData, "day"),
      chip: text(formData, "chip"),
      currency,
      today,
    },
    locale,
  );
  if (!parsed.ok) return { formError: parsed.formError, fields: parsed.fields };
  const draft = parsed.value;

  let itemType: "goal" | "debt" | "subscription";
  if (draft.choice === "savings") {
    itemType = "goal";
    const name = draft.goal.name.trim();
    const found = await existingGoal(name, draft.goal.currency, scope);
    if (found === "failed") return failed("failed");
    let goalId = found;
    if (!goalId) {
      const saved = await saveGoal(draft.goal);
      if (!saved.ok) return failed(saved.error === "rateLimited" ? "rateLimited" : "failed");
      goalId = saved.id;
    }
    if (draft.current) {
      const supabase = await createClient();
      const { count, error } = await supabase
        .from("goal_contributions")
        .select("id", { count: "exact", head: true })
        .eq("goal_id", goalId);
      if (error) return failed("failed");
      if ((count ?? 0) === 0) {
        const added = await addContribution({
          goalId,
          amount: draft.current,
          currency: draft.goal.currency,
          contributedOn: today,
          transactionId: null,
        });
        if (!added.ok) return failed(added.error === "rateLimited" ? "rateLimited" : "failed");
      }
    }
  } else if (draft.choice === "debt") {
    itemType = "debt";
    const found = await existingDebt(draft.debt.name.trim(), draft.debt.currency);
    if (found === "failed") return failed("failed");
    if (!found) {
      const saved = await saveDebt(draft.debt);
      if (!saved.ok) return failed(saved.error === "rateLimited" ? "rateLimited" : "failed");
    }
  } else {
    itemType = "subscription";
    const found = await existingSubscription(draft.recurring.name, draft.recurring.currency, scope);
    if (found === "failed") return failed("failed");
    if (!found) {
      const saved = await saveRecurringItem(draft.recurring);
      if (!saved.ok) return failed(saved.error === "rateLimited" ? "rateLimited" : "failed");
    }
  }

  const item = await mark("first_item_created", { type: itemType });
  if (item !== "ok") return failed(item);
  const step = await mark("onboarding_step_completed", { step: 3 });
  if (step !== "ok") return failed(step);
  const completed = await mark("onboarding_completed", {});
  if (completed !== "ok") return failed(completed);
  const saved = await patchProfile(user.id, {
    onboarding_step: 4,
    onboarded_at: new Date().toISOString(),
  });
  if (saved !== "ok") return failed(saved);
  revalidatePath("/", "layout");
  redirect("/");
}

/**
 * Omitir: moneda del idioma si no eligió una, onboarded_at y la pista del
 * panel cerrada. No abre un modal y no emite onboarding_completed.
 */
export async function skipOnboarding(_prev: StepResult, formData: FormData): Promise<StepResult> {
  const user = await requireUser();
  const step = Number(text(formData, "step"));
  if (!Number.isInteger(step) || step < 0 || step > 4) return failed("failed");
  const currency = await ensureLocaleCurrency(user.id);
  if (currency !== "ok") return failed(currency);
  const skipped = await mark("onboarding_skipped", { step });
  if (skipped !== "ok") return failed(skipped);
  const now = new Date().toISOString();
  const profile = await getCurrentProfile();
  const saved = await patchProfile(user.id, {
    onboarded_at: profile.onboarded_at ?? now,
    dashboard_hint_dismissed_at: profile.dashboard_hint_dismissed_at ?? now,
  });
  if (saved !== "ok") return failed(saved);
  revalidatePath("/", "layout");
  redirect("/?skipped=1");
}

/** Vuelve un paso. No borra lo ya creado ni vuelve a emitir eventos. */
export async function goBack(prev: StepResult, formData: FormData): Promise<StepResult> {
  // useActionState siempre pasa el estado y el formulario; volver no los lee.
  void prev;
  void formData;
  const user = await requireUser();
  const profile = await getCurrentProfile();
  const step = profile.onboarding_step ?? 0;
  if (step >= 1 && step <= 3) {
    const saved = await patchProfile(user.id, { onboarding_step: step - 1 });
    if (saved !== "ok") return failed(saved);
  }
  redirect("/onboarding");
}

/** Cierra la pista "Este es tu panel". */
export async function dismissDashboardHint(): Promise<void> {
  const user = await requireUser();
  await patchProfile(user.id, { dashboard_hint_dismissed_at: new Date().toISOString() });
  revalidatePath("/");
}

/** Oculta Primeros pasos para siempre. */
export async function dismissFirstSteps(): Promise<void> {
  const user = await requireUser();
  await patchProfile(user.id, { first_steps_dismissed_at: new Date().toISOString() });
  revalidatePath("/");
}
