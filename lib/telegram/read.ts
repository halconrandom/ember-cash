/**
 * Interpreta el jsonb que devuelven las funciones del bot. Si la forma no es
 * la esperada, el resultado es un fallo: no se reenvía el texto de Postgres.
 */
import { CURRENCY_CODES, type CurrencyCode } from "@/lib/db/types";
import { isLocale, type Locale } from "@/lib/i18n/config";

import type { ActionResult, ContextResult, DraftResult, LimitResult, LinkResult } from "./types";

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

const ACTION_ERRORS = [
  "expired",
  "not_found",
  "already_saved",
  "nothing",
  "not_linked",
  "account_forbidden",
  "rate_limited",
] as const;

/** Guardar, cancelar o deshacer. */
export function readAction(value: unknown): ActionResult {
  const row = record(value);
  if (!row) return { ok: false, error: "failed" };
  if (row.ok === true) return { ok: true, already: row.already === true };
  const error = errorOf(row.error, ACTION_ERRORS);
  return { ok: false, error: error ?? "failed" };
}
