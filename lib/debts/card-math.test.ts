import { describe, expect, it } from "vitest";

import { debtBalances } from "./card-math";

describe("debtBalances", () => {
  it("deuda normal: original − pagado", () => {
    expect(debtBalances({ originalMinor: 1000n, paidMinor: 300n, cardDebtMinor: null })).toEqual({
      originalMinor: 1000n,
      paidMinor: 300n,
      balanceMinor: 700n,
    });
  });

  it("tarjeta Banco de Bogotá: el saldo es la deuda de la tarjeta, una sola vez", () => {
    // Saldo 4.167.943; luego un pago de 500.000 (transferencia a la tarjeta).
    expect(
      debtBalances({ originalMinor: 9n, paidMinor: 500_000n, cardDebtMinor: 3_667_943n }),
    ).toEqual({ originalMinor: 4_167_943n, paidMinor: 500_000n, balanceMinor: 3_667_943n });
  });

  it("compras nuevas en la tarjeta suben el saldo y el original, no el pagado", () => {
    expect(
      debtBalances({ originalMinor: 0n, paidMinor: 500_000n, cardDebtMinor: 3_767_943n })
        .balanceMinor,
    ).toBe(3_767_943n);
  });

  it("tarjeta con saldo a favor: saldo 0", () => {
    expect(debtBalances({ originalMinor: 1n, paidMinor: 10n, cardDebtMinor: -5n })).toEqual({
      originalMinor: 10n,
      paidMinor: 10n,
      balanceMinor: 0n,
    });
  });
});
