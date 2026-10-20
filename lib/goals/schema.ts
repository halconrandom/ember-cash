/**
 * Validación de metas y aportes (cliente y servidor usan la misma). Los
 * errores son claves de messages (savings.errors.*).
 */
import { z } from "zod";

import type { IconName } from "@/components/ui/icon-registry";
import { CURRENCY_CODES } from "@/lib/db/types";
import type { Locale } from "@/lib/i18n/config";
import type { Money } from "@/lib/money/money";
import { parseMoney } from "@/lib/money/parse";
import { DATE_PATTERN } from "@/lib/transactions/dates";

/** Íconos que se pueden elegir para una meta (todos están en la spec). */
export const GOAL_ICONS = [
  "piggy-bank",
  "umbrella-beach",
  "plane",
  "laptop",
  "home",
  "heart",
  "graduation-cap",
  "car-side",
  "motorcycle",
  "mobile",
  "target",
  "sparkles",
] as const satisfies readonly IconName[];
export type GoalIcon = (typeof GOAL_ICONS)[number];

type AmountError = "amountPositive" | "amountInvalid" | "amountTooManyDecimals" | "amountTooLarge";

function amountError(error: string): AmountError {
  return error === "empty" || error === "notPositive"
    ? "amountPositive"
    : error === "tooManyDecimals"
      ? "amountTooManyDecimals"
      : error === "tooLarge"
        ? "amountTooLarge"
        : "amountInvalid";
}

const validDate = (v: string) => DATE_PATTERN.test(v) && !Number.isNaN(Date.parse(v));

// ---------------------------------------------------------------- metas
export const goalInputSchema = z.object({
  id: z.uuid().nullable(),
  name: z.string(),
  iconKey: z.string(),
  target: z.string(),
  currency: z.enum(CURRENCY_CODES),
  targetDate: z.string(),
  monthly: z.string(),
});
export type GoalInput = z.infer<typeof goalInputSchema>;
export type GoalField = "name" | "iconKey" | "target" | "targetDate" | "monthly";
export type GoalErrorKey =
  AmountError | "nameRequired" | "nameTooLong" | "iconRequired" | "dateInvalid" | "datePast";

export type ValidGoal = {
  id: string | null;
  name: string;
  iconKey: GoalIcon;
  target: Money;
  targetDate: string | null;
  monthly: Money | null;
};

export function validateGoal(
  raw: unknown,
  locale: Locale,
  today: string,
):
  { ok: true; value: ValidGoal } | { ok: false; errors: Partial<Record<GoalField, GoalErrorKey>> } {
  const parsed = goalInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: { name: "nameRequired" } };
  const input = parsed.data;
  const errors: Partial<Record<GoalField, GoalErrorKey>> = {};

  const name = input.name.trim();
  if (!name) errors.name = "nameRequired";
  else if (name.length > 80) errors.name = "nameTooLong";

  if (!(GOAL_ICONS as readonly string[]).includes(input.iconKey)) errors.iconKey = "iconRequired";

  const target = parseMoney(input.target, input.currency, locale);
  if (!target.ok) errors.target = amountError(target.error);

  let monthly: Money | null = null;
  if (input.monthly.trim()) {
    const m = parseMoney(input.monthly, input.currency, locale, { allowZero: true });
    if (!m.ok) errors.monthly = amountError(m.error);
    else monthly = m.value;
  }

  let targetDate: string | null = null;
  if (input.targetDate) {
    if (!validDate(input.targetDate)) errors.targetDate = "dateInvalid";
    // Una meta nueva no puede tener una fecha objetivo pasada.
    else if (!input.id && input.targetDate < today) errors.targetDate = "datePast";
    else targetDate = input.targetDate;
  }

  if (Object.keys(errors).length > 0 || !target.ok) return { ok: false, errors };
  return {
    ok: true,
    value: {
      id: input.id,
      name,
      iconKey: input.iconKey as GoalIcon,
      target: target.value,
      targetDate,
      monthly,
    },
  };
}

// --------------------------------------------------------------- aportes
export const contributionInputSchema = z.object({
  goalId: z.uuid(),
  amount: z.string(),
  currency: z.enum(CURRENCY_CODES),
  contributedOn: z.string(),
  transactionId: z.string().nullable(),
});
export type ContributionInput = z.infer<typeof contributionInputSchema>;
export type ContributionField = "amount" | "contributedOn" | "transactionId";
export type ContributionErrorKey = AmountError | "dateInvalid" | "dateFuture";

export type ValidContribution = {
  goalId: string;
  amount: Money;
  contributedOn: string;
  transactionId: string | null;
};

export function validateContribution(
  raw: unknown,
  locale: Locale,
  today: string,
):
  | { ok: true; value: ValidContribution }
  | { ok: false; errors: Partial<Record<ContributionField, ContributionErrorKey>> } {
  const parsed = contributionInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: { amount: "amountInvalid" } };
  const input = parsed.data;
  const errors: Partial<Record<ContributionField, ContributionErrorKey>> = {};

  const amount = parseMoney(input.amount, input.currency, locale);
  if (!amount.ok) errors.amount = amountError(amount.error);
  if (!validDate(input.contributedOn)) errors.contributedOn = "dateInvalid";
  else if (input.contributedOn > today) errors.contributedOn = "dateFuture";
  const transactionId =
    input.transactionId && z.uuid().safeParse(input.transactionId).success
      ? input.transactionId
      : null;

  if (Object.keys(errors).length > 0 || !amount.ok) return { ok: false, errors };
  return {
    ok: true,
    value: {
      goalId: input.goalId,
      amount: amount.value,
      contributedOn: input.contributedOn,
      transactionId,
    },
  };
}
