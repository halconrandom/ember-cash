/**
 * Saldo de una deuda enlazada a una tarjeta (0031). La fuente de verdad es
 * la cuenta: saldo = deuda de la tarjeta (account_balance, nunca negativo);
 * pagado = capital de los pagos registrados desde la app (transferencias a
 * la tarjeta) solo como piso. Para medir el avance real:
 *   original = max(principal guardado, saldo + pagos registrados)
 *   pagado   = original − saldo
 * El principal guardado es el que fija la persona al editar la deuda (p. ej.
 * el cupo, o la deuda con la que empezó); si no fijó nada, es el saldo al
 * enlazar y crece con las compras. Así pagado nunca es negativo y el % queda
 * entre 0 y 100. Una deuda sin tarjeta sigue con original − pagado.
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
  const floor = balance + paidMinor;
  const original = originalMinor > floor ? originalMinor : floor;
  return { originalMinor: original, paidMinor: original - balance, balanceMinor: balance };
}
