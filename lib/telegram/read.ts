/**
 * Interpreta el jsonb que devuelven las funciones del bot. Si la forma no es
 * la esperada, el resultado es un fallo: no se reenvía el texto de Postgres.
 */
import { CURRENCY_CODES, type CurrencyCode } from "@/lib/db/types";
import { isLocale, type Locale } from "@/lib/i18n/config";

import type {
  ActionResult,
  AnswerDebtPaymentResult,
  AnswerGoalContributionResult,
  BeginDebtPaymentResult,
  BeginGoalContributionResult,
  ContextResult,
  DebtDraftResult,
  DraftResult,
  DueOccurrence,
  DueOccurrencesResult,
  GoalItem,
  LimitResult,
  LinkResult,
  ListDebtsResult,
  ListGoalsResult,
  OccurrenceDraftResult,
  OpenDebt,
  PendingStepResult,
  SubscriptionDraftResult,
} from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function errorOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

function isCurrency(value: unknown): value is CurrencyCode {
  return typeof value === "string" && (CURRENCY_CODES as readonly string[]).includes(value);
}

/** Unidades menores como texto (el jsonb no pierde cifras) o entero seguro. */
function minorOf(value: unknown): bigint | null {
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const minor = BigInt(value);
    if (minor <= 0n || minor > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    return minor;
  }
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return BigInt(value);
  return null;
}

/** Como minorOf, pero 0 vale (saldos, lo ahorrado): nunca negativo, nunca decimal. */
function nonNegativeMinorOf(value: unknown): bigint | null {
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const minor = BigInt(value);
    return minor >= 0n && minor <= BigInt(Number.MAX_SAFE_INTEGER) ? minor : null;
  }
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  return null;
}

/** allowed / retry del límite. Null si la respuesta no se entiende. */
export function readLimit(value: unknown): LimitResult | null {
  const row = record(value);
  if (!row || typeof row.allowed !== "boolean") return null;
  return { ok: true, allowed: row.allowed };
}

const LINK_ERRORS = ["expired", "used", "invalid", "taken"] as const;

/** Resultado de vincular con un código. */
export function readLink(value: unknown): LinkResult {
  const row = record(value);
  if (!row) return { ok: false, error: "failed" };
  if (row.ok === true) return { ok: true };
  const error = errorOf(row.error, LINK_ERRORS);
  return { ok: false, error: error ?? "failed" };
}

/** Perfil mínimo para parsear. Sin saldos ni otras personas. */
export function readContext(value: unknown): ContextResult {
  const row = record(value);
  if (!row) return { ok: false };
  if (row.linked === false) return { ok: true, linked: false };
  if (row.linked !== true) return { ok: false };
  const locale: Locale | null = isLocale(row.locale) ? row.locale : null;
  const enabled = Array.isArray(row.enabled_currencies)
    ? row.enabled_currencies.filter(isCurrency)
    : [];
  const last = isCurrency(row.last_currency) ? row.last_currency : null;
  const display = isCurrency(row.display_currency) ? row.display_currency : null;
  const fallback = last && enabled.includes(last) ? last : display;
  if (!locale || !fallback || !enabled.includes(fallback)) return { ok: false };
  return {
    ok: true,
    linked: true,
    locale,
    enabled,
    defaultCurrency: fallback,
    hasAccount: row.has_account === true,
  };
}

const DRAFT_ERRORS = [
  "no_account",
  "currency_disabled",
  "account_forbidden",
  "invalid",
  "not_linked",
] as const;

