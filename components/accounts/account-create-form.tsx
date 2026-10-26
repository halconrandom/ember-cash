"use client";

/**
 * Formulario para crear una cuenta (nombre, tipo, moneda y, si es tarjeta,
 * cupo, día de pago y saldo actual). Lo usan Ajustes y
 * el modal de transacción cuando todavía no hay cuentas. La moneda usa
 * <CurrencyPicker> (fase E5), igual que el resto de la app.
 */
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { CurrencyPicker } from "@/components/ui/currency-picker";
import { Field } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { SelectField } from "@/components/ui/select-field";
import { createAccount } from "@/lib/accounts/actions";
import type { CreditField } from "@/lib/accounts/credit";
import { ACCOUNT_TYPES } from "@/lib/categories";
import type { AccountType, CurrencyCode } from "@/lib/db/types";
import { readLastCurrency, writeLastCurrency } from "@/lib/money/last-currency";

import { CreditFields, type CreditValues } from "./credit-fields";

const EMPTY_CREDIT: CreditValues = { limit: "", payDay: "", balance: "" };

export function AccountCreateForm({
  defaultCurrency,
  onCreated,
}: {
  defaultCurrency: CurrencyCode;
  onCreated?: (id: string) => void;
}) {
  const t = useTranslations();
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("checking");
  const [currency, setCurrency] = useState<CurrencyCode>(
    readLastCurrency("accounts") ?? defaultCurrency,
  );
  const [credit, setCredit] = useState<CreditValues>(EMPTY_CREDIT);
  const [creditErrors, setCreditErrors] = useState<Partial<Record<CreditField, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createAccount({
        name,
        type,
        currency,
        ...(type === "credit_card" ? { credit } : {}),
      });
      if (!result.ok) {
        setCreditErrors(result.fields ?? {});
        if (result.fields) return;
        setError(
          result.error === "rateLimited"
            ? t("rateLimit.write")
            : t(`accounts.errors.${result.error}`),
        );
        return;
      }
      setError(null);
      setCreditErrors({});
      setCredit(EMPTY_CREDIT);
      setName("");
      onCreated?.(result.id);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field
        label={t("accounts.name")}
        placeholder={t("accounts.namePlaceholder")}
        value={name}
        maxLength={80}
        onChange={(e) => setName(e.target.value)}
        error={error}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label={t("accounts.type")}
          icon="wallet"
          value={type}
          onChange={(v) => setType(v as AccountType)}
          options={ACCOUNT_TYPES.map((v) => ({ value: v, label: t(`accountTypes.${v}`) }))}
        />
        <div className="space-y-2">
          <span className="text-callout text-ink-2 block font-semibold">
            {t("accounts.currency")}
          </span>
          <CurrencyPicker
            value={currency}
            onChange={(next) => {
              setCurrency(next);
              writeLastCurrency("accounts", next);
            }}
            title={t("accounts.currency")}
            triggerLabel={t("accounts.currency")}
            triggerClassName="rounded-control bg-surface2 text-body text-ink flex h-11 w-full items-center gap-2 border border-transparent px-4"
          >
            <span className="min-w-0 flex-1 text-left">{currency}</span>
            <Icon name="angle-small-down" size={18} className="text-ink-2" />
          </CurrencyPicker>
        </div>
      </div>
      {type === "credit_card" && (
        <CreditFields values={credit} onChange={setCredit} errors={creditErrors} />
      )}
      <Button type="submit" variant="secondary" icon="plus" disabled={pending}>
        {pending ? t("accounts.creating") : t("accounts.create")}
      </Button>
    </form>
  );
}
