"use client";

/**
 * Tendencia de 6 meses (IVERN_FIXES §2): barras agrupadas de ingresos
 * (verde #177B52) y gastos (naranja gráfico), con leyenda, valor directo en
 * el mes elegido y tooltip al pasar el mouse. Las barras crecen desde abajo
 * solo en la primera carga del dashboard (sin animación si se pidió reducir
 * movimiento). Abre Transacciones.
 */
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { useRate } from "@/components/money/rate-provider";
import { Card } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/tooltip";
import { lastMonths, niceMax, trend, type AggregateRow } from "@/lib/dashboard/aggregate";
import { useFormat } from "@/lib/i18n/use-format";
import { useFirstView } from "@/lib/motion/first-view";
import { scaleOf, type Money } from "@/lib/money/money";
import { cn } from "@/lib/utils";

/** Alto del área de barras en px. */
const CHART_HEIGHT = 220;
const TICKS = 5;

export function TrendCard({ rows, month }: { rows: AggregateRow[]; month: string }) {
  const t = useTranslations("dashboard");
  const f = useFormat();
  const reduce = useReducedMotion();
  const first = useFirstView();
  const { displayCurrency } = useRate();
  const months = lastMonths(month, 6);
  const { points, partial } = trend(rows, months, displayCurrency);
  const peak = points.reduce(
    (m, p) => [p.income.amountMinor, p.expenses.amountMinor, m].reduce((a, b) => (b > a ? b : a)),
    0n,
  );
  const top = niceMax(peak);
  const scale = scaleOf(displayCurrency);
  /** Unidades enteras (no menores) para el eje y las etiquetas. */
  const units = (minor: bigint) => Number(minor) / Number(scale);
  const height = (m: Money) =>
    top > 0n ? Math.max(Number((m.amountMinor * 1000n) / top) / 10, m.amountMinor > 0n ? 1 : 0) : 0;
  const empty = peak === 0n;

  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-title2 text-ink">
          <Link href={`/transactions?month=${month}`} className="hover:underline">
            {t("trend")}
          </Link>
        </h2>
        <div className="text-callout text-ink-2 flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="bg-income-bar size-3 rounded-sm" />
            {t("income")}
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="bg-ember size-3 rounded-sm" />
            {t("expenses")}
          </span>
        </div>
      </div>

      <div className="flex gap-3">
        {/* Eje Y: 0 abajo, el máximo redondo arriba. */}
        <div
          aria-hidden
          className="text-footnote text-ink-3 flex flex-col-reverse justify-between text-right tabular-nums"
          style={{ height: CHART_HEIGHT }}
        >
          {Array.from({ length: TICKS + 1 }, (_, i) => (
            <span key={i} className="-my-2 leading-4">
              {f.compact(units((top * BigInt(i)) / BigInt(TICKS)))}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="border-divider relative grid grid-cols-6 gap-2 border-b"
            style={{ height: CHART_HEIGHT }}
          >
            {/* Líneas guía. */}
            {Array.from({ length: TICKS }, (_, i) => (
              <span
                key={i}
                aria-hidden
                className="border-divider pointer-events-none absolute inset-x-0 border-t"
                style={{ bottom: `${((i + 1) / TICKS) * 100}%` }}
              />
            ))}
            {points.map((p) => {
              const active = p.month === month;
              const label = t("trendLabel", {
                month: f.date(`${p.month}-01`, "monthYear"),
                income: f.money(p.income),
                expenses: f.money(p.expenses),
              });
              return (
                <Tooltip key={p.month} content={label}>
                  <div
                    role="img"
                    aria-label={label}
                    tabIndex={0}
                    className="relative flex h-full w-full items-end justify-center gap-1.5 rounded-sm"
                  >
                    {[
                      { value: p.income, cls: "bg-income-bar" },
                      { value: p.expenses, cls: "bg-ember" },
                    ].map((bar, i) => (
                      <div key={i} className="relative flex h-full max-w-10 flex-1 items-end">
                        {active && bar.value.amountMinor > 0n && (
                          <span
                            className="text-footnote text-ink absolute inset-x-0 text-center font-semibold whitespace-nowrap tabular-nums"
                            style={{ bottom: `calc(${height(bar.value)}% + 4px)` }}
                          >
                            {f.compact(units(bar.value.amountMinor))}
                          </span>
                        )}
                        <motion.div
                          className={cn("w-full origin-bottom rounded-t-md", bar.cls)}
                          style={{ height: `${height(bar.value)}%` }}
                          initial={reduce || !first ? false : { scaleY: 0 }}
                          animate={{ scaleY: 1 }}
                          transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
                        />
                      </div>
                    ))}
                  </div>
                </Tooltip>
              );
            })}
            {empty && (
              <p className="text-body text-ink-2 absolute inset-0 grid place-items-center">
                {t("trendEmpty")}
              </p>
            )}
          </div>
          <div className="mt-2 grid grid-cols-6 gap-2">
            {points.map((p) => (
              <span
                key={p.month}
                className={cn(
                  "text-callout text-center capitalize",
                  p.month === month ? "text-ink font-semibold" : "text-ink-2",
                )}
              >
                {f.date(`${p.month}-01`, "monthShort").replace(".", "")}
              </span>
            ))}
          </div>
        </div>
      </div>
      {partial && <p className="text-footnote text-ink-3">{t("partial")}</p>}
    </Card>
  );
}