/** Borrador listo para confirmar, o un error conocido. */
export function readDraft(value: unknown): DraftResult {
  const row = record(value);
  if (!row) return { ok: false, error: "failed" };
  if (row.ok !== true) {
    const error = errorOf(row.error, DRAFT_ERRORS);
    return { ok: false, error: error ?? "failed" };
  }
  const amountMinor = minorOf(row.amount_minor);
  const draftId = typeof row.draft_id === "string" ? row.draft_id : "";
  const description = typeof row.description === "string" ? row.description.trim() : "";
  const accountName = typeof row.account_name === "string" ? row.account_name.trim() : "";
  const occurredOn = typeof row.occurred_on === "string" ? row.occurred_on : "";
  const categoryKey = typeof row.category_key === "string" ? row.category_key : "";
  if (
    (row.kind !== "expense" && row.kind !== "income") ||
    !amountMinor ||
    !isCurrency(row.currency) ||
    !UUID.test(draftId) ||
    description === "" ||
    accountName === "" ||
    !DAY.test(occurredOn) ||
    categoryKey === ""
  ) {
    return { ok: false, error: "failed" };
  }
  return {
    ok: true,
    draftId,
    kind: row.kind,
    amountMinor,
    currency: row.currency,
    categoryKey,
    description,
    accountName,
    occurredOn,
  };
}

const FREQUENCIES = ["weekly", "monthly", "yearly"] as const;

const SUBSCRIPTION_DRAFT_ERRORS = [
  "invalid",
  "currency_disabled",
  "day_only_monthly",
  "not_linked",
] as const;

/** Borrador de suscripción listo para confirmar, o un error conocido. */
export function readSubscriptionDraft(value: unknown): SubscriptionDraftResult {
  const row = record(value);
  if (!row) return { ok: false, error: "failed" };
  if (row.ok !== true) {
    const error = errorOf(row.error, SUBSCRIPTION_DRAFT_ERRORS);
    return { ok: false, error: error ?? "failed" };
  }
  const amountMinor = minorOf(row.amount_minor);
  const draftId = typeof row.draft_id === "string" ? row.draft_id : "";
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const frequency = errorOf(row.frequency, FREQUENCIES);
  const nextCharge = typeof row.next_charge === "string" ? row.next_charge : "";
  if (
    !amountMinor ||
    !isCurrency(row.currency) ||
    !UUID.test(draftId) ||
    name === "" ||
    !frequency ||
    !DAY.test(nextCharge)
  ) {
    return { ok: false, error: "failed" };
  }
  return {
    ok: true,
    draftId,
    name,
    amountMinor,
    currency: row.currency,
    frequency,
    nextCharge,
  };
}

const OCCURRENCE_DRAFT_ERRORS = ["not_found", "no_account", "not_linked"] as const;

/** Borrador de "Marcar como pagado" listo para confirmar, o un error conocido. */
export function readOccurrenceDraft(value: unknown): OccurrenceDraftResult {
  const row = record(value);
  if (!row) return { ok: false, error: "failed" };
  if (row.ok !== true) {
    const error = errorOf(row.error, OCCURRENCE_DRAFT_ERRORS);
    return { ok: false, error: error ?? "failed" };
  }
  const amountMinor = minorOf(row.amount_minor);
  const draftId = typeof row.draft_id === "string" ? row.draft_id : "";
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const dueOn = typeof row.due_on === "string" ? row.due_on : "";
  if (!amountMinor || !isCurrency(row.currency) || !UUID.test(draftId) || name === "" || !DAY.test(dueOn)) {
    return { ok: false, error: "failed" };
  }
  return { ok: true, draftId, name, amountMinor, currency: row.currency, dueOn };
}

/** Hasta 5 vencimientos vencidos o de hoy. */
export function readDueOccurrences(value: unknown): DueOccurrencesResult {
  const row = record(value);
  if (!row || row.ok !== true || !Array.isArray(row.items)) return { ok: false };
  const items: DueOccurrence[] = [];
  for (const raw of row.items) {
    const item = record(raw);
    if (!item) continue;
    const occurrenceId = typeof item.occurrence_id === "string" ? item.occurrence_id : "";
    const name = typeof item.name === "string" ? item.name.trim() : "";
    const dueOn = typeof item.due_on === "string" ? item.due_on : "";
    const amountMinor = minorOf(item.amount_minor);
    if (!UUID.test(occurrenceId) || name === "" || !DAY.test(dueOn) || !amountMinor || !isCurrency(item.currency)) {
      continue;
    }
    items.push({ occurrenceId, name, amountMinor, currency: item.currency, dueOn });
  }
  return { ok: true, items };
}

const ACTION_ERRORS = [
  "expired",
  "not_found",
  "already_saved",
  "nothing",
  "not_linked",
  "account_forbidden",
  "rate_limited",
  "cannot_undo",
] as const;

