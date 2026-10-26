import { describe, expect, it } from "vitest";

import { debtDueState } from "./dates";

describe("debtDueState", () => {
  it("sin pagar y vence hoy: 'today' (ámbar), no rojo", () => {
    expect(debtDueState(25, "2026-10-25", [])).toEqual({
      due: "2026-10-25",
      paidThisCycle: false,
      tone: "today",
    });
  });

  it("pagado este mes: pasa al vencimiento siguiente", () => {
    expect(debtDueState(25, "2026-10-25", ["2026-10"])).toEqual({
      due: "2026-11-25",
      paidThisCycle: true,
      tone: "later",
    });
  });

  it("dentro de 10 días sin pagar: 'soon'", () => {
    expect(debtDueState(30, "2026-10-25", []).tone).toBe("soon");
  });

  it("un pago de un mes viejo no salta el de este mes", () => {
    expect(debtDueState(25, "2026-10-20", ["2026-09"])).toMatchObject({
      due: "2026-10-25",
      paidThisCycle: false,
    });
  });

  it("día 31 en un mes corto, ya pagado", () => {
    expect(debtDueState(31, "2027-01-31", ["2027-01"]).due).toBe("2027-02-28");
  });
});
