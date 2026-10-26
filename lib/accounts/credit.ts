/**
 * Cupo y día de pago de una cuenta. Solo una tarjeta puede llevarlos; el
 * resto de los tipos los deja en null. El wizard exige los dos al crear la
 * tarjeta; Ajustes puede crear la tarjeta sin ellos (null).
 */
import type { AccountType, CurrencyCode } from "@/lib/db/types";
import type { Locale } from "@/lib/i18n/config";
import { parseAprBps } from "@/lib/debts/schema";
import { parseMoney } from "@/lib/money/parse";

export type CreditColumns = {
  credit_limit_minor: number | null;
  payment_day: number | null;
};

/** Normaliza los campos o rechaza una combinación que la base no aceptaría. */
export function creditColumns(
  type: AccountType,
  limit: number | null | undefined,
  day: number | null | undefined,
): CreditColumns | null {
  const creditLimit = limit ?? null;
  const paymentDay = day ?? null;
  if (type !== "credit_card") {
    return creditLimit === null && paymentDay === null
      ? { credit_limit_minor: null, payment_day: null }
      : null;
  }
  if (creditLimit !== null && (!Number.isSafeInteger(creditLimit) || creditLimit <= 0)) return null;
  if (paymentDay !== null && (!Number.isInteger(paymentDay) || paymentDay < 1 || paymentDay > 31)) {
    return null;
  }
  return { credit_limit_minor: creditLimit, payment_day: paymentDay };
}

/** "21" → 21. Null si no es un día entre 1 y 31 (wizard y Ajustes). */
export function parsePaymentDay(input: string): number | null {
  const text = input.trim();
  if (!/^\d{1,2}$/.test(text)) return null;
  const day = Number(text);
  return day >= 1 && day <= 31 ? day : null;
}

/** Cupo en unidades menores (> 0), o null si no es válido. */
export function parseCreditLimit(
  input: string,
  currency: CurrencyCode,
  locale: Locale,
): number | null {
  const parsed = parseMoney(input, currency, locale);
  return parsed.ok ? Number(parsed.value.amountMinor) : null;
}

/** Claves de messages, las mismas del wizard (onboarding.account.errors.*). */
export const CREDIT_ERRORS = {
  limit: "onboarding.account.errors.limit",
  payDay: "onboarding.account.errors.payDay",
  balance: "onboarding.account.errors.balance",
  apr: "debts.errors.aprInvalid",
  minPayment: "debts.errors.amountInvalid",
} as const;
export type CreditField = keyof typeof CREDIT_ERRORS;

export type CreditForm = {
  creditLimitMinor: number | null;
  paymentDay: number | null;
  /** Deuda de hoy en unidades menores (>= 0), o null si quedó vacío. */
  balanceMinor: number | null;
  /** Tasa EA en puntos básicos para la deuda enlazada (0031), o null. */
  aprBps: number | null;
  /** Pago mínimo de la deuda enlazada, o null. */
  minPaymentMinor: number | null;
};

/**
 * Campos de tarjeta de Ajustes (crear y editar): cupo, día de pago y saldo
 * actual (lo que se debe hoy). Todos opcionales; si se escriben, con las
 * mismas reglas del wizard.
 */
export function validateCreditForm(
  input: { limit: string; payDay: string; balance: string; apr?: string; minPayment?: string },
  currency: CurrencyCode,
  locale: Locale,
): { ok: true; value: CreditForm } | { ok: false; fields: Partial<Record<CreditField, string>> } {
  const fields: Partial<Record<CreditField, string>> = {};
  let creditLimitMinor: number | null = null;
  if (input.limit.trim()) {
    creditLimitMinor = parseCreditLimit(input.limit, currency, locale);
    if (creditLimitMinor === null) fields.limit = CREDIT_ERRORS.limit;
  }
  let paymentDay: number | null = null;
  if (input.payDay.trim()) {
    paymentDay = parsePaymentDay(input.payDay);
    if (paymentDay === null) fields.payDay = CREDIT_ERRORS.payDay;
  }
  let balanceMinor: number | null = null;
  if (input.balance.trim()) {
    const parsed = parseMoney(input.balance, currency, locale, { allowZero: true });
    if (!parsed.ok) fields.balance = CREDIT_ERRORS.balance;
    else balanceMinor = Number(parsed.value.amountMinor);
  }
  let aprBps: number | null = null;
  if (input.apr?.trim()) {
    aprBps = parseAprBps(input.apr);
    if (aprBps === null) fields.apr = CREDIT_ERRORS.apr;
  }
  let minPaymentMinor: number | null = null;
  if (input.minPayment?.trim()) {
    const parsed = parseMoney(input.minPayment, currency, locale, { allowZero: true });
    if (!parsed.ok) fields.minPayment = CREDIT_ERRORS.minPayment;
    else minPaymentMinor = Number(parsed.value.amountMinor);
  }
  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return {
    ok: true,
    value: { creditLimitMinor, paymentDay, balanceMinor, aprBps, minPaymentMinor },
  };
}

/**
 * Monto del saldo inicial (kind opening) para que la deuda de hoy sea
 * `targetMinor`: target − (saldo actual sin el opening vivo). 0 = sin opening.
 * Null si haría falta un opening negativo (los movimientos ya suman más).
 */
export function openingFor(
  targetMinor: number,
  currentBalanceMinor: number,
  currentOpeningMinor: number,
): number | null {
  const opening = targetMinor - (currentBalanceMinor - currentOpeningMinor);
  return opening >= 0 ? opening : null;
}

/** Cupo disponible (cupo − deuda; nunca negativo) y uso en %. */
export function creditAvailability(
  limitMinor: number,
  debtMinor: number,
): { availableMinor: number; usedPercent: number } {
  const debt = Math.max(0, debtMinor);
  return {
    availableMinor: Math.max(0, limitMinor - debt),
    usedPercent: limitMinor > 0 ? Math.min(100, Math.round((debt / limitMinor) * 100)) : 0,
  };
}
