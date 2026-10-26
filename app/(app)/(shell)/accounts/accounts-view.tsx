"use client";

/**
 * Estado de cuentas: una tarjeta por cuenta personal con su saldo (o deuda,
 * cupo, disponible, día de pago y tasa si es tarjeta) y sus movimientos
 * recientes. Las archivadas van aparte, colapsadas.
 */
import Link from "next/link";
import { useTranslations } from "next-intl";

import { AccountFiguresView, MovementLine } from "@/components/accounts/account-lines";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import type { AccountStatement } from "@/lib/accounts/statement";
import { ACCOUNT_TYPE_ICON } from "@/lib/categories";
import { useFormat } from "@/lib/i18n/use-format";

export function AccountsView({ accounts }: { accounts: AccountStatement[] }) {
  const t = useTranslations("accounts");
  const active = accounts.filter((a) => !a.archived);
  const archived = accounts.filter((a) => a.archived);
  if (accounts.length === 0) {
    return (
      <Card>
        <p className="text-body text-ink-2">{t("empty")}</p>
      </Card>
    );
  }
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 min-[900px]:grid-cols-2">
        {active.map((a) => (
          <AccountCard key={a.id} account={a} />
        ))}
      </div>
      {archived.length > 0 && (
        <details className="group">
          <summary className="text-headline text-ink cursor-pointer list-none">
            {t("archivedSection")} ({archived.length})
          </summary>
          <div className="mt-4 grid grid-cols-1 gap-6 min-[900px]:grid-cols-2">
            {archived.map((a) => (
              <AccountCard key={a.id} account={a} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function AccountCard({ account: a }: { account: AccountStatement }) {
  const t = useTranslations();
  const f = useFormat();
  const card = a.figures.kind === "card";
  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="rounded-control bg-surface2 grid size-10 shrink-0 place-items-center">
            <Icon name={ACCOUNT_TYPE_ICON[a.type]} />
          </span>
          <div className="min-w-0">
            <h2 className="text-headline text-ink truncate">{a.name}</h2>
            <p className="text-footnote text-ink-2">
              {t(`accountTypes.${a.type}`)} · {a.currency}
            </p>
          </div>
        </div>
        <AccountFiguresView figures={a.figures} />
      </div>
      {card && (
        <p className="text-callout text-ink-2 tabular-nums">
          {[
            a.paymentDay ? t("accounts.payDayShort", { day: a.paymentDay }) : null,
            a.aprBps !== null
              ? t("accounts.statement.apr", { rate: f.number(a.aprBps / 100, 1) })
              : null,
          ]
            .filter(Boolean)
            .join(" · ") || t("accounts.statement.noTerms")}
        </p>
      )}
      <div>
        <h3 className="text-callout text-ink-2 font-semibold">{t("accounts.statement.recent")}</h3>
        {a.recent.length === 0 ? (
          <p className="text-callout text-ink-3 py-2">{t("accounts.statement.noMovements")}</p>
        ) : (
          <ul className="divide-divider divide-y">
            {a.recent.map((r) => (
              <MovementLine key={r.id} row={r} />
            ))}
          </ul>
        )}
      </div>
      <div className="text-callout flex flex-wrap gap-4 font-medium">
        <Link className="text-ember-text" href={`/transactions?account=${a.id}&range=all`}>
          {t("accounts.statement.viewAll")}
        </Link>
        {card && a.debtId && (
          <Link className="text-ember-text" href="/debts">
            {t("accounts.statement.viewDebt")}
          </Link>
        )}
      </div>
    </Card>
  );
}
