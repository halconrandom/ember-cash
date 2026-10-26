/**
 * Saldo de una deuda enlazada a una tarjeta (0031). La fuente de verdad es
 * la cuenta: saldo = deuda de la tarjeta (account_balance, nunca negativo);
 * pagado = capital de los pagos registrados desde la app (transferencias a
 * la tarjeta); original = saldo + pagado. Una deuda sin tarjeta sigue con
 * original − pagado.
 */
export function debtBalances(input: {
  originalMinor: bigint;
  paidMinor: bigint;
  /** Deuda de la tarjeta enlazada, o null si la deuda no tiene tarjeta. */
  cardDebtMinor: bigint | null;
}): { originalMinor: bigint; paidMinor: bigint; balanceMinor: bigint } {
  const { originalMinor, paidMinor, cardDebtMinor } = input;
  if (cardDebtMinor === null) {
    const balance = originalMinor - paidMinor;
    return { originalMinor, paidMinor, balanceMinor: balance > 0n ? balance : 0n };
  }
  const balance = cardDebtMinor > 0n ? cardDebtMinor : 0n;
  return { originalMinor: balance + paidMinor, paidMinor, balanceMinor: balance };
}
