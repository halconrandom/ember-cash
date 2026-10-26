/**
 * Validación de deudas y pagos (cliente y servidor usan la misma). Errores
 * como claves de messages (debts.errors.*).
 */
import { z } from "zod";

import type { IconName } from "@/components/ui/icon-registry";
import { CURRENCY_CODES } from "@/lib/db/types";
import type { Locale } from "@/lib/i18n/config";
import type { Money } from "@/lib/money/money";
import { parseMoney } from "@/lib/money/parse";
import { DATE_PATTERN } from "@/lib/transactions/dates";

import type { AprKind } from "./payoff";

export const DEBT_ICONS = [
  "credit-card",
  "bank",
  "laptop",
  "graduation-cap",
  "motorcycle",
  "car-side",
  "home",
  "mobile",
  "file-invoice-dollar",
] as const satisfies readonly IconName[];
export type DebtIcon = (typeof DEBT_ICONS)[number];

type AmountError = "amountPositive" | "amountInvalid" | "amountTooManyDecimals" | "amountTooLarge";
const amountError = (e: string): AmountError =>
  e === "empty" || e === "notPositive"
    ? "amountPositive"
    : e === "tooManyDecimals"
      ? "amountTooManyDecimals"
      : e === "tooLarge"
        ? "amountTooLarge"
        : "amountInvalid";

/**
 * "28,5" o "28.5" → 2850 puntos básicos. Hasta 2 decimales y hasta 200 %.
 * Devuelve null si no es válido.
 */
export function parseAprBps(input: string): number | null {
  const text = input.replace("%", "").trim().replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(text)) return null;
  const [int, frac = ""] = text.split(".");
  const bps = Number(int) * 100 + Number(frac.padEnd(2, "0"));
  return bps <= 20_000 ? bps : null;
}

// ---------------------------------------------------------------- deudas
export const debtInputSchema = z.object({
  id: z.uuid().nullable(),
  name: z.string(),
  subtitle: z.string(),
  iconKey: z.string(),
  currency: z.enum(CURRENCY_CODES),
  principal: z.string(),
  apr: z.string(),
  aprKind: z.enum(["EA", "nominal"]),
  minPayment: z.string(),
  dueDay: z.string(),
  /** Saldo actual (opcional). Vacío = sin pago inicial. */
  balance: z.string().default(""),
  /** En el plan de pago (avalancha / bola de nieve). false = exclude_from_plan. */
  includeInPlan: z.boolean().default(true),
  /**
   * Solo al crear: el saldo escrito ya descuenta el pago de este mes, así que
   * el vencimiento del mes queda saldado (sin transacción ni pago de capital).
   */
  paidThisMonth: z.boolean().default(false),
});
export type DebtInput = z.input<typeof debtInputSchema>;
export type DebtField =
  "name" | "subtitle" | "iconKey" | "principal" | "apr" | "minPayment" | "dueDay" | "balance";
export type DebtErrorKey =
  | AmountError
  | "nameRequired"
  | "nameTooLong"
  | "subtitleTooLong"
  | "iconRequired"
  | "aprInvalid"
  | "dueDayInvalid"
  | "balanceTooHigh"
  | "principalBelowPaid";

export type ValidDebt = {
  id: string | null;
  name: string;
  subtitle: string | null;
  iconKey: DebtIcon;
  principal: Money;
  aprBps: number;
  aprKind: AprKind;
  minPayment: Money;
  dueDay: number | null;
  /**
   * Saldo actual (pago inicial + pagos reales ya descontados), o null si no
   * se escribió: sin pago inicial. Pago inicial = principal − pagos reales −
   * saldo (ver 0029_debt_opening_payment.sql).
   */
  balance: Money | null;
  includeInPlan: boolean;
  /** Siempre false al editar (solo aplica al crear). */
  paidThisMonth: boolean;
};

/**
 * realPaidMinor: capital de los pagos reales (sin el inicial) de la deuda que
 * se edita; 0 al crear. El servidor vuelve a comprobarlo en set_debt_opening.
 */
