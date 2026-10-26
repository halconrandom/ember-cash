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

  it("tarjeta Banco de Bogotá con principal fijado: 4.700.000 y saldo 4.214.351", () => {
    const r = debtBalances({ originalMinor: 4_700_000n, paidMinor: 0n, cardDebtMinor: 4_214_351n });
    expect(r).toEqual({
      originalMinor: 4_700_000n,
      paidMinor: 485_649n,
      balanceMinor: 4_214_351n,
    });
    expect(Number((r.paidMinor * 100n) / r.originalMinor)).toBe(10);
  });

  it("sin principal fijado: original = saldo + pagos registrados", () => {
    // Saldo 4.167.943; luego un pago de 500.000 (transferencia a la tarjeta).
    expect(
      debtBalances({ originalMinor: 9n, paidMinor: 500_000n, cardDebtMinor: 3_667_943n }),
    ).toEqual({ originalMinor: 4_167_943n, paidMinor: 500_000n, balanceMinor: 3_667_943n });
  });

  it("compras que superan el principal fijado: el original sube, pagado no es negativo", () => {
    expect(
      debtBalances({ originalMinor: 4_700_000n, paidMinor: 100_000n, cardDebtMinor: 4_800_000n }),
    ).toEqual({ originalMinor: 4_900_000n, paidMinor: 100_000n, balanceMinor: 4_800_000n });
    expect(
      debtBalances({ originalMinor: 4_700_000n, paidMinor: 0n, cardDebtMinor: 5_000_000n }),
    ).toEqual({ originalMinor: 5_000_000n, paidMinor: 0n, balanceMinor: 5_000_000n });
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
    // Con principal fijado y tarjeta en 0: 100 % pagado.
    expect(
      debtBalances({ originalMinor: 4_700_000n, paidMinor: 0n, cardDebtMinor: 0n }).paidMinor,
    ).toBe(4_700_000n);
  });
});
