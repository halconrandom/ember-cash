/**
 * Simulador de pago de deudas (función pura, sin efectos).
 *
 * Métodos:
 * - "avalanche": el dinero extra va primero a la deuda de MAYOR tasa
 *   mensual (empate: menor saldo, luego id).
 * - "snowball": el dinero extra va primero a la deuda de MENOR saldo
 *   (empate: mayor tasa, luego id). El orden se recalcula cada mes.
 *
 * Presupuesto mensual (efecto "bola de nieve"): la suma de los pagos mínimos
 * de TODAS las deudas al inicio más el extra. Cuando una deuda se termina, su
 * mínimo no se deja de pagar: pasa a la siguiente deuda del orden.
 *
 * Cada mes, para cada deuda viva:
 *   1. Se suma el interés del mes:  interés = redondear(saldo × tasa mensual).
 *   2. Se paga su mínimo (o el saldo, si es menor).
 *   3. Lo que sobra del presupuesto va a la deuda que toca según el método,
 *      y si la termina, el resto pasa a la siguiente.
 *
 * Tasa mensual:
 *   - EA (efectiva anual):  r = (1 + EA)^(1/12) − 1
 *   - nominal anual:        r = nominal / 12
 *
 * Redondeo (documentado):
 *   - La tasa mensual se calcula en doble precisión y se guarda como entero
 *     escalado a 10^12 (12 decimales), redondeado al más cercano.
 *   - El interés de cada mes se redondea a la unidad menor de la moneda
 *     (peso o centavo), con las mitades lejos de cero (como convert()).
 *   - Todo lo demás es aritmética entera con bigint: no hay floats en los
 *     saldos.
 *
 * Calendario: los pagos ocurren desde el mes siguiente a `startMonth`; tras
 * n pagos la deuda queda libre en startMonth + n (p. ej. octubre de 2026 +
 * 19 = mayo de 2028).
 *
 * Nunca se paga: si en un mes el saldo total no baja (el presupuesto no
 * cubre los intereses), la simulación se detiene y devuelve
 * { ok: false, reason: "neverPaysOff" }. También hay un tope de meses
 * (maxMonths) para no entrar nunca en un bucle infinito.
 */
import { divRound } from "@/lib/money/convert";
import { shiftMonth } from "@/lib/transactions/dates";

export type PayoffMethod = "avalanche" | "snowball";
export type AprKind = "EA" | "nominal";

export type PayoffDebt = {
  id: string;
  /** Saldo actual en unidades menores (todas las deudas en la misma moneda). */
  balanceMinor: bigint;
  /** Tasa anual en puntos básicos (2850 = 28,50 %). */
  aprBps: number;
  aprKind: AprKind;
  minPaymentMinor: bigint;
};

export type PayoffInput = {
  debts: readonly PayoffDebt[];
  method: PayoffMethod;
  /** Pago extra mensual (opcional), en la misma moneda. */
  extraMinor?: bigint;
  /** Mes actual, AAAA-MM. */
  startMonth: string;
  /** Tope de meses simulados (por defecto 600 = 50 años). */
  maxMonths?: number;
};

export type MonthPoint = {
  /** Mes del pago (AAAA-MM). */
  month: string;
  /** Saldo de cada deuda después del pago. */
  balances: Record<string, bigint>;
  totalBalance: bigint;
  interest: bigint;
};

export type DebtPayoff = { id: string; payoffMonth: string; months: number; interest: bigint };

export type PayoffResult =
  | {
      ok: true;
      /** Mes en que queda libre de deudas. */
      debtFreeMonth: string;
      months: number;
      totalInterest: bigint;
      /** Por deuda, en el orden en que se terminan. */
      debts: DebtPayoff[];
      /** Serie mensual para la gráfica. */
      series: MonthPoint[];
    }
  | { ok: false; reason: "neverPaysOff"; months: number; totalInterest: bigint };

/** Escala de la tasa mensual: 12 decimales. */
export const RATE_SCALE = 10n ** 12n;

