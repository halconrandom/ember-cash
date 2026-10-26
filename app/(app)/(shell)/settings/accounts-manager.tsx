"use client";

/**
 * Gestión mínima de cuentas en Ajustes: lista con renombrar y archivar
 * (las archivadas aparecen aparte, con desarchivar) y el formulario para
 * crear una cuenta nueva. Las tarjetas muestran el cupo disponible (cupo −
 * deuda de hoy) con su barra de uso, y se editan cupo, día y saldo actual.
 */
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { AccountCreateForm } from "@/components/accounts/account-create-form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/chip";
import { Input } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { CreditFields, type CreditValues } from "@/components/accounts/credit-fields";
import { ProgressBar } from "@/components/ui/progress-bar";
import { renameAccount, setAccountArchived, updateCreditCard } from "@/lib/accounts/actions";
import { creditAvailability, type CreditField } from "@/lib/accounts/credit";
import type { AccountSummary } from "@/lib/accounts/queries";
import { ACCOUNT_TYPE_ICON } from "@/lib/categories";
import type { CurrencyCode } from "@/lib/db/types";
import { useFormat } from "@/lib/i18n/use-format";
import { money } from "@/lib/money/money";

export function AccountsManager({
  accounts,
  cardDebts = {},
  defaultCurrency,
}: {
  accounts: AccountSummary[];
  /** Deuda de hoy por tarjeta (account_balance). */
  cardDebts?: Record<string, number>;
  defaultCurrency: CurrencyCode;
}) {
  const t = useTranslations("accounts");
  const active = accounts.filter((a) => !a.archived_at);
  const archived = accounts.filter((a) => a.archived_at);

  return (
    <div className="space-y-6">
      {active.length === 0 ? (
        <p className="text-body text-ink-2">{t("empty")}</p>
      ) : (
        <ul className="divide-divider divide-y">
          {active.map((a) => (
            <AccountItem key={a.id} account={a} debtMinor={cardDebts[a.id] ?? 0} />
          ))}
        </ul>
      )}
      {archived.length > 0 && (
        <div className="space-y-2">
          <p className="text-caption text-ink-2 uppercase">{t("archivedSection")}</p>
          <ul className="divide-divider divide-y">
            {archived.map((a) => (
              <AccountItem key={a.id} account={a} debtMinor={cardDebts[a.id] ?? 0} />
            ))}
          </ul>
        </div>
      )}
      <div className="border-divider border-t pt-5">
        <AccountCreateForm defaultCurrency={defaultCurrency} />
      </div>
    </div>
  );
}

function AccountItem({ account, debtMinor }: { account: AccountSummary; debtMinor: number }) {
  const t = useTranslations();
  const f = useFormat();
  const [editing, setEditing] = useState(false);
  const [editingCard, setEditingCard] = useState(false);
  const isCard = account.type === "credit_card";
  const cardValues = (): CreditValues => ({
    limit: account.credit_limit_minor
      ? f.amount(money(account.credit_limit_minor, account.currency))
      : "",
    payDay: account.payment_day ? String(account.payment_day) : "",
    balance: f.amount(money(debtMinor, account.currency)),
  });
  const [credit, setCredit] = useState<CreditValues>(cardValues);
  const [creditErrors, setCreditErrors] = useState<Partial<Record<CreditField, string>>>({});
  const [name, setName] = useState(account.name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isArchived = Boolean(account.archived_at);

  function save() {
    startTransition(async () => {
      const result = await renameAccount(account.id, name);
      if (!result.ok) {
        setError(
          result.error === "rateLimited"
            ? t("rateLimit.write")
            : t(`accounts.errors.${result.error}`),
        );
        return;
      }
      setError(null);
      setEditing(false);
    });
  }

  function saveCard() {
    startTransition(async () => {
      const result = await updateCreditCard(account.id, credit);
      if (!result.ok) {
        setCreditErrors(result.fields ?? {});
        setError(
          result.fields
            ? null
            : result.error === "rateLimited"
              ? t("rateLimit.write")
              : t(`accounts.errors.${result.error}`),
        );
        return;
      }
      setCreditErrors({});
      setError(null);
      setEditingCard(false);
    });
  }

  const limit = account.credit_limit_minor ?? null;
  const usage = isCard && limit ? creditAvailability(limit, debtMinor) : null;

  function toggleArchived() {
    startTransition(async () => {
      await setAccountArchived(account.id, !isArchived);
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <span className="rounded-control bg-surface2 text-ink-2 grid size-10 shrink-0 place-items-center">
        <Icon name={ACCOUNT_TYPE_ICON[account.type]} />
      </span>
      {editing ? (
        <form
          className="flex min-w-0 flex-1 flex-wrap items-start gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="min-w-48 flex-1">
            <Input
              aria-label={t("accounts.renameLabel", { name: account.name })}
              value={name}
              maxLength={80}
              autoFocus
              invalid={Boolean(error)}
              onChange={(e) => setName(e.target.value)}
            />
            {error && (
              <p role="alert" className="text-callout text-negative-text mt-1">
                {error}
              </p>
            )}
          </div>
          <Button type="submit" size="lg" disabled={pending}>
            {t("accounts.save")}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            onClick={() => {
              setEditing(false);
              setName(account.name);
              setError(null);
            }}
          >
            {t("accounts.cancel")}
          </Button>
        </form>
      ) : (
        <>
          <div className="min-w-0 flex-1">
            <p className="text-body text-ink flex items-center gap-2 font-semibold">
              <span className="truncate">{account.name}</span>
              {isArchived && (
                <Badge tone="neutral" size="sm">
                  {t("accounts.archived")}
                </Badge>
              )}
            </p>
            <p className="text-callout text-ink-2">
              {t(`accountTypes.${account.type}`)} · {account.currency}
              {isCard &&
                account.payment_day &&
                ` · ${t("accounts.payDayShort", { day: account.payment_day })}`}
            </p>
            {usage && limit && (
              <div className="mt-2 max-w-sm space-y-1">
                <ProgressBar
                  percent={usage.usedPercent}
                  label={t("accounts.usedPercent", { percent: usage.usedPercent })}
                  barClassName="bg-debt-bar"
                  className="h-1.5"
                />
                <p className="text-footnote text-ink-2 tabular-nums">
                  {t("accounts.available", {
                    available: f.money(money(usage.availableMinor, account.currency)),
                    limit: f.money(money(limit, account.currency)),
                  })}
                </p>
              </div>
            )}
            {isCard && !limit && (
              <p className="text-footnote text-ink-3 mt-1">{t("accounts.noLimit")}</p>
            )}
          </div>
          {!isArchived && (
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              {t("accounts.rename")}
            </Button>
          )}
          {isCard && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setCredit(cardValues());
                setEditingCard((v) => !v);
              }}
            >
              {t("accounts.editCard")}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={toggleArchived} disabled={pending}>
            {isArchived ? t("accounts.unarchive") : t("accounts.archive")}
          </Button>
        </>
      )}
      {editingCard && !editing && (
        <form
          className="basis-full space-y-3 pt-2"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            saveCard();
          }}
        >
          <CreditFields values={credit} onChange={setCredit} errors={creditErrors} />
          {error && (
            <p role="alert" className="text-callout text-negative-text">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" size="lg" disabled={pending}>
              {t("accounts.save")}
            </Button>
            <Button variant="secondary" size="lg" onClick={() => setEditingCard(false)}>
              {t("accounts.cancel")}
            </Button>
          </div>
        </form>
      )}
    </li>
  );
}
