"use client";

/**
 * Contenido de Deudas (04-debts.png). Todo se muestra en la moneda elegida:
 * las deudas en otra moneda se convierten con la tasa más reciente y llevan
 * su "original" debajo. El plan de pago se simula en la moneda elegida
 * (lib/debts/payoff.ts); si falta la tasa y hay monedas mezcladas, no se
 * simula y se explica por qué. Las deudas fuera del plan (exclude_from_plan)
 * siguen en la lista y en los totales, pero no en la simulación, el Gantt,
 * la fecha libre ni el pago extra (lib/debts/plan.ts).
 */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { GlossaryTerm } from "@/components/help/glossary-term";
import { MoneyAmount } from "@/components/money/money-amount";
import { useRate } from "@/components/money/rate-provider";
import { TopbarSubtitle } from "@/components/shell/topbar-context";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { CurrencyCode } from "@/lib/db/types";
import { debtDueState } from "@/lib/debts/dates";
import {
  monthlyInterest,
  monthlyRateScaled,
  simulatePayoff,
  type PayoffMethod,
} from "@/lib/debts/payoff";
import { planInput } from "@/lib/debts/plan";
import type { DebtSummary } from "@/lib/debts/queries";
import { goalPercent } from "@/lib/goals/status";
import { useFormat } from "@/lib/i18n/use-format";
import { convert, latestRateFor, type Rate } from "@/lib/money/convert";
import { add, money, type Money } from "@/lib/money/money";
import { withFilters } from "@/lib/transactions/filters";
import { cn } from "@/lib/utils";

import { ExtraPaymentCard } from "./extra-payment-card";
import { PayoffTimeline } from "./payoff-timeline";

type SortKey = "due" | "balance" | "interest";

/** Referencia estable para no invalidar el useMemo de abajo en cada render. */
const NO_RATES: readonly Rate[] = [];

/** Importe en la moneda elegida, o null si no se puede convertir. */
function toDisplay(m: Money, to: CurrencyCode, rates: readonly Rate[]): Money | null {
  if (m.currency === to) return m;
  const rate = latestRateFor(rates, m.currency, to);
  return rate ? convert(m, to, rate) : null;
}

