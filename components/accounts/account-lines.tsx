"use client";

/**
 * Piezas del estado de cuentas que comparten /accounts y la tarjeta Cuentas
 * del dashboard: las cifras de una cuenta y una línea de movimiento.
 * Montos con MoneyAmount (moneda de visualización + original con su código).
 */
import { useTranslations } from "next-intl";

import { MoneyAmount } from "@/components/money/money-amount";
import { Icon } from "@/components/ui/icon";
import type { AccountFigures } from "@/lib/accounts/statement-math";
import { CATEGORY_META, TRANSFER_META } from "@/lib/categories";
import { useFormat } from "@/lib/i18n/use-format";
import type { TransactionRow } from "@/lib/transactions/queries";

/** Saldo (cuentas) o deuda + disponible (tarjetas). */
export function AccountFiguresView({ figures }: { figures: AccountFigures }) {
  const t = useTranslations("accounts.statement");
  const f = useFormat();
  if (figures.kind === "cash") {
    return <MoneyAmount value={figures.balance} className="text-right" />;
  }
  return (
    <span className="flex flex-col items-end gap-0.5 text-right">
      <span className="text-footnote text-ink-2">{t("debt")}</span>
      <MoneyAmount value={figures.debt} className="text-right" />
      <span className="text-footnote text-ink-2 tabular-nums">
        {figures.available && figures.limit
          ? t("availableOf", {
              available: f.money(figures.available),
              limit: f.money(figures.limit),
            })
          : t("noLimit")}
      </span>
    </span>
  );
}

/** Una línea de movimiento: transferencias neutras con "Origen → Destino". */
export function MovementLine({ row }: { row: TransactionRow }) {
  const t = useTranslations();
  const f = useFormat();
  const transfer = row.kind === "transfer";
  const meta = row.countsAsExpense
    ? CATEGORY_META.card_payment
    : transfer || !row.categoryKey
      ? TRANSFER_META
      : CATEGORY_META[row.categoryKey];
  const label = row.countsAsExpense
    ? t("categories.card_payment")
    : transfer
      ? t("categories.transfer")
      : row.categoryKey
        ? t(`categories.${row.categoryKey}`)
        : "";
  const where =
    transfer && row.transferTo
      ? t("transactions.transferTo", { from: row.account?.name ?? "", to: row.transferTo.name })
      : (row.account?.name ?? "");
  const expense = row.kind === "expense" || row.countsAsExpense;
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <span className="flex min-w-0 items-center gap-3">
        <Icon name={meta.icon} size={16} className="text-ink-2 shrink-0" />
        <span className="min-w-0">
          <span className="text-body text-ink block truncate">{row.description}</span>
          <span className="text-footnote text-ink-2 block truncate">
            {[f.date(row.occurredOn), label, where].filter(Boolean).join(" · ")}
          </span>
        </span>
      </span>
      <MoneyAmount
        value={row.amount}
        date={row.occurredOn}
        sign={expense ? "-" : row.kind === "income" ? "+" : undefined}
        positive={row.kind === "income"}
        className="shrink-0 text-right"
      />
    </li>
  );
}
