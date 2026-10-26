// Tests de transferPerspective: signo de una transferencia vista desde una cuenta.
import { describe, expect, it } from "vitest";

import { transferPerspective } from "./perspective";

const payment = { kind: "transfer", account: { id: "bank" }, transferTo: { id: "card" } };

describe("transferPerspective", () => {
  it("vista de la tarjeta (destino): entra", () => {
    expect(transferPerspective(payment, "card")).toBe("in");
  });
  it("vista del banco (origen): sale", () => {
    expect(transferPerspective(payment, "bank")).toBe("out");
  });
  it("sin filtro de cuenta: signo normal", () => {
    expect(transferPerspective(payment, null)).toBeNull();
  });
  it("gasto filtrado por cuenta: signo normal", () => {
    expect(
      transferPerspective({ kind: "expense", account: { id: "bank" }, transferTo: null }, "bank"),
    ).toBeNull();
  });
});