export function DebtsView({ debts, today }: { debts: DebtSummary[]; today: string }) {
  const t = useTranslations("debts");
  const f = useFormat();
  const { rates, status, displayCurrency } = useRate();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [sort, setSort] = useState<SortKey>("due");
  const [method, setMethod] = useState<PayoffMethod>("avalanche");
  const usable = status === "error" ? NO_RATES : rates;
  const active = debts.filter((d) => d.balance.amountMinor > 0n);

  // Deudas en la moneda elegida (null si alguna no se puede convertir).
  const converted = useMemo(() => {
    const list = active.map((d) => {
      const balance = toDisplay(d.balance, displayCurrency, usable);
      const min = toDisplay(d.minPayment, displayCurrency, usable);
      return balance && min ? { d, balance, min } : null;
    });
    return list.every(Boolean) ? (list as { d: DebtSummary; balance: Money; min: Money }[]) : null;
  }, [active, displayCurrency, usable]);

  // Entrada del plan: solo las deudas que no están fuera del plan.
  const planIn = useMemo(() => {
    if (!converted) return null;
    return planInput(
      converted.map(({ d, balance, min }) => ({
        id: d.id,
        balanceMinor: balance.amountMinor,
        aprBps: d.aprBps,
        aprKind: d.aprKind,
        minPaymentMinor: min.amountMinor,
        excludeFromPlan: d.excludeFromPlan,
      })),
      method,
      today.slice(0, 7),
    );
  }, [converted, method, today]);
  const anyExcluded = active.some((d) => d.excludeFromPlan);
  const allExcluded = active.length > 0 && active.every((d) => d.excludeFromPlan);
  const plan = useMemo(
    () => (planIn && planIn.debts.length > 0 ? simulatePayoff(planIn) : null),
    [planIn],
  );

  if (debts.length === 0) {
    return (
      <div id="help-see-debts">
        <TopbarSubtitle text={t("subtitleNoRate", { count: 0 })} />
        <EmptyState
          icon="credit-card"
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          actions={
            <Button
              icon="plus"
              onClick={() =>
                router.push(`${pathname}${withFilters(params, { debt: "new" })}`, { scroll: false })
              }
            >
              {t("addDebt")}
            </Button>
          }
        />
      </div>
    );
  }

  const zero = money(0n, displayCurrency);
  const totals = converted
    ? {
        remaining: converted.reduce((s, x) => add(s, x.balance), zero),
        minimums: converted.reduce((s, x) => add(s, x.min), zero),
        interest: converted.reduce(
          (s, x) =>
            add(
              s,
              money(
                monthlyInterest(x.balance.amountMinor, monthlyRateScaled(x.d.aprBps, x.d.aprKind)),
                displayCurrency,
              ),
            ),
          zero,
        ),
      }
    : null;
  // Porcentaje pagado de todo (sobre lo original, en la moneda elegida).
  const paidPct = (() => {
    let paid = zero;
    let original = zero;
    for (const d of debts) {
      const p = toDisplay(d.paid, displayCurrency, usable);
      const o = toDisplay(d.original, displayCurrency, usable);
      if (!p || !o) return null;
      paid = add(paid, p);
      original = add(original, o);
    }
    return goalPercent(paid.amountMinor, original.amountMinor);
  })();

  const sorted = [...active].sort((a, b) => {
    if (sort === "balance") {
      const ab =
        toDisplay(a.balance, displayCurrency, usable)?.amountMinor ?? a.balance.amountMinor;
      const bb =
        toDisplay(b.balance, displayCurrency, usable)?.amountMinor ?? b.balance.amountMinor;
      return ab < bb ? 1 : ab > bb ? -1 : 0;
    }
    if (sort === "interest") return b.aprBps - a.aprBps;
    const ad = a.dueDay ? debtDueState(a.dueDay, today, a.paidMonths).due : "9999";
    const bd = b.dueDay ? debtDueState(b.dueDay, today, b.paidMonths).due : "9999";
    return ad.localeCompare(bd);
  });
  // Mínimos de las deudas del plan: base del pago extra sugerido.
  const planMinimums = converted
    ? converted.filter((x) => !x.d.excludeFromPlan).reduce((s, x) => add(s, x.min), zero)
    : zero;
  const methodLabel = t(method).toLowerCase();

  return (
    <div id="help-see-debts" className="space-y-6">
      <TopbarSubtitle
        text={
          paidPct === null
            ? t("subtitleNoRate", { count: active.length })
            : t("subtitle", { count: active.length, percent: paidPct })
        }
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4 xl:gap-6">
        <StatCard icon="sack-dollar" label={t("totalRemaining")}>
          {totals ? (
            <MoneyAmount
              variant="total"
              fit
              value={totals.remaining}
              primaryClassName="text-amount-l-fit"
              secondaryClassName="text-body text-ink-2"
            />
          ) : (
            <Unavailable />
          )}
        </StatCard>
        <StatCard icon="calendar-clock" label={t("monthlyMinimums")}>
          {totals ? (
            <MoneyAmount
              variant="total"
              fit
              value={totals.minimums}
              primaryClassName="text-amount-l-fit"
              secondaryClassName="text-body text-ink-2"
            />
          ) : (
            <Unavailable />
          )}
        </StatCard>
        <StatCard icon="chart-line-up" label={t("interestThisMonth")} tone="negative">
          {totals ? (
            <MoneyAmount
              variant="total"
              fit
              value={totals.interest}
              primaryClassName="text-amount-l-fit"
              secondaryClassName="text-body text-ink-2"
            />
          ) : (
            <Unavailable />
          )}
        </StatCard>
        <StatCard
          icon="flag"
          label={anyExcluded ? t("debtFreePlanDate") : t("debtFreeDate")}
          tone="positive"
        >
          {allExcluded && converted ? (
            <>
              <p className="text-amount-l text-ink">—</p>
              <p className="text-body text-ink-2">{t("planAllExcludedShort")}</p>
            </>
          ) : plan?.ok ? (
            <>
              <p className="text-amount-l text-ink">
                {plan.months === 0 ? "—" : f.monthShort(plan.debtFreeMonth)}
              </p>
              <p className="text-body text-ink-2">
                {t("debtFreeIn", { months: plan.months, method: methodLabel })}
              </p>
            </>
          ) : plan ? (
            <>
              <p className="text-amount-l text-negative-text">{t("neverPaysOff")}</p>
              <p className="text-body text-ink-2">{t("neverPaysOffHint")}</p>
            </>
          ) : (
            <Unavailable />
          )}
        </StatCard>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-title2">{t("yourDebts")}</CardTitle>
            <SegmentedControl<SortKey>
              label={t("sortLabel")}
              options={[
                { value: "due", label: t("sortDue") },
                { value: "balance", label: t("sortBalance") },
                { value: "interest", label: t("sortInterest") },
              ]}
              value={sort}
              onChange={setSort}
            />
          </div>
          <ul className="space-y-4">
            {sorted.map((d) => (
              <li key={d.id}>
                <DebtRow debt={d} today={today} />
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-6">
          <Card className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-title2">{t("payoffTitle")}</CardTitle>
              <SegmentedControl<PayoffMethod>
                label={t("methodLabel")}
                options={[
                  { value: "avalanche", label: t("avalanche") },
                  { value: "snowball", label: t("snowball") },
                ]}
                value={method}
                onChange={setMethod}
              />
            </div>
            <p className="text-footnote text-ink-3 -mt-2">
              <GlossaryTerm term="avalanche">{t("avalanche")}</GlossaryTerm>
              {" · "}
              <GlossaryTerm term="snowball">{t("snowball")}</GlossaryTerm>
            </p>
            {!converted ? (
              <p className="text-body text-ink-2">{t("timelineUnavailable")}</p>
            ) : allExcluded ? (
              <div className="rounded-row bg-surface2 space-y-1 p-5 text-center">
                <p className="text-headline text-ink">{t("planAllExcludedTitle")}</p>
                <p className="text-body text-ink-2">{t("planAllExcludedBody")}</p>
              </div>
            ) : plan && !plan.ok ? (
              <p className="text-body text-negative-text">{t("timelineNever")}</p>
            ) : plan && plan.ok && plan.months > 0 ? (
              <PayoffTimeline
                plan={plan}
                names={Object.fromEntries(active.map((d) => [d.id, d.name]))}
                startMonth={today.slice(0, 7)}
                partial={anyExcluded}
              />
            ) : null}
          </Card>
          {planIn && plan?.ok && plan.months > 0 && (
            <ExtraPaymentCard currency={displayCurrency} minimums={planMinimums} input={planIn} />
          )}
        </div>
      </div>
    </div>
  );
}

function Unavailable() {
  const t = useTranslations("money");
  return <p className="text-body text-ink-3">{t("rateUnavailable")}</p>;
}

function StatCard({
  icon,
  label,
  tone = "ember",
  children,
}: {
  icon: "sack-dollar" | "calendar-clock" | "chart-line-up" | "flag";
  label: string;
  tone?: "ember" | "negative" | "positive";
  children: React.ReactNode;
}) {
  const tile =
    tone === "negative"
      ? "bg-negative-tint text-negative-text"
      : tone === "positive"
        ? "bg-positive-tint text-positive-text"
        : "bg-ember-50 text-ember-text";
  return (
    <Card className="space-y-2">
      <p className="text-body text-ink-2 flex items-center gap-2">
        <span className={cn("grid size-7 place-items-center rounded-sm", tile)}>
          <Icon name={icon} size={16} />
        </span>
        {label}
      </p>
      {children}
    </Card>
  );
}

/** Una deuda (fila de "Tus deudas"). */
function DebtRow({ debt, today }: { debt: DebtSummary; today: string }) {
  const t = useTranslations("debts");
  const f = useFormat();
  const { rates, status, displayCurrency } = useRate();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const usable = status === "error" ? [] : rates;
  const differs = debt.balance.currency !== displayCurrency;
  const dim = status === "updating" && differs ? "opacity-60" : "";
  const shown = (m: Money) => toDisplay(m, displayCurrency, usable) ?? m;
  const canConvert = (m: Money) => toDisplay(m, displayCurrency, usable) !== null;

  // Vencimiento sin saldar: si el de este ciclo ya se pagó, el siguiente.
  const dueState = debt.dueDay ? debtDueState(debt.dueDay, today, debt.paidMonths) : null;
  const due = dueState?.due ?? null;
  const percent = goalPercent(debt.paid.amountMinor, debt.original.amountMinor);
  /** "1.700.000 de 4.900.000" en COP (unidad compartida); con símbolo en USD. */
  const pair = (paid: Money, total: Money) =>
    paid.currency === "COP"
      ? t("paidPair", { paid: f.amount(paid), total: f.amount(total) })
      : t("paidPair", { paid: f.money(paid), total: f.money(total) });
  const open = (key: "debt" | "pay") =>
    router.push(`${pathname}${withFilters(params, { [key]: debt.id })}`, { scroll: false });

  return (
    <article className="rounded-row bg-surface2 p-5">
      <div className="flex flex-wrap items-start gap-3">
        <span className="rounded-control bg-surface text-ember-text grid size-10 shrink-0 place-items-center">
          <Icon name={debt.iconKey} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-headline text-ink">{debt.name}</h3>
          {debt.subtitle && <p className="text-callout text-ink-2">{debt.subtitle}</p>}
        </div>
        {debt.accountId && (
          <Link href="/settings" className="rounded-full">
            <Badge tone="info" className="hover:underline">
              <Icon name="credit-card" size={14} />
              {t("cardChip")}
            </Badge>
          </Link>
        )}
        {debt.excludeFromPlan && (
          <Badge tone="neutral" className="bg-surface text-ink-2">
            {t("outOfPlan")}
          </Badge>
        )}
        {dueState?.paidThisCycle && (
          <Badge tone="positive">
            <Icon name="check" size={14} />
            {t("paidThisMonth")}
          </Badge>
        )}
        {dueState ? (
          <Badge
            tone={
              dueState.tone === "today"
                ? "warning"
                : dueState.tone === "soon"
                  ? "negative"
                  : "neutral"
            }
            className={cn(dueState.tone === "later" && "bg-surface text-ink")}
          >
            <Icon name="calendar" size={14} />
            {dueState.tone === "today" ? t("dueToday") : t("due", { date: f.date(due!) })}
          </Badge>
        ) : (
          <Badge tone="neutral" className="bg-surface">
            {t("noDueDay")}
          </Badge>
        )}
      </div>

      {debt.accountId && debt.aprBps === 0 && (
        <p className="text-callout text-ink-2 mt-2">{t("cardAddRate")}</p>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.6fr)_minmax(0,1.1fr)_minmax(0,1.5fr)]">
        <Stat label={t("remaining")}>
          <AmountText value={shown(debt.balance)} className={dim} />
          {differs && canConvert(debt.balance) && (
            <p className="text-callout text-ink-3 tabular-nums">
              {t("original", { amount: f.money(debt.balance) })}
            </p>
          )}
        </Stat>
        <Stat label={<GlossaryTerm term="apr">{t("apr")}</GlossaryTerm>}>
          <p className="text-body text-ink font-semibold tabular-nums">
            {f.number(debt.aprBps / 100, 1)}%
          </p>
          <p className="text-callout text-ink-2">
            {debt.aprKind === "EA" ? t("aprEA") : t("aprNominal")}
          </p>
        </Stat>
        <Stat label={t("minPayment")}>
          <AmountText value={shown(debt.minPayment)} className={dim} />
          {differs && canConvert(debt.minPayment) && (
            <p className="text-callout text-ink-3 tabular-nums">
              {t("original", { amount: f.money(debt.minPayment) })}
            </p>
          )}
        </Stat>
        <Stat label={t("paidOff")}>
          <p className="text-body text-positive-text font-semibold tabular-nums">{percent}%</p>
          <p className={cn("text-callout text-ink-2 tabular-nums", dim)}>
            {pair(shown(debt.paid), shown(debt.original))}
          </p>
        </Stat>
      </dl>

      {/* Barra de "pagado" (DESIGN_SPEC §1: el progreso de pago de deudas es
          uno de los dos usos del naranja como dato). Token debt-bar: ember-fill
          en claro y naranja gráfico en oscuro (excepción anotada en la spec).
          El valor va escrito arriba. */}
      <div className="bg-track mt-4 h-1.5 overflow-hidden rounded-full" aria-hidden>
        <div className="bg-debt-bar h-full rounded-full" style={{ width: `${percent}%` }} />
      </div>
      <ProgressBarLabel percent={percent} />

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="soft"
          size="sm"
          icon="plus"
          onClick={() => open("pay")}
          aria-label={t("recordPaymentFor", { name: debt.name })}
        >
          {t("recordPayment")}
        </Button>
        {debt.accountId && (
          <Button
            variant="soft"
            size="sm"
            icon="exchange"
            onClick={() => router.push(`/transactions?account=${debt.accountId}&range=all`)}
          >
            {t("cardMovements")}
          </Button>
        )}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => open("debt")}
          aria-label={t("editDebt", { name: debt.name })}
        >
          {t("edit")}
        </Button>
      </div>
    </article>
  );
}

/** Texto accesible del porcentaje pagado (la barra es decorativa). */
function ProgressBarLabel({ percent }: { percent: number }) {
  const t = useTranslations("debts");
  return <span className="sr-only">{`${t("paidOff")}: ${percent}%`}</span>;
}

function Stat({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-caption text-ink-2 uppercase">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

function AmountText({ value, className }: { value: Money; className?: string }) {
  const f = useFormat();
  const { main, unit } = f.moneyParts(value);
  // En el teléfono cada columna del <dl> mide ~110 px: el número no se parte,
  // pero "COP" baja de línea (espacio normal, no el no separable) antes
  // que salirse de la fila.
  return (
    <p className={cn("text-body text-ink font-semibold tabular-nums", className)}>
      <span className="whitespace-nowrap">{main}</span>
      {unit && (
        <>
          {" "}
          <span className="text-ink-3 font-normal whitespace-nowrap">{unit}</span>
        </>
      )}
    </p>
  );
}
