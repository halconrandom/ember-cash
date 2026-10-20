/**
 * Validación del formulario de transacción (cliente y servidor usan la misma).
 * Devuelve los datos listos para save_transaction o un error por campo como
 * clave de messages (transactions.errors.*).
 */
import { z } from "zod";

import { isCategoryOfKind } from "@/lib/categories";
import { CURRENCY_CODES } from "@/lib/db/types";
import type { Locale } from "@/lib/i18n/config";
import type { Money } from "@/lib/money/money";
import { parseMoney } from "@/lib/money/parse";

import { DATE_PATTERN } from "./dates";

export type TransactionKind = "expense" | "income" | "transfer";

/** Lo que manda el formulario (todo como texto, tal cual lo escribió el usuario). */
export const transactionInputSchema = z.object({
  id: z.uuid().nullable(),
  kind: z.enum(["expense", "income", "transfer"]),
  amount: z.string(),
  currency: z.enum(CURRENCY_CODES),
  categoryKey: z.string().nullable(),
  description: z.string(),
  note: z.string(),
  occurredOn: z.string(),
  accountId: z.string(),
  transferToAccountId: z.string().nullable(),
  paidBy: z.string().nullable(),
  /** Never por defecto (DESIGN_SPEC §5). Solo crea un recurrente al agregar. */
  repeat: z.enum(["never", "weekly", "monthly", "yearly"]).default("never"),
});
export type TransactionInput = z.infer<typeof transactionInputSchema>;

export type TransactionField =
  | "amount"
  | "categoryKey"
  | "description"
  | "note"
  | "occurredOn"
  | "accountId"
  | "transferToAccountId"
  | "paidBy";

export type TransactionErrorKey =
  | "amountPositive"
  | "amountInvalid"
  | "amountTooManyDecimals"
  | "amountTooLarge"
  | "categoryRequired"
  | "descriptionRequired"
  | "descriptionTooLong"
  | "noteTooLong"
  | "dateRequired"
  | "accountRequired"
  | "transferToRequired"
  | "transferSameAccount";

export type ValidTransaction = {
  id: string | null;
  kind: TransactionKind;
  amount: Money;
  categoryKey: string | null;
  description: string;
  note: string | null;
  occurredOn: string;
  accountId: string;
  transferToAccountId: string | null;
  paidBy: string | null;
  repeat: "never" | "weekly" | "monthly" | "yearly";
};

export type ValidationResult =
  | { ok: true; value: ValidTransaction }
  | { ok: false; errors: Partial<Record<TransactionField, TransactionErrorKey>> };

const isUuid = (v: string | null | undefined) => !!v && z.uuid().safeParse(v).success;

export function validateTransaction(raw: unknown, locale: Locale): ValidationResult {
  const parsed = transactionInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: { amount: "amountInvalid" } };
  const input = parsed.data;
  const errors: Partial<Record<TransactionField, TransactionErrorKey>> = {};

  const amount = parseMoney(input.amount, input.currency, locale);
  if (!amount.ok) {
    errors.amount =
      amount.error === "empty" || amount.error === "notPositive"
        ? "amountPositive"
        : amount.error === "tooManyDecimals"
          ? "amountTooManyDecimals"
          : amount.error === "tooLarge"
            ? "amountTooLarge"
            : "amountInvalid";
  }

  const description = input.description.trim();
  if (!description) errors.description = "descriptionRequired";
  else if (description.length > 200) errors.description = "descriptionTooLong";

  const note = input.note.trim();
  if (note.length > 2000) errors.note = "noteTooLong";

  if (!DATE_PATTERN.test(input.occurredOn) || Number.isNaN(Date.parse(input.occurredOn)))
    errors.occurredOn = "dateRequired";
  if (!isUuid(input.accountId)) errors.accountId = "accountRequired";

  let categoryKey: string | null = null;
  let transferTo: string | null = null;
  if (input.kind === "transfer") {
    if (!isUuid(input.transferToAccountId)) errors.transferToAccountId = "transferToRequired";
    else if (input.transferToAccountId === input.accountId)
      errors.transferToAccountId = "transferSameAccount";
    else transferTo = input.transferToAccountId;
  } else if (!input.categoryKey || !isCategoryOfKind(input.categoryKey, input.kind)) {
    errors.categoryKey = "categoryRequired";
  } else {
    categoryKey = input.categoryKey;
  }

  if (Object.keys(errors).length > 0 || !amount.ok) return { ok: false, errors };
  return {
    ok: true,
    value: {
      id: input.id,
      kind: input.kind,
      amount: amount.value,
      categoryKey,
      description,
      note: note || null,
      occurredOn: input.occurredOn,
      accountId: input.accountId,
      transferToAccountId: transferTo,
      // Las transferencias no tienen pagador.
      paidBy: input.kind === "transfer" || !isUuid(input.paidBy) ? null : input.paidBy,
      repeat: input.kind === "transfer" ? "never" : input.repeat,
    },
  };
}