export function validateDebt(
  raw: unknown,
  locale: Locale,
  realPaidMinor: bigint = 0n,
):
  { ok: true; value: ValidDebt } | { ok: false; errors: Partial<Record<DebtField, DebtErrorKey>> } {
  const parsed = debtInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: { name: "nameRequired" } };
  const i = parsed.data;
  const errors: Partial<Record<DebtField, DebtErrorKey>> = {};

  const name = i.name.trim();
  if (!name) errors.name = "nameRequired";
  else if (name.length > 80) errors.name = "nameTooLong";
  const subtitle = i.subtitle.trim();
  if (subtitle.length > 120) errors.subtitle = "subtitleTooLong";
  if (!(DEBT_ICONS as readonly string[]).includes(i.iconKey)) errors.iconKey = "iconRequired";

  const principal = parseMoney(i.principal, i.currency, locale);
  if (!principal.ok) errors.principal = amountError(principal.error);
  const minPayment = parseMoney(i.minPayment, i.currency, locale, { allowZero: true });
  if (!minPayment.ok) errors.minPayment = amountError(minPayment.error);
  const aprBps = parseAprBps(i.apr);
  if (aprBps === null) errors.apr = "aprInvalid";

  let balance: Money | null = null;
  if (i.balance.trim()) {
    const b = parseMoney(i.balance, i.currency, locale, { allowZero: true });
    if (!b.ok) errors.balance = amountError(b.error);
    else if (principal.ok && b.value.amountMinor > principal.value.amountMinor - realPaidMinor)
      errors.balance = "balanceTooHigh";
    else balance = b.value;
  }
  if (principal.ok && !errors.balance && principal.value.amountMinor < realPaidMinor)
    errors.principal = "principalBelowPaid";

  let dueDay: number | null = null;
  if (i.dueDay.trim()) {
    const n = Number(i.dueDay);
    if (!Number.isInteger(n) || n < 1 || n > 31) errors.dueDay = "dueDayInvalid";
    else dueDay = n;
  }

  if (Object.keys(errors).length > 0 || !principal.ok || !minPayment.ok || aprBps === null)
    return { ok: false, errors };
  return {
    ok: true,
    value: {
      id: i.id,
      name,
      subtitle: subtitle || null,
      iconKey: i.iconKey as DebtIcon,
      principal: principal.value,
      aprBps,
      aprKind: i.aprKind,
      minPayment: minPayment.value,
      dueDay,
      balance,
      includeInPlan: i.includeInPlan,
      paidThisMonth: i.id === null && i.paidThisMonth,
    },
  };
}

// ---------------------------------------------------------------- pagos
export const paymentInputSchema = z.object({
  debtId: z.uuid(),
  currency: z.enum(CURRENCY_CODES),
  amount: z.string(),
  interest: z.string(),
  paidOn: z.string(),
  createTransaction: z.boolean(),
  accountId: z.string(),
});
export type PaymentInput = z.infer<typeof paymentInputSchema>;
export type PaymentField = "amount" | "interest" | "paidOn" | "accountId";
export type PaymentErrorKey =
  AmountError | "interestTooHigh" | "dateInvalid" | "dateFuture" | "accountRequired";

export type ValidPayment = {
  debtId: string;
  amount: Money;
  interest: Money;
  /** amount − interest. */
  principal: Money;
  paidOn: string;
  accountId: string | null;
};

export function validatePayment(
  raw: unknown,
  locale: Locale,
  today: string,
):
  | { ok: true; value: ValidPayment }
  | { ok: false; errors: Partial<Record<PaymentField, PaymentErrorKey>> } {
  const parsed = paymentInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: { amount: "amountInvalid" } };
  const i = parsed.data;
  const errors: Partial<Record<PaymentField, PaymentErrorKey>> = {};

  const amount = parseMoney(i.amount, i.currency, locale);
  if (!amount.ok) errors.amount = amountError(amount.error);
  const interest = parseMoney(i.interest.trim() || "0", i.currency, locale, { allowZero: true });
  if (!interest.ok) errors.interest = amountError(interest.error);
  else if (amount.ok && interest.value.amountMinor > amount.value.amountMinor)
    errors.interest = "interestTooHigh";

  if (!DATE_PATTERN.test(i.paidOn) || Number.isNaN(Date.parse(i.paidOn)))
    errors.paidOn = "dateInvalid";
  else if (i.paidOn > today) errors.paidOn = "dateFuture";
  const accountOk = z.uuid().safeParse(i.accountId).success;
  if (i.createTransaction && !accountOk) errors.accountId = "accountRequired";

  if (Object.keys(errors).length > 0 || !amount.ok || !interest.ok) return { ok: false, errors };
  return {
    ok: true,
    value: {
      debtId: i.debtId,
      amount: amount.value,
      interest: interest.value,
      principal: {
        ...amount.value,
        amountMinor: amount.value.amountMinor - interest.value.amountMinor,
      },
      paidOn: i.paidOn,
      accountId: i.createTransaction ? i.accountId : null,
    },
  };
}
