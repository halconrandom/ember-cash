"use client";

/**
 * Gráfica "Plan de pago" (04-debts.png): una barra por deuda, en el orden en
 * que se termina, desde hoy hasta su mes de pago; una línea vertical marca el
 * mes libre de deudas. El eje lleva a lo sumo 5 etiquetas con paso
 * adaptable (axisTicks: mes, trimestre, semestre, año o N años); con paso
 * anual solo el año ("2027"), si no "oct 2026" (spec §4.10: siempre con año).
 * Una guía por etiqueta. Fechas con formatMonthShort ("ago 2027", sin "de").
 * Al cambiar de método, los anchos se transforman con un spring sin rebote.
 * Barras en ember-fill (DESIGN_SPEC §1: barras de pago).
 */
import { motion } from "motion/react";
import { useTranslations } from "next-intl";

import { Icon } from "@/components/ui/icon";
import type { PayoffResult } from "@/lib/debts/payoff";
import { axisTicks } from "@/lib/debts/plan";
import { useFormat } from "@/lib/i18n/use-format";
import { useFirstView } from "@/lib/motion/first-view";
import { shiftMonth } from "@/lib/transactions/dates";

type Props = {
  plan: Extract<PayoffResult, { ok: true }>;
  names: Record<string, string>;
  startMonth: string;
  /** Hay deudas fuera del plan: la etiqueta final dice "de las deudas del plan". */
  partial?: boolean;
};

export function PayoffTimeline({ plan, names, startMonth, partial = false }: Props) {
  const t = useTranslations("debts");
  // Las barras crecen solo en la primera carga; al cambiar de método
  // (Avalanche/Snowball) se reacomodan con el resorte desde su ancho actual.
  const first = useFirstView();
  const f = useFormat();
  const { axisMonths, ticks, yearly } = axisTicks(plan.months);
  const pct = (months: number) => `${(months / axisMonths) * 100}%`;
  const label = (month: string) => f.monthShort(month);

  return (
    <figure aria-label={t("timelineLabel")}>
      <div className="text-callout text-ink-2 relative mb-2 h-5" aria-hidden>
        {ticks.map((m, i) => (
          <span
            key={m}
            className="absolute whitespace-nowrap"
            style={
              i === 0
                ? { left: 0 }
                : i === ticks.length - 1
                  ? { right: 0 }
                  : { left: pct(m), transform: "translateX(-50%)" }
            }
          >
            {f.monthShort(shiftMonth(startMonth, m), yearly)}
          </span>
        ))}
      </div>

      <div className="relative">
        {/* Una guía por etiqueta y línea del mes libre de deudas. */}
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          {ticks.map((m) => (
            <span
              key={m}
              className="bg-divider absolute top-0 bottom-0 w-px"
              style={{ left: pct(m) }}
            />
          ))}
          <motion.span
            className="bg-positive absolute top-0 bottom-0 w-0.5"
            initial={false}
            animate={{ left: pct(plan.months) }}
            transition={{ type: "spring", bounce: 0, duration: 0.4 }}
          />
        </div>

        <ol className="relative space-y-6 py-2">
          {plan.debts.map((d, i) => (
            <li key={d.id}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="text-callout text-ember-text font-semibold tabular-nums">
                    {i + 1}
                  </span>
                  <span className="text-body text-ink truncate font-semibold">{names[d.id]}</span>
                </span>
                <span className="text-callout text-ink-2 whitespace-nowrap">
                  {label(d.payoffMonth)}
                </span>
              </div>
              <div className="mt-2 h-3.5">
                <motion.div
                  className="bg-ember-fill h-full rounded-full"
                  initial={first ? { width: 0 } : false}
                  animate={{ width: pct(d.months) }}
                  transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                />
              </div>
            </li>
          ))}
        </ol>
      </div>

      <figcaption className="mt-3 flex justify-end">
        <span className="bg-positive-tint text-callout text-positive-text inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-semibold">
          <Icon name="flag" size={16} />
          {t(partial ? "debtFreePlanBadge" : "debtFreeBadge", { date: label(plan.debtFreeMonth) })}
        </span>
      </figcaption>
    </figure>
  );
}
