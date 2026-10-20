"use client";

/**
 * Primera fila del dashboard (01/09-dashboard.png): balance del mes (hero),
 * ingresos y gastos, cada uno con su variación contra el mes anterior.
 *
 * Variación (DESIGN_SPEC §3): la flecha dice la dirección y el color si es
 * bueno o malo. Ingresos y balance que suben son verdes; gastos que bajan,
 * también. Sin datos el mes anterior, el distintivo lo dice en vez de un
 * porcentaje (no se divide por cero). Los importes cuentan desde 0 (Number
 * Ticker) solo en la primera carga; después cambian al instante.
 */
import { useTranslations } from "next-intl";

import { MoneyAmount } from "@/components/money/money-amount";
import { useRate } from "@/components/money/rate-provider";
import { Icon } from "@/components/ui/icon";
import type { IconName } from "@/components/ui/icon-registry";
import {
  monthTotals,
  originBreakdown,
  percentChange,
  type AggregateRow,
} from "@/lib/dashboard/aggregate";
import { useFormat } from "@/lib/i18n/use-format";
import { useFirstView } from "@/lib/motion/first-view";
import type { Money } from "@/lib/money/money";
import { cn } from "@/lib/utils";

import { DashboardCard } from "./card-frame";

type Props = {
  rows: AggregateRow[];
  month: string;
  previousMonth: string;
  /** Qué tarjeta dibujar. */
  card: "balance" | "income" | "expenses";
};

export function StatCard({ rows, month, previousMonth, card }: Props) {
  const t = useTranslations("dashboard");
  const f = useFormat();
  const { displayCurrency } = useRate();
  // Number Ticker solo en la primera carga del dashboard (spec §7).
  const first = useFirstView();
  const current = monthTotals(rows, month, displayCurrency);
  const previous = monthTotals(rows, previousMonth, displayCurrency);
  const prevLabel = f.date(`${previousMonth}-01`, "monthShort");
  const href = `/transactions?month=${month}${card === "income" ? "&type=income" : card === "expenses" ? "&type=expense" : ""}`;

  const value: Money =
    card === "balance" ? current.balance : card === "income" ? current.income : current.expenses;
  const breakdownRows = rows.filter(
    (r) => r.month === month && (card === "balance" || r.kind === (card === "income" ? "income" : "expense")),
  );
  const before: Money =
    card === "balance" ? previous.balance : card === "income" ? previous.income : previous.expenses;
  const change = percentChange(value, before);
  // Gastos: bajar es bueno.
  const good =
    change === null || change === 0 ? null : card === "expenses" ? change < 0 : change > 0;

  if (card === "balance") {
    return (
      <DashboardCard
        href={href}
        className="from-hero-start to-hero-end relative overflow-hidden border-transparent bg-linear-to-br text-white hover:border-transparent"
      >
        {/* Un solo círculo decorativo, abajo a la derecha y lejos del texto (spec §2). */}
        <span
          aria-hidden
          className="pointer-events-none absolute -right-10 -bottom-16 size-48 rounded-full bg-white/[0.08]"
        />
        <div className="relative space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-body flex items-center gap-2 font-medium">
              <Icon name="wallet" size={20} />
              {t("balance")}
            </p>
            <ChangeChip change={change} good={good} prevLabel={prevLabel} hero />
          </div>
          <MoneyAmount
            variant="total"
            ticker={first}
            value={value}
            breakdown={originBreakdown(breakdownRows)}
            primaryClassName="text-amount-xl text-white"
            unitClassName="text-white"
            secondaryClassName="text-body text-white"
          />
          {current.partial && <p className="text-footnote text-white">{t("partial")}</p>}
        </div>
      </DashboardCard>
    );
  }

  const icon: IconName = card === "income" ? "sack-dollar" : "credit-card";
  return (
    <DashboardCard href={href} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body text-ink-2 flex items-center gap-2 font-medium">
          {/* Ícono neutro: la dirección va solo en el distintivo (IVERN_FIXES §3). */}
          <span className="bg-surface2 text-ink-2 grid size-8 place-items-center rounded-full">
            <Icon name={icon} size={16} />
          </span>
          {t(card)}
        </p>
        <ChangeChip change={change} good={good} prevLabel={prevLabel} />
      </div>
      <MoneyAmount
        variant="total"
        ticker={first}
        value={value}
        breakdown={originBreakdown(breakdownRows)}
        primaryClassName="text-amount-xl"
        secondaryClassName="text-body text-ink-2"
      />
      {current.count === 0 ? (
        <p className="text-footnote text-ink-3">{t("noMovements")}</p>
      ) : (
        current.partial && <p className="text-footnote text-ink-3">{t("partial")}</p>
      )}
    </DashboardCard>
  );
}

/** "↑ +4,2 % vs sep" con el color de bueno o malo; "Sin datos de sep" si no hay base. */
function ChangeChip({
  change,
  good,
  prevLabel,
  hero,
}: {
  change: number | null;
  good: boolean | null;
  prevLabel: string;
  hero?: boolean;
}) {
  const t = useTranslations("dashboard");
  const f = useFormat();
  const text =
    change === null
      ? t("noComparison", { month: prevLabel })
      : t("vsMonth", {
          change: `${change > 0 ? "+" : change < 0 ? "−" : ""}${f.number(Math.abs(change), 1)}`,
          month: prevLabel,
        });
  const arrow: IconName | null =
    change === null || change === 0 ? null : change > 0 ? "arrow-small-up" : "arrow-small-down";
  return (
    <span
      className={cn(
        "text-callout inline-flex h-7 items-center gap-1 rounded-full px-3 font-semibold whitespace-nowrap tabular-nums",
        hero
          ? "bg-hero-chip text-white"
          : good === null
            ? "bg-slate-tint text-slate-text"
            : good
              ? "bg-positive-tint text-positive-text"
              : "bg-negative-tint text-negative-text",
      )}
    >
      {arrow && <Icon name={arrow} size={14} />}
      {text}
    </span>
  );
}
