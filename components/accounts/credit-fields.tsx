"use client";

/**
 * Campos de una tarjeta de crédito (cupo, día de pago y saldo actual) para
 * crear y editar en Ajustes. Mismas etiquetas que el wizard; los errores son
 * claves completas de messages (validateCreditForm).
 */
import { useTranslations } from "next-intl";

import { Field } from "@/components/ui/field";
import type { CreditField } from "@/lib/accounts/credit";

export type CreditValues = { limit: string; payDay: string; balance: string };

export function CreditFields({
  values,
  onChange,
  errors,
}: {
  values: CreditValues;
  onChange: (next: CreditValues) => void;
  errors?: Partial<Record<CreditField, string>>;
}) {
  const t = useTranslations();
  const set = (k: keyof CreditValues) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...values, [k]: e.target.value });
  const err = (k: CreditField) => (errors?.[k] ? t(errors[k]) : null);
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Field
        label={t("onboarding.account.limitLabel")}
        inputMode="decimal"
        autoComplete="off"
        placeholder={t("accounts.optional")}
        value={values.limit}
        onChange={set("limit")}
        error={err("limit")}
      />
      <Field
        label={t("onboarding.account.payDayLabel")}
        inputMode="numeric"
        maxLength={2}
        placeholder={t("accounts.payDayPlaceholder")}
        value={values.payDay}
        onChange={set("payDay")}
        error={err("payDay")}
      />
      <Field
        label={t("accounts.cardBalance")}
        inputMode="decimal"
        autoComplete="off"
        placeholder={t("accounts.optional")}
        value={values.balance}
        onChange={set("balance")}
        error={err("balance")}
        hint={t("accounts.cardBalanceHint")}
      />
    </div>
  );
}
