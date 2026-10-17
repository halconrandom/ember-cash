// Test del pago extra sugerido (valores de 04-debts.png).
import { describe, expect, it } from "vitest";

import { money } from "@/lib/money/money";

import { suggestedExtra } from "./extra";

describe("suggestedExtra", () => {
  it("15 % de los mínimos, hacia arriba a una cifra significativa", () => {
    expect(suggestedExtra(money(1_230_000n, "COP"))).toEqual(money(200_000n, "COP"));
    expect(suggestedExtra(money(30_750n, "USD"))).toEqual(money(5_000n, "USD"));
    expect(suggestedExtra(money(1_000_000n, "COP"))).toEqual(money(200_000n, "COP"));
  });

  it("nunca menos de una unidad mayor", () => {
    expect(suggestedExtra(money(0n, "COP"))).toEqual(money(1n, "COP"));
    expect(suggestedExtra(money(100n, "USD"))).toEqual(money(100n, "USD"));
  });
});
