"use client";

/**
 * Formulario para crear una cuenta (nombre, tipo, moneda). Lo usan Ajustes y
 * el modal de transacción cuando todavía no hay cuentas. La moneda usa el
 * mismo segmented de 3 monedas (COP/USD/EUR) que el resto de la app.
 */
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SelectField } from "@/components/ui/select-field";
import { createAccount } from "@/lib/accounts/actions";
import { ACCOUNT_TYPES } from "@/lib/categories";
import type { AccountType, CurrencyCode } from "@/lib/db/types";
import { CURRENCY_OPTIONS, readLastCurrency, writeLastCurrency } from "@/lib/money/last-currency";

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
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createAccount({ name, type, currency });
      if (!result.ok) {
        setError(
          result.error === "rateLimited"
            ? t("rateLimit.write")
            : t(`accounts.errors.${result.error}`),
        );
        return;
      }
      setError(null);
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
        <SegmentedControl
          label={t("accounts.currency")}
          value={currency}
          onChange={(next) => {
            setCurrency(next);
            writeLastCurrency("accounts", next);
          }}
          options={CURRENCY_OPTIONS}
        />
      </div>
      <Button type="submit" variant="secondary" icon="plus" disabled={pending}>
        {pending ? t("accounts.creating") : t("accounts.create")}
      </Button>
    </form>
  );
}