/** Tasa mensual escalada a 10^12 (ver la regla de redondeo arriba). */
export function monthlyRateScaled(aprBps: number, kind: AprKind): bigint {
  const annual = aprBps / 10_000;
  const r = kind === "EA" ? Math.pow(1 + annual, 1 / 12) - 1 : annual / 12;
  return BigInt(Math.round(r * 1e12));
}

/** Interés de un mes sobre `balance` con la tasa escalada. */
export function monthlyInterest(balance: bigint, rateScaled: bigint): bigint {
  return divRound(balance * rateScaled, RATE_SCALE);
}

export function simulatePayoff({
  debts,
  method,
  extraMinor = 0n,
  startMonth,
  maxMonths = 600,
}: PayoffInput): PayoffResult {
  const state = debts
    .filter((d) => d.balanceMinor > 0n)
    .map((d) => ({
      ...d,
      rate: monthlyRateScaled(d.aprBps, d.aprKind),
      balance: d.balanceMinor,
      interest: 0n,
    }));
  const budget = debts.reduce((sum, d) => sum + d.minPaymentMinor, 0n) + extraMinor;

  const payoffs: DebtPayoff[] = [];
  const series: MonthPoint[] = [];
  let totalInterest = 0n;

  for (let n = 1; state.some((d) => d.balance > 0n); n++) {
    if (n > maxMonths) return { ok: false, reason: "neverPaysOff", months: n - 1, totalInterest };
    const month = shiftMonth(startMonth, n);
    const alive = state.filter((d) => d.balance > 0n);
    const before = alive.reduce((s, d) => s + d.balance, 0n);

    // 1. Intereses del mes.
    let monthInterest = 0n;
    for (const d of alive) {
      const i = monthlyInterest(d.balance, d.rate);
      d.balance += i;
      d.interest += i;
      monthInterest += i;
    }
    totalInterest += monthInterest;

    // 2. Mínimos.
    let left = budget;
    for (const d of alive) {
      const pay = d.minPaymentMinor < d.balance ? d.minPaymentMinor : d.balance;
      const used = pay < left ? pay : left;
      d.balance -= used;
      left -= used;
    }

    // 3. El resto, según el método.
    const order = alive
      .filter((d) => d.balance > 0n)
      .sort((a, b) =>
        method === "avalanche"
          ? cmp(b.rate, a.rate) || cmp(a.balance, b.balance) || a.id.localeCompare(b.id)
          : cmp(a.balance, b.balance) || cmp(b.rate, a.rate) || a.id.localeCompare(b.id),
      );
    for (const d of order) {
      if (left <= 0n) break;
      const pay = d.balance < left ? d.balance : left;
      d.balance -= pay;
      left -= pay;
    }

    for (const d of alive) {
      if (d.balance === 0n)
        payoffs.push({ id: d.id, payoffMonth: month, months: n, interest: d.interest });
    }
    const after = state.reduce((s, d) => s + d.balance, 0n);
    series.push({
      month,
      balances: Object.fromEntries(state.map((d) => [d.id, d.balance])),
      totalBalance: after,
      interest: monthInterest,
    });

    // Si el saldo total no bajó, nunca se va a pagar.
    if (after >= before) return { ok: false, reason: "neverPaysOff", months: n, totalInterest };
  }

  if (series.length === 0) {
    return {
      ok: true,
      debtFreeMonth: startMonth,
      months: 0,
      totalInterest: 0n,
      debts: [],
      series: [],
    };
  }
  return {
    ok: true,
    debtFreeMonth: series.at(-1)!.month,
    months: series.length,
    totalInterest,
    debts: payoffs,
    series,
  };
}

function cmp(a: bigint, b: bigint): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Cuánto ahorra un pago extra: meses e interés frente al plan sin extra.
 * Null si alguno de los dos planes nunca termina.
 */
export function extraSavings(
  input: Omit<PayoffInput, "extraMinor">,
  extraMinor: bigint,
): { months: number; interest: bigint } | null {
  const base = simulatePayoff(input);
  const withExtra = simulatePayoff({ ...input, extraMinor });
  if (!base.ok || !withExtra.ok) return null;
  return {
    months: base.months - withExtra.months,
    interest: base.totalInterest - withExtra.totalInterest,
  };
}