/** Guardar, cancelar o deshacer. */
export function readAction(value: unknown): ActionResult {
  const row = record(value);
  if (!row) return { ok: false, error: "failed" };
  if (row.ok === true) return { ok: true, already: row.already === true };
  const error = errorOf(row.error, ACTION_ERRORS);
  return { ok: false, error: error ?? "failed" };
}

const DEBT_DRAFT_ERRORS = ["invalid", "currency_disabled", "not_linked"] as const;

/** Borrador de /deuda listo para confirmar, o un error conocido. */
export function readDebtDraft(value: unknown): DebtDraftResult {
  const row = record(value);
  if (!row) return { ok: false, error: "failed" };
  if (row.ok !== true) {
    const error = errorOf(row.error, DEBT_DRAFT_ERRORS);
    return { ok: false, error: error ?? "failed" };
  }
  const amountMinor = minorOf(row.amount_minor);
  const draftId = typeof row.draft_id === "string" ? row.draft_id : "";
  const name = typeof row.name === "string" ? row.name.trim() : "";
  if (!amountMinor || !isCurrency(row.currency) || !UUID.test(draftId) || name === "") {
    return { ok: false, error: "failed" };
  }
  return { ok: true, draftId, name, amountMinor, currency: row.currency };
}

/** Hasta 5 deudas abiertas. */
export function readListDebts(value: unknown): ListDebtsResult {
  const row = record(value);
  if (!row || row.ok !== true || !Array.isArray(row.items)) return { ok: false };
  const items: OpenDebt[] = [];
  for (const raw of row.items) {
    const item = record(raw);
    if (!item) continue;
    const debtId = typeof item.debt_id === "string" ? item.debt_id : "";
    const name = typeof item.name === "string" ? item.name.trim() : "";
    const balanceMinor = nonNegativeMinorOf(item.balance_minor);
    if (!UUID.test(debtId) || name === "" || balanceMinor === null || !isCurrency(item.currency)) {
      continue;
    }
    items.push({ debtId, name, balanceMinor, currency: item.currency });
  }
  return { ok: true, items };
}

const BEGIN_DEBT_PAYMENT_ERRORS = ["not_found", "settled", "not_linked"] as const;

/** Primer paso de /abono: la deuda elegida, con su saldo. */
export function readBeginDebtPayment(value: unknown): BeginDebtPaymentResult {
  const row = record(value);
  if (!row) return { ok: false, error: "failed" };
  if (row.ok !== true) {
    const error = errorOf(row.error, BEGIN_DEBT_PAYMENT_ERRORS);
    return { ok: false, error: error ?? "failed" };
  }
  const draftId = typeof row.draft_id === "string" ? row.draft_id : "";
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const balanceMinor = nonNegativeMinorOf(row.balance_minor);
  if (!UUID.test(draftId) || name === "" || balanceMinor === null || !isCurrency(row.currency)) {
    return { ok: false, error: "failed" };
  }
  return { ok: true, draftId, name, currency: row.currency, balanceMinor };
}

const ANSWER_DEBT_PAYMENT_ERRORS = [
  "not_found",
  "already_saved",
  "expired",
  "invalid",
  "exceeds_balance",
  "not_linked",
] as const;

/** Segundo paso de /abono: el monto ya validado contra el saldo. */
export function readAnswerDebtPayment(value: unknown): AnswerDebtPaymentResult {
  const row = record(value);
  if (!row) return { ok: false, error: "failed" };
  if (row.ok !== true) {
    const error = errorOf(row.error, ANSWER_DEBT_PAYMENT_ERRORS);
    return { ok: false, error: error ?? "failed" };
  }
  const draftId = typeof row.draft_id === "string" ? row.draft_id : "";
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const amountMinor = minorOf(row.amount_minor);
  const balanceAfter = nonNegativeMinorOf(row.balance_after);
  if (
    !UUID.test(draftId) ||
    name === "" ||
    !amountMinor ||
    balanceAfter === null ||
    !isCurrency(row.currency)
  ) {
    return { ok: false, error: "failed" };
  }
  return { ok: true, draftId, name, currency: row.currency, amountMinor, balanceAfter };
}

