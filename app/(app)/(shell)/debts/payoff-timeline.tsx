"use client";

/**
 * Gráfica "Plan de pago" (04-debts.png): una barra por deuda, en el orden en
 * que se termina, desde hoy hasta su mes de pago; una línea vertical marca el
 * mes libre de deudas. El eje muestra el año en cada etiqueta (spec §4.10:
 * "Oct 2026", nunca "Oct 26") cada 12 meses, con guías sin texto cada 6.
 * Al cambiar de método, los anchos se transforman con un spring sin rebote.
 * Barras en ember-fill (DESIGN_SPEC §1: barras de pago).
 */
import { motion } from "motion/react";
import { useTranslations } from "next-intl";

import { Icon } from "@/components/ui/icon";
import type { PayoffResult } from "@/lib/debts/payoff";
import { useFormat } from "@/lib/i18n/use-format";
import { shiftMonth } from "@/lib/transactions/dates";

type Props = {
  plan: Extract<PayoffResult, { ok: true }>;
  names: Record<string, string>;
  startMonth: string;
};

export function PayoffTimeline({ plan, names, startMonth }: Props) {
  const t = useTranslations("debts");
  const f = useFormat();
  // Eje: años completos desde hoy, mínimo dos.
  const axisMonths = 12 * Math.max(2, Math.ceil(plan.months / 12));
  const years = Array.from({ length: axisMonths / 12 + 1 }, (_, i) => i * 12);
  const guides = Array.from({ length: axisMonths / 6 + 1 }, (_, i) => i * 6);
  const pct = (months: number) => `${(months / axisMonths) * 100}%`;
  const label = (month: string) => f.date(`${month}-01`, "shortMonthYear");

  return (
    <figure aria-label={t("timelineLabel")}>
      <div className="text-callout text-ink-2 relative mb-2 h-5" aria-hidden>
        {years.map((m, i) => (
          <span
            key={m}
            className="absolute whitespace-nowrap capitalize"
            style={
              i === 0
                ? { left: 0 }
                : i === years.length - 1
                  ? { right: 0 }
                  : { left: pct(m), transform: "translateX(-50%)" }
            }
          >
            {label(shiftMonth(startMonth, m))}
          </span>
        ))}
      </div>

      <div className="relative">
        {/* Guías cada 6 meses y línea del mes libre de deudas. */}
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          {guides.map((m) => (
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
                <span className="text-callout text-ink-2 whitespace-nowrap capitalize">
                  {label(d.payoffMonth)}
                </span>
              </div>
              <div className="mt-2 h-3.5">
                <motion.div
                  className="bg-ember-fill h-full rounded-full"
                  initial={{ width: 0 }}
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
          {t("debtFreeBadge", { date: label(plan.debtFreeMonth) })}
        </span>
      </figcaption>
    </figure>
  );
}
