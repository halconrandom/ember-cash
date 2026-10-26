"use client";

/**
 * Cuentas en el dashboard: el saldo de cada cuenta personal activa (las
 * tarjetas, deuda y disponible) y las últimas transferencias, en estilo
 * neutro. Resumen de /accounts (Estado de cuentas). No suma nada a Deudas ni
 * al Balance del mes.
 */
import { useTranslations } from "next-intl";

import { AccountFiguresView, MovementLine } from "@/components/accounts/account-lines";
import { Icon } from "@/components/ui/icon";
import type { AccountStatement } from "@/lib/accounts/statement";
import { ACCOUNT_TYPE_ICON } from "@/lib/categories";
import type { TransactionRow } from "@/lib/transactions/queries";

import { DashboardCard } from "./card-frame";

export const DASHBOARD_TRANSFERS = 3;

/** Transferencias recientes de todas las cuentas, sin repetir, más nuevas primero. */
export function recentTransfers(accounts: readonly AccountStatement[], limit: number) {
  const seen = new Map<string, TransactionRow>();
  for (const a of accounts)
    for (const r of a.recent) if (r.kind === "transfer" && !seen.has(r.id)) seen.set(r.id, r);
  return [...seen.values()]
    .sort((x, y) => (x.occurredOn < y.occurredOn ? 1 : x.occurredOn > y.occurredOn ? -1 : 0))
    .slice(0, limit);
}

export function AccountsCard({ accounts }: { accounts: AccountStatement[] }) {
  const t = useTranslations("accounts.statement");
  const active = accounts.filter((a) => !a.archived);
  const transfers = recentTransfers(active, DASHBOARD_TRANSFERS);
  return (
    <DashboardCard href="/accounts" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-title2 text-ink">{t("cardTitle")}</h2>
        <span className="text-callout text-ember-text font-medium">{t("open")}</span>
      </div>
      {active.length === 0 ? (
        <p className="text-body text-ink-2 py-4">{t("empty")}</p>
      ) : (
        <ul className="space-y-3">
          {active.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3">
              <span className="text-body text-ink flex min-w-0 items-center gap-2 font-semibold">
                <Icon name={ACCOUNT_TYPE_ICON[a.type]} size={16} className="text-ink-2 shrink-0" />
                <span className="truncate">{a.name}</span>
              </span>
              <AccountFiguresView figures={a.figures} />
            </li>
          ))}
        </ul>
      )}
      {transfers.length > 0 && (
        <div className="border-divider border-t pt-3">
          <h3 className="text-callout text-ink-2 font-semibold">{t("recentTransfers")}</h3>
          <ul className="divide-divider divide-y">
            {transfers.map((r) => (
              <MovementLine key={r.id} row={r} />
            ))}
          </ul>
        </div>
      )}
    </DashboardCard>
  );
}
