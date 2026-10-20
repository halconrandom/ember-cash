/**
 * Balance entre los miembros de un hogar (quién debe a quién).
 *
 * Para cada gasto compartido (un ingreso compartido cuenta al revés):
 *   - quien pagó suma el monto pagado,
 *   - cada miembro resta su parte (transaction_splits).
 * Para cada liquidación (settlements), quien paga (from) suma y quien recibe
 * (to) resta: la deuda entre ellos baja en ese monto.
 * El neto de un miembro es positivo si le deben y negativo si debe. La suma
 * de todos los netos de una moneda es siempre 0.
 *
 * Se lleva por moneda (COP, USD y EUR por separado) para que liquidar cada
 * moneda deje exactamente 0, sin depender de la tasa. Para mostrar un total
 * se convierte cada neto con la tasa más reciente de su par (convert, mismo
 * redondeo); con 3 monedas puede hacer falta más de una tasa a la vez.
 */
import type { CurrencyCode } from "@/lib/db/types";
import { convert, latestRateFor, type Rate } from "@/lib/money/convert";
import { add, money, type Money } from "@/lib/money/money";

export type SharedExpense = {
  paidBy: string;
  /**
   * Ingreso compartido: quien lo recibió le debe a cada miembro su parte
   * (los signos se invierten).
   */
  income?: boolean;
  amount: Money;
  splits: readonly { userId: string; share: Money }[];
};

export type SettlementRecord = { fromUser: string; toUser: string; amount: Money };

/** Netos por moneda y por miembro, en unidades menores. */
export type CurrencyBalances = Partial<Record<CurrencyCode, Record<string, bigint>>>;

/** Una transferencia que deja a dos miembros a paz y salvo. */
export type Transfer = { from: string; to: string; amount: Money };

function bump(b: CurrencyBalances, currency: CurrencyCode, user: string, delta: bigint) {
  const byUser = (b[currency] ??= {});
  byUser[user] = (byUser[user] ?? 0n) + delta;
}

export function balancesByCurrency(
  expenses: readonly SharedExpense[],
  settlements: readonly SettlementRecord[] = [],
): CurrencyBalances {
  const b: CurrencyBalances = {};
  for (const e of expenses) {
    const sign = e.income ? -1n : 1n;
    bump(b, e.amount.currency, e.paidBy, sign * e.amount.amountMinor);
    for (const s of e.splits) bump(b, s.share.currency, s.userId, -sign * s.share.amountMinor);
  }
  for (const s of settlements) {
    bump(b, s.amount.currency, s.fromUser, s.amount.amountMinor);
    bump(b, s.amount.currency, s.toUser, -s.amount.amountMinor);
  }
  return b;
}

/**
 * Neto de cada miembro en una sola moneda. Devuelve null si hace falta una
 * tasa (para alguna moneda con saldo distinto de 0) y no la hay.
 */
export function netsIn(
  balances: CurrencyBalances,
  members: readonly string[],
  to: CurrencyCode,
  rates: readonly Rate[],
): Record<string, Money> | null {
  const out: Record<string, Money> = Object.fromEntries(members.map((m) => [m, money(0n, to)]));
  for (const [currency, byUser] of Object.entries(balances) as [
    CurrencyCode,
    Record<string, bigint>,
  ][]) {
    const rate = currency === to ? null : latestRateFor(rates, currency, to);
    if (currency !== to && !rate) {
      if (Object.values(byUser).some((v) => v !== 0n)) return null;
      continue;
    }
    for (const [user, minor] of Object.entries(byUser)) {
      const value = currency === to ? money(minor, to) : convert(money(minor, currency), to, rate!);
      out[user] = add(out[user] ?? money(0n, to), value);
    }
  }
  return out;
}

/**
 * Transferencias mínimas para que todos queden en 0: el que más debe le paga
 * al que más le deben, hasta agotar. Con dos miembros es una sola.
 */
export function transfersFor(nets: Record<string, Money>): Transfer[] {
  const entries = Object.entries(nets);
  if (entries.length === 0) return [];
  const currency = entries[0][1].currency;
  const debtors = entries
    .filter(([, m]) => m.amountMinor < 0n)
    .map(([u, m]) => ({ u, v: -m.amountMinor }));
  const creditors = entries
    .filter(([, m]) => m.amountMinor > 0n)
    .map(([u, m]) => ({ u, v: m.amountMinor }));
  debtors.sort((a, b) => (b.v > a.v ? 1 : b.v < a.v ? -1 : a.u.localeCompare(b.u)));
  creditors.sort((a, b) => (b.v > a.v ? 1 : b.v < a.v ? -1 : a.u.localeCompare(b.u)));

  const out: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = debtors[i].v < creditors[j].v ? debtors[i].v : creditors[j].v;
    out.push({ from: debtors[i].u, to: creditors[j].u, amount: money(pay, currency) });
    debtors[i].v -= pay;
    creditors[j].v -= pay;
    if (debtors[i].v === 0n) i++;
    if (creditors[j].v === 0n) j++;
  }
  return out;
}

/**
 * Liquidación total y exacta: las transferencias de cada moneda por separado.
 * Registrarlas deja todos los netos en 0, sin depender de la tasa.
 */
export function fullSettlement(balances: CurrencyBalances): Transfer[] {
  return (Object.entries(balances) as [CurrencyCode, Record<string, bigint>][]).flatMap(
    ([currency, byUser]) =>
      transfersFor(
        Object.fromEntries(Object.entries(byUser).map(([u, v]) => [u, money(v, currency)])),
      ),
  );
}

/** ¿Están todos a paz y salvo en todas las monedas? */
export function isSettled(balances: CurrencyBalances): boolean {
  return Object.values(balances).every((byUser) =>
    Object.values(byUser ?? {}).every((v) => v === 0n),
  );
}
