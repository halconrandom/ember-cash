"use client";

/**
 * Hogar en scope Compartido (08-household.png / 18-household-dark.png).
 *
 * Primera fila: una tarjeta por miembro (lo que pagó en gastos compartidos
 * del mes y su porcentaje) y "Liquidar cuentas" (balance histórico: quién le
 * debe a quién). Debajo, los gastos compartidos del mes con su reparto y, a
 * la derecha, el presupuesto compartido, la meta compartida y el historial de
 * liquidaciones.
 *
 * Los montos se muestran en la moneda elegida (COP/USD) con la tasa más
 * reciente; el balance se lleva por moneda (lib/household/balance.ts).
 */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { MoneyAmount } from "@/components/money/money-amount";
import { useRate } from "@/components/money/rate-provider";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/chip";
import { Icon } from "@/components/ui/icon";
import { ProgressBar } from "@/components/ui/progress-bar";
import { ProgressRing } from "@/components/ui/progress-ring";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { CATEGORY_META } from "@/lib/categories";
import { goalPercent } from "@/lib/goals/status";
import {
  balancesByCurrency,
  fullSettlement,
  isSettled,
  netsIn,
  transfersFor,
} from "@/lib/household/balance";
import { budgetPercent, budgetState, spentIn, type BudgetState } from "@/lib/household/budget";
import type {
  Budget,
  HouseholdMemberInfo,
  Settlement,
  SharedGoal,
  SharedTransaction,
} from "@/lib/household/queries";
import { splitPercents } from "@/lib/household/split";
import { useFormat } from "@/lib/i18n/use-format";
import { convert } from "@/lib/money/convert";
import { divRound } from "@/lib/money/convert";
import { money, type Money } from "@/lib/money/money";
import { withFilters } from "@/lib/transactions/filters";
import { cn } from "@/lib/utils";

import { BudgetModal, type BudgetDraft } from "./budget-modal";
import { SettleModal } from "./settle-modal";

/** Mosaico del ícono con el tinte de la categoría (igual que en Transacciones). */
const TILE: Record<string, string> = {
  positive: "bg-positive-tint text-positive",
  negative: "bg-negative-tint text-negative",
  warning: "bg-amber-tint text-amber",
  info: "bg-info-tint text-info",
  violet: "bg-violet-tint text-violet",
  pink: "bg-pink-tint text-pink",
  teal: "bg-teal-tint text-teal",
  olive: "bg-olive-tint text-olive",
  neutral: "bg-slate-tint text-slate",
  ember: "bg-ember-50 text-ember",
};

/** Color de la barra y del texto según el estado del presupuesto. */
const BUDGET_TONE: Record<BudgetState, { bar: string; text: string }> = {
  ok: { bar: "bg-neutral-bar", text: "text-ink-2" },
  near: { bar: "bg-amber", text: "text-amber-text" },
  over: { bar: "bg-negative", text: "text-negative-text" },
};

type Props = {
  householdId: string;
  members: HouseholdMemberInfo[];
  currentUserId: string;
  transactions: SharedTransaction[];
  settlements: Settlement[];
  budgets: Budget[];
  previousBudgetMonth: string | null;
  goal: SharedGoal | null;
  /** Mes elegido (AAAA-MM). */
  month: string;
};