/** Hasta 5 metas activas. */
export function readListGoals(value: unknown): ListGoalsResult {
  const row = record(value);
  if (!row || row.ok !== true || !Array.isArray(row.items)) return { ok: false };
  const items: GoalItem[] = [];
  for (const raw of row.items) {
    const item = record(raw);
    if (!item) continue;
    const goalId = typeof item.goal_id === "string" ? item.goal_id : "";
    const name = typeof item.name === "string" ? item.name.trim() : "";
    const targetMinor = nonNegativeMinorOf(item.target_minor);
    const savedMinor = nonNegativeMinorOf(item.saved_minor);
    if (
      !UUID.test(goalId) ||
      name === "" ||
      targetMinor === null ||
      savedMinor === null ||
      !isCurrency(item.currency)
    ) {
      continue;
    }
    items.push({ goalId, name, currency: item.currency, targetMinor, savedMinor });
  }
  return { ok: true, items };
}

const BEGIN_GOAL_CONTRIBUTION_ERRORS = ["not_found", "not_linked"] as const;

/** Primer paso de /ahorro: la meta elegida. */
export function readBeginGoalContribution(value: unknown): BeginGoalContributionResult {
  const row = record(value);
  if (!row) return { ok: false, error: "failed" };
  if (row.ok !== true) {
    const error = errorOf(row.error, BEGIN_GOAL_CONTRIBUTION_ERRORS);
    return { ok: false, error: error ?? "failed" };
  }
  const draftId = typeof row.draft_id === "string" ? row.draft_id : "";
  const name = typeof row.name === "string" ? row.name.trim() : "";
  if (!UUID.test(draftId) || name === "" || !isCurrency(row.currency)) {
    return { ok: false, error: "failed" };
  }
  return { ok: true, draftId, name, currency: row.currency };
}

const ANSWER_GOAL_CONTRIBUTION_ERRORS = [
  "not_found",
  "already_saved",
  "expired",
  "invalid",
  "rate_unavailable",
  "not_linked",
] as const;

/** Segundo paso de /ahorro: el monto, ya en la moneda de la meta. */
export function readAnswerGoalContribution(value: unknown): AnswerGoalContributionResult {
  const row = record(value);
  if (!row) return { ok: false, error: "failed" };
  if (row.ok !== true) {
    const error = errorOf(row.error, ANSWER_GOAL_CONTRIBUTION_ERRORS);
    return { ok: false, error: error ?? "failed" };
  }
  const draftId = typeof row.draft_id === "string" ? row.draft_id : "";
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const amountMinor = minorOf(row.amount_minor);
  if (!UUID.test(draftId) || name === "" || !amountMinor || !isCurrency(row.currency)) {
    return { ok: false, error: "failed" };
  }
  const enteredAmountMinor = minorOf(row.entered_amount_minor);
  const enteredCurrency = isCurrency(row.entered_currency) ? row.entered_currency : null;
  return {
    ok: true,
    draftId,
    name,
    currency: row.currency,
    amountMinor,
    enteredAmountMinor: enteredAmountMinor && enteredCurrency ? enteredAmountMinor : null,
    enteredCurrency: enteredAmountMinor && enteredCurrency ? enteredCurrency : null,
  };
}

const PENDING_STEP_KINDS = ["debt_payment", "goal_contribution"] as const;

/** ¿Hay un borrador esperando el monto de /abono o /ahorro? */
export function readPendingStep(value: unknown): PendingStepResult {
  const row = record(value);
  if (!row || row.ok !== true) return { ok: false };
  if (row.pending !== true) return { ok: true, pending: false };
  const draftKind = errorOf(row.draft_kind, PENDING_STEP_KINDS);
  const draftId = typeof row.draft_id === "string" ? row.draft_id : "";
  const name = typeof row.name === "string" ? row.name.trim() : "";
  if (!draftKind || !UUID.test(draftId) || name === "" || !isCurrency(row.currency)) {
    return { ok: false };
  }
  return { ok: true, pending: true, draftKind, draftId, name, currency: row.currency };
}
