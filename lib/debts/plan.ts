/**
 * Plan de pago de /debts: qué deudas entran en la simulación y los ticks del
 * eje de la gráfica (payoff-timeline).
 */
import type { PayoffDebt, PayoffInput, PayoffMethod } from "./payoff";

/** Deuda ya convertida a la moneda elegida, con su marca de fuera del plan. */
export type PlanCandidate = PayoffDebt & { excludeFromPlan: boolean };

/**
 * Entrada de simulatePayoff / extraSavings solo con las deudas del plan
 * (sin las marcadas como exclude_from_plan, 0030).
 */
export function planInput(
  debts: readonly PlanCandidate[],
  method: PayoffMethod,
  startMonth: string,
): Omit<PayoffInput, "extraMinor"> {
  return {
    debts: debts
      .filter((d) => !d.excludeFromPlan)
      .map((d) => ({
        id: d.id,
        balanceMinor: d.balanceMinor,
        aprBps: d.aprBps,
        aprKind: d.aprKind,
        minPaymentMinor: d.minPaymentMinor,
      })),
    method,
    startMonth,
  };
}

/** Pasos posibles del eje, en meses. */
const STEPS = [1, 3, 6, 12, 24, 36, 60, 120, 240] as const;
/** Máximo de etiquetas en el eje (caben en móvil sin montarse). */
export const MAX_TICKS = 5;

export type Axis = {
  /** Largo del eje en meses (múltiplo del paso, al menos `months`). */
  axisMonths: number;
  /** Meses desde el inicio donde va cada etiqueta (incluye 0 y axisMonths). */
  ticks: number[];
  /** Paso en meses entre etiquetas. */
  step: number;
  /** Paso de un año o más: la etiqueta puede ser solo el año. */
  yearly: boolean;
};

/**
 * Ticks del eje para un plan de `months` meses: el paso más chico de STEPS
 * que deja a lo sumo MAX_TICKS etiquetas. Mínimo 12 meses de eje.
 */
export function axisTicks(months: number): Axis {
  const span = Math.max(12, Math.ceil(months));
  const step =
    STEPS.find((s) => Math.ceil(span / s) + 1 <= MAX_TICKS) ??
    STEPS[STEPS.length - 1] * Math.ceil(span / (STEPS[STEPS.length - 1] * (MAX_TICKS - 1)));
  const count = Math.ceil(span / step);
  return {
    axisMonths: count * step,
    ticks: Array.from({ length: count + 1 }, (_, i) => i * step),
    step,
    yearly: step >= 12,
  };
}
