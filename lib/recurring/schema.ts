/**
 * Validación del formulario de recurrente (cliente y servidor). Los errores
 * son claves de messages (subscriptions.errors.*).
 */
import { z } from "zod";

import type { IconName } from "@/components/ui/icon-registry";
import { ICONS } from "@/components/ui/icon-registry";
import { isCategoryOfKind } from "@/lib/categories";
import type { CategoryKey, RecurringFrequency, RecurringKind } from "@/lib/db/types";
import type { Locale } from "@/lib/i18n/config";
import type { Money } from "@/lib/money/money";
import { parseMoney } from "@/lib/money/parse";
import { DATE_PATTERN } from "@/lib/transactions/dates";

/** Íconos del frame de suscripciones, más los de categoría que ya usa la app. */
export const RECURRING_ICONS = [
  "wifi",
  "play",
  "dumbbell-horizontal",
  "palette",
  "mobile",
  "graduation-cap",
  "cloud",
  "music",
  "newspaper",
  "refresh",
  "credit-card",
  "home",
  "heart",
  "car-side",
  "ticket",
  "shopping-cart",
  "laptop",
  "sparkles",
] as const satisfies readonly IconName[];
export type RecurringIcon = (typeof RECURRING_ICONS)[number];

/** "Una vez" es un mensual que termina el mismo día: una sola ocurrencia. */
export const FORM_FREQUENCIES = ["weekly", "monthly", "yearly", "once"] as const;
export type FormFrequency = (typeof FORM_FREQUENCIES)[number];

export const FORM_KINDS = ["subscription", "bill", "income"] as const;
export type FormKind = (typeof FORM_KINDS)[number];

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

const validDate = (value: string) => DATE_PATTERN.test(value) && !Number.isNaN(Date.parse(value));

export const recurringInputSchema = z.object({
  id: z.uuid().nullable(),
  kind: z.enum(FORM_KINDS),
  name: z.string(),
  subtitle: z.string(),
  iconKey: z.string(),
  amount: z.string(),
  currency: z.enum(["COP", "USD"]),
  categoryKey: z.string(),
  accountId: z.string(),
  frequency: z.enum(FORM_FREQUENCIES),
  interval: z.string(),
  anchorDate: z.string(),
  endsOn: z.string(),
  autoPost: z.boolean(),
});
export type RecurringInput = z.infer<typeof recurringInputSchema>;

export type RecurringField =
  | "name"
  | "subtitle"
  | "iconKey"
  | "amount"
  | "categoryKey"
  | "accountId"
  | "interval"
  | "anchorDate"
  | "endsOn";

export type RecurringErrorKey =
  | AmountError
  | "nameRequired"
  | "nameTooLong"
  | "subtitleTooLong"
  | "iconRequired"
  | "categoryRequired"
  | "accountRequired"
  | "intervalInvalid"
  | "dateRequired"
  | "endsBeforeStart";

export type ValidRecurring = {
  id: string | null;
  kind: RecurringKind;
  name: string;
  subtitle: string | null;
  iconKey: RecurringIcon;
  amount: Money;
  categoryKey: CategoryKey;
  accountId: string | null;
  frequency: RecurringFrequency;
  interval: number;
  anchorDate: string;
  /** "Una vez" fuerza el fin al ancla. */
  endsOn: string | null;
  autoPost: boolean;
};

export function validateRecurring(
  raw: unknown,
  locale: Locale,
):
  | { ok: true; value: ValidRecurring }
  | { ok: false; errors: Partial<Record<RecurringField, RecurringErrorKey>> } {
  const parsed = recurringInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: { name: "nameRequired" } };
  const input = parsed.data;
  const errors: Partial<Record<RecurringField, RecurringErrorKey>> = {};

  const name = input.name.trim();
  if (!name) errors.name = "nameRequired";
  else if (name.length > 80) errors.name = "nameTooLong";

  const subtitle = input.subtitle.trim();
  if (subtitle.length > 120) errors.subtitle = "subtitleTooLong";

  const iconKey = (RECURRING_ICONS as readonly string[]).includes(input.iconKey)
    ? (input.iconKey as RecurringIcon)
    : null;
  if (!iconKey) errors.iconKey = "iconRequired";

  const amount = parseMoney(input.amount, input.currency, locale);
  if (!amount.ok) errors.amount = amountError(amount.error);

  const categoryKind = input.kind === "income" ? "income" : "expense";
  const categoryKey =
    input.categoryKey && isCategoryOfKind(input.categoryKey, categoryKind)
      ? (input.categoryKey as CategoryKey)
      : null;
  if (!categoryKey) errors.categoryKey = "categoryRequired";

  const interval = Number(input.interval);
  if (!Number.isInteger(interval) || interval < 1 || interval > 52) {
    errors.interval = "intervalInvalid";
  }

  if (!validDate(input.anchorDate)) errors.anchorDate = "dateRequired";
  const once = input.frequency === "once";
  const endsOn = once ? input.anchorDate : input.endsOn.trim();
  if (!once && endsOn && !validDate(endsOn)) errors.endsOn = "dateRequired";
  else if (!once && endsOn && validDate(input.anchorDate) && endsOn < input.anchorDate) {
    errors.endsOn = "endsBeforeStart";
  }

  // Facturas e ingresos nunca se auto-registran. Una suscripción sí puede,
  // y entonces necesita cuenta para crear la transacción.
  const autoPost = input.kind === "subscription" && input.autoPost;
  const accountId = z.uuid().safeParse(input.accountId).success ? input.accountId : null;
  if (autoPost && !accountId) errors.accountId = "accountRequired";

  if (Object.keys(errors).length > 0 || !amount.ok || !iconKey || !categoryKey) {
    return { ok: false, errors };
  }
  // "once" no existe en la base: es un mensual de intervalo 1 que termina el ancla.
  // La comparación va en línea para que el tipo excluya "once" en la otra rama.
  const frequency: RecurringFrequency = input.frequency === "once" ? "monthly" : input.frequency;
  return {
    ok: true,
    value: {
      id: input.id,
      kind: input.kind,
      name,
      subtitle: subtitle || null,
      iconKey,
      amount: amount.value,
      categoryKey,
      accountId,
      frequency,
      interval: once ? 1 : interval,
      anchorDate: input.anchorDate,
      endsOn: once ? input.anchorDate : endsOn || null,
      autoPost,
    },
  };
}

/** ¿El ícono guardado está en el registro? Si no, uno según el tipo. */
export function recurringIcon(kind: RecurringKind, iconKey: string | null): IconName {
  if (iconKey && iconKey in ICONS) return iconKey as IconName;
  if (kind === "income") return "sack-dollar";
  if (kind === "debt_payment") return "credit-card";
  if (kind === "bill") return "file-invoice-dollar";
  return "refresh";
}