export function HouseholdView(props: Props) {
  const { members, transactions, settlements, month } = props;
  const t = useTranslations("household");
  const f = useFormat();
  const { rate, status, displayCurrency } = useRate();
  const usable = status === "error" ? null : rate;

  const ids = members.map((m) => m.userId);
  const nameOf = (id: string) => members.find((m) => m.userId === id)?.displayName ?? t("noName");
  const colorOf = (id: string): "a" | "b" => (ids.indexOf(id) === 0 ? "a" : "b");

  // Mes elegido: gastos para las tarjetas de miembros y la lista.
  const monthTx = transactions.filter((tx) => tx.occurredOn.startsWith(month));
  const monthExpenses = monthTx.filter((tx) => tx.kind === "expense");
  const paid = Object.fromEntries(
    ids.map((id) => [
      id,
      spentIn(
        monthExpenses.filter((tx) => tx.paidBy === id).map((tx) => tx.amount),
        displayCurrency,
        usable,
      ).total,
    ]),
  );
  const totalPaid = Object.values(paid).reduce((acc, m) => acc + m.amountMinor, 0n);

  // Balance histórico.
  const balances = balancesByCurrency(
    transactions.map((tx) => ({ ...tx, income: tx.kind === "income" })),
    settlements,
  );
  const nets = netsIn(balances, ids, displayCurrency, usable);
  const transfer = nets ? (transfersFor(nets)[0] ?? null) : null;
  const plan = fullSettlement(balances);
  const settled = isSettled(balances);
  const monthLabel = f.date(`${month}-01`, "monthYear");

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      {members.map((m) => (
        <MemberCard
          key={m.userId}
          member={m}
          color={colorOf(m.userId)}
          paid={paid[m.userId]}
          percent={
            totalPaid > 0n ? Number(divRound(paid[m.userId].amountMinor * 100n, totalPaid)) : 0
          }
          memberCount={members.length}
        />
      ))}
      {members.length === 1 && <InviteHintCard />}

      <SettleCard
        householdId={props.householdId}
        members={members}
        nameOf={nameOf}
        colorOf={colorOf}
        transfer={transfer}
        plan={plan}
        settled={settled}
        rateMissing={!nets}
        currentUserId={props.currentUserId}
      />

      <div className="space-y-6 xl:col-span-2">
        <ExpensesCard
          transactions={monthTx}
          members={members}
          nameOf={nameOf}
          colorOf={colorOf}
          monthLabel={monthLabel}
        />
        <HistoryCard settlements={settlements} nameOf={nameOf} />
      </div>

      <div className="space-y-6">
        <BudgetCard
          householdId={props.householdId}
          budgets={props.budgets}
          expenses={monthExpenses}
          month={month}
          monthLabel={monthLabel}
          previousMonth={props.previousBudgetMonth}
        />
        <GoalCard goal={props.goal} members={members} colorOf={colorOf} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tarjetas de miembros
// ---------------------------------------------------------------------------

function MemberCard({
  member,
  color,
  paid,
  percent,
  memberCount,
}: {
  member: HouseholdMemberInfo;
  color: "a" | "b";
  paid: Money;
  percent: number;
  memberCount: number;
}) {
  const t = useTranslations("household");
  const f = useFormat();
  const share = Math.round(100 / memberCount);
  const splitLabel = Array.from({ length: memberCount }, () => share).join("/");
  return (
    <Card className="flex flex-col gap-5">
      <div className="flex items-start gap-4">
        <Avatar name={member.displayName} member={color} size={56} className="text-title2" />
        <div className="min-w-0 flex-1">
          <p className="text-title2 text-ink truncate">{member.displayName ?? t("noName")}</p>
          <p className="text-callout text-ink-2">{t("paidForShared")}</p>
        </div>
        <Badge tone="neutral" size="sm">
          {member.role === "owner" ? t("roleOwner") : t("roleMember")}
        </Badge>
      </div>
      <MoneyAmount
        kind="total"
        value={paid}
        primaryClassName="text-amount-xl"
        secondaryClassName="hidden"
      />
      <div className="space-y-3">
        <ProgressBar
          percent={percent}
          label={t("shareOfSpending", { percent })}
          barClassName={color === "a" ? "bg-member-a" : "bg-member-b"}
        />
        <div className="text-callout text-ink-2 flex justify-between gap-3">
          <span>{t("shareOfSpending", { percent: f.number(percent) })}</span>
          <span>{t("equalSplit", { split: splitLabel })}</span>
        </div>
      </div>
    </Card>
  );
}

/** Hogar con un solo miembro: invita a alguien para compartir. */
function InviteHintCard() {
  const t = useTranslations("household");
  return (
    <Card className="flex flex-col justify-center gap-2">
      <p className="text-headline text-ink">{t("aloneTitle")}</p>
      <p className="text-body text-ink-2">{t("aloneDescription")}</p>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Liquidar cuentas
// ---------------------------------------------------------------------------

function SettleCard({
  householdId,
  members,
  nameOf,
  colorOf,
  transfer,
  plan,
  settled,
  rateMissing,
  currentUserId,
}: {
  householdId: string;
  members: HouseholdMemberInfo[];
  nameOf: (id: string) => string;
  colorOf: (id: string) => "a" | "b";
  transfer: { from: string; to: string; amount: Money } | null;
  plan: { from: string; to: string; amount: Money }[];
  settled: boolean;
  rateMissing: boolean;
  currentUserId: string;
}) {
  const t = useTranslations("household");
  const f = useFormat();
  const [open, setOpen] = useState(false);
  const first = transfer ?? plan[0] ?? null;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-title2 text-ink">{t("settleTitle")}</h2>
        {first && !settled && (
          <span className="flex items-center gap-2" aria-hidden>
            <Avatar name={nameOf(first.from)} member={colorOf(first.from)} />
            <Icon name="arrow-small-right" size={18} className="text-ink-2" />
            <Avatar name={nameOf(first.to)} member={colorOf(first.to)} />
          </span>
        )}
      </div>

      {members.length < 2 ? (
        <p className="text-body text-ink-2">{t("settleNeedsMember")}</p>
      ) : settled || (!transfer && !rateMissing) ? (
        <div className="space-y-1">
          <p className="text-headline text-ink">{t("settledTitle")}</p>
          <p className="text-body text-ink-2">{t("settledDescription")}</p>
        </div>
      ) : transfer ? (
        <div className="space-y-1">
          <p className="text-body text-ink-2">
            {t("owes", { from: nameOf(transfer.from), to: nameOf(transfer.to) })}
          </p>
          <MoneyAmount
            kind="total"
            value={transfer.amount}
            className="flex-row! flex-wrap items-baseline gap-x-2"
            primaryClassName="text-amount-xl"
            secondaryClassName="text-callout text-ink-2"
          />
        </div>
      ) : (
        // Sin tasa no se puede sumar COP y USD: se muestra cada moneda.
        <ul className="space-y-1">
          {plan.map((p) => (
            <li key={p.amount.currency} className="text-body text-ink">
              {t("owesAmount", {
                from: nameOf(p.from),
                to: nameOf(p.to),
                amount: f.money(p.amount),
              })}
            </li>
          ))}
        </ul>
      )}

      {members.length >= 2 && (
        <Button
          variant="secondary"
          className="mt-auto w-full"
          disabled={settled}
          onClick={() => setOpen(true)}
        >
          {t("settleAction")}
        </Button>
      )}
      <SettleModal
        open={open}
        onClose={() => setOpen(false)}
        householdId={householdId}
        transfer={transfer}
        plan={plan}
        nameOf={nameOf}
        currentUserId={currentUserId}
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Gastos compartidos
// ---------------------------------------------------------------------------

function ExpensesCard({
  transactions,
  members,
  nameOf,
  colorOf,
  monthLabel,
}: {
  transactions: SharedTransaction[];
  members: HouseholdMemberInfo[];
  nameOf: (id: string) => string;
  colorOf: (id: string) => "a" | "b";
  monthLabel: string;
}) {
  const t = useTranslations("household");
  const tc = useTranslations("categories");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [filter, setFilter] = useState<string>("all");
  const ids = members.map((m) => m.userId);
  const rows = filter === "all" ? transactions : transactions.filter((tx) => tx.paidBy === filter);
  const open = (id: string) =>
    router.push(`${pathname}${withFilters(params, { tx: id })}`, { scroll: false });

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-title2 text-ink">
          {t("expensesTitle")}{" "}
          <span className="text-callout text-ink-2 font-normal">
            {t("expensesSubtitle", { month: monthLabel })}
          </span>
        </h2>
        {members.length > 1 && (
          <SegmentedControl
            label={t("filterLabel")}
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: t("filterAll") },
              ...members.map((m) => ({
                value: m.userId,
                label: m.displayName ?? t("noName"),
              })),
            ]}
          />
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-body text-ink-2 py-6 text-center">
          {t("expensesEmpty", { month: monthLabel })}
        </p>
      ) : (
        <ul className="-mx-3">
          {rows.map((tx) => {
            const meta = CATEGORY_META[tx.categoryKey];
            const percents = splitPercents(
              tx.amount.amountMinor,
              tx.splits.map((s) => ({ userId: s.userId, shareMinor: s.share.amountMinor })),
              ids,
            );
            const income = tx.kind === "income";
            return (
              <li key={tx.id}>
                <button
                  type="button"
                  onClick={() => open(tx.id)}
                  className="rounded-row hover:bg-surface2 grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-3 py-3 text-left transition-colors duration-100 md:grid-cols-[auto_minmax(0,1fr)_auto_auto_minmax(130px,auto)]"
                >
                  <span
                    className={cn(
                      "rounded-control grid size-12 place-items-center",
                      TILE[meta.tone],
                    )}
                  >
                    <Icon name={meta.icon} size={22} />
                  </span>
                  <span className="min-w-0">
                    <span className="text-body text-ink block truncate font-semibold">
                      {tx.description}
                    </span>
                    <span className="text-callout text-ink-2 flex items-center gap-1.5">
                      <Avatar
                        name={nameOf(tx.paidBy)}
                        member={colorOf(tx.paidBy)}
                        size={20}
                        className="text-footnote tracking-tighter"
                      />
                      {t(income ? "receivedBy" : "paidBy", { name: nameOf(tx.paidBy) })}
                    </span>
                  </span>
                  <Badge tone={meta.tone} dot className="hidden md:inline-flex">
                    {tc(tx.categoryKey)}
                  </Badge>
                  <Badge
                    tone="neutral"
                    className="hidden tabular-nums md:inline-flex"
                    aria-label={t("splitLabel", { split: percents.join(" / ") })}
                  >
                    {percents.join(" / ")}
                  </Badge>
                  <span className="text-right">
                    <MoneyAmount
                      value={tx.amount}
                      sign={income ? "+" : undefined}
                      positive={income}
                      insideInteractive
                      primaryClassName="text-headline"
                    />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Historial de liquidaciones
// ---------------------------------------------------------------------------

function HistoryCard({
  settlements,
  nameOf,
}: {
  settlements: Settlement[];
  nameOf: (id: string) => string;
}) {
  const t = useTranslations("household");
  const f = useFormat();
  return (
    <Card className="space-y-3">
      <h2 className="text-title2 text-ink">{t("historyTitle")}</h2>
      {settlements.length === 0 ? (
        <p className="text-body text-ink-2">{t("historyEmpty")}</p>
      ) : (
        <ul className="divide-divider divide-y">
          {settlements.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-4 py-3">
              <span className="min-w-0">
                <span className="text-body text-ink block">
                  {t("historyRow", { from: nameOf(s.fromUser), to: nameOf(s.toUser) })}
                </span>
                <span className="text-callout text-ink-2">{f.date(s.settledOn)}</span>
              </span>
              <MoneyAmount value={s.amount} primaryClassName="text-headline" />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Presupuesto compartido
// ---------------------------------------------------------------------------

function BudgetCard({
  householdId,
  budgets,
  expenses,
  month,
  monthLabel,
  previousMonth,
}: {
  householdId: string;
  budgets: Budget[];
  expenses: SharedTransaction[];
  month: string;
  monthLabel: string;
  previousMonth: string | null;
}) {
  const t = useTranslations("household");
  const tc = useTranslations("categories");
  const f = useFormat();
  const { rate, status, displayCurrency } = useRate();
  const usable = status === "error" ? null : rate;
  const [draft, setDraft] = useState<BudgetDraft | null>(null);

  /** "2.060.000 de 2.400.000 COP" o "US$ 515,00 de US$ 600,00". */
  const amountsText = (spent: Money, limit: Money) =>
    t("budgetOf", {
      spent: limit.currency === "COP" ? f.moneyParts(spent).main : f.money(spent),
      limit: f.money(limit),
    });

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-title2 text-ink">
          {t("budgetTitle")}{" "}
          <span className="text-callout text-ink-2 font-normal">{monthLabel}</span>
        </h2>
        <Button size="sm" variant="secondary" onClick={() => setDraft({ month })}>
          {t("budgetAdd")}
        </Button>
      </div>

      {budgets.length === 0 ? (
        <div className="space-y-3">
          <p className="text-body text-ink-2">{t("budgetEmpty")}</p>
          {previousMonth && (
            <Button
              size="sm"
              variant="soft"
              onClick={() => setDraft({ month, copyFrom: previousMonth })}
            >
              {t("budgetCopy", { month: f.date(`${previousMonth}-01`, "monthYear") })}
            </Button>
          )}
        </div>
      ) : (
        <ul className="space-y-4">
          {budgets.map((b) => {
            const items = expenses
              .filter((tx) => tx.categoryKey === b.categoryKey)
              .map((tx) => tx.amount);
            // Porcentaje y estado en la moneda del límite (no dependen de la tasa).
            const { total: spentOwn, partial } = spentIn(items, b.limit.currency, usable);
            const percent = budgetPercent(spentOwn.amountMinor, b.limit.amountMinor);
            const state = budgetState(spentOwn.amountMinor, b.limit.amountMinor);
            const tone = BUDGET_TONE[state];
            // Montos en la moneda elegida si hay tasa.
            const show = (m: Money) =>
              m.currency === displayCurrency || !usable ? m : convert(m, displayCurrency, usable);
            return (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() =>
                    setDraft({
                      month,
                      id: b.id,
                      categoryKey: b.categoryKey,
                      limit: b.limit,
                    })
                  }
                  className="rounded-row hover:bg-surface2 -mx-2 block w-[calc(100%+1rem)] space-y-1.5 px-2 py-1 text-left transition-colors duration-100"
                >
                  <span className="text-body flex items-baseline justify-between gap-3">
                    <span className="text-ink">{tc(b.categoryKey)}</span>
                    <span className={cn("text-callout font-semibold", tone.text)}>
                      {state === "over"
                        ? t("budgetOver", { percent })
                        : t("budgetUsed", { percent })}
                    </span>
                  </span>
                  <ProgressBar
                    percent={percent}
                    label={t("budgetUsed", { percent })}
                    barClassName={tone.bar}
                    className="h-2"
                  />
                  <span className="text-callout text-ink-2 block tabular-nums">
                    {amountsText(show(spentOwn), show(b.limit))}
                    {partial && ` · ${t("budgetPartial")}`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <BudgetModal
        householdId={householdId}
        draft={draft}
        taken={budgets.map((b) => b.categoryKey)}
        onClose={() => setDraft(null)}
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Meta compartida
// ---------------------------------------------------------------------------

function GoalCard({
  goal,
  members,
  colorOf,
}: {
  goal: SharedGoal | null;
  members: HouseholdMemberInfo[];
  colorOf: (id: string) => "a" | "b";
}) {
  const t = useTranslations("household");
  const f = useFormat();
  const { rate, status, displayCurrency } = useRate();
  const usable = status === "error" ? null : rate;

  if (!goal) {
    return (
      <Card className="space-y-3">
        <h2 className="text-title2 text-ink">{t("goalTitle")}</h2>
        <p className="text-body text-ink-2">{t("goalEmpty")}</p>
        <Link href="/savings?goal=new" className={buttonClasses("secondary", "sm")}>
          {t("goalCreate")}
        </Link>
      </Card>
    );
  }

  const percent = goalPercent(goal.saved.amountMinor, goal.target.amountMinor);
  const show = (m: Money) =>
    m.currency === displayCurrency || !usable ? m : convert(m, displayCurrency, usable);

  return (
    <Card className="space-y-5">
      <h2 className="text-title2 text-ink">
        {t("goalTitle")} <span className="text-callout text-ink-2 font-normal">{goal.name}</span>
      </h2>
      <div className="flex items-center gap-5">
        <ProgressRing
          percent={percent}
          size={100}
          stroke={12}
          label={t("goalProgress", { percent })}
        >
          <span className="text-title2 text-ink tabular-nums">{percent}%</span>
        </ProgressRing>
        <div className="min-w-0">
          <p className="text-title2 text-ink tabular-nums">{f.money(show(goal.saved))}</p>
          <p className="text-callout text-ink-2">
            {t("goalOf", { target: f.money(show(goal.target)) })}
            {goal.targetDate &&
              ` · ${t("goalTarget", { date: f.date(goal.targetDate, "shortMonthYear") })}`}
          </p>
        </div>
      </div>
      <ul className="grid grid-cols-2 gap-3">
        {members.map((m) => (
          <li key={m.userId} className="flex items-center gap-2">
            <Avatar
              name={m.displayName}
              member={colorOf(m.userId)}
              size={28}
              className="text-footnote"
            />
            <span className="text-body text-ink font-semibold tabular-nums">
              {f.money(show(goal.byMember[m.userId] ?? money(0n, goal.target.currency)))}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
