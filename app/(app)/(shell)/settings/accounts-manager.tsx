"use client";

/**
 * Gestión mínima de cuentas en Ajustes: lista con renombrar y archivar
 * (las archivadas aparecen aparte, con desarchivar) y el formulario para
 * crear una cuenta nueva.
 */
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { AccountCreateForm } from "@/components/accounts/account-create-form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/chip";
import { Input } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { renameAccount, setAccountArchived } from "@/lib/accounts/actions";
import type { AccountSummary } from "@/lib/accounts/queries";
import { ACCOUNT_TYPE_ICON } from "@/lib/categories";
import type { CurrencyCode } from "@/lib/db/types";

export function AccountsManager({
  accounts,
  defaultCurrency,
}: {
  accounts: AccountSummary[];
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
            <AccountItem key={a.id} account={a} />
          ))}
        </ul>
      )}
      {archived.length > 0 && (
        <div className="space-y-2">
          <p className="text-caption text-ink-2 uppercase">{t("archivedSection")}</p>
          <ul className="divide-divider divide-y">
            {archived.map((a) => (
              <AccountItem key={a.id} account={a} />
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

function AccountItem({ account }: { account: AccountSummary }) {
  const t = useTranslations();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(account.name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isArchived = Boolean(account.archived_at);

  function save() {
    startTransition(async () => {
      const result = await renameAccount(account.id, name);
      if (!result.ok) {
        setError(t(`accounts.errors.${result.error}`));
        return;
      }
      setError(null);
      setEditing(false);
    });
  }

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
            </p>
          </div>
          {!isArchived && (
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              {t("accounts.rename")}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={toggleArchived} disabled={pending}>
            {isArchived ? t("accounts.unarchive") : t("accounts.archive")}
          </Button>
        </>
      )}
    </li>
  );
}
