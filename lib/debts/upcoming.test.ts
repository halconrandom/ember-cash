import { describe, expect, it } from "vitest";

import { money } from "@/lib/money/money";

import { upcomingDebts, type DebtLike } from "./upcoming";

const debt = (
  id: string,
  dueDay: number | null,
  paidMonths: string[] = [],
  balance = 100n,
): DebtLike => ({
  id,
  name: id,
  iconKey: "credit-card",
  original: money(1_000n, "COP"),
  paid: money(1_000n - balance, "COP"),
  balance: money(balance, "COP"),
  dueDay,
  paidMonths,
});

describe("upcomingDebts", () => {
  const today = "2026-10-25";

  it("ordena por próximo vencimiento sin saldar y corta en 3", () => {
    const list = upcomingDebts(
      [
        debt("sin-dia", null),
        debt("nov", 25, ["2026-10"]),
        debt("hoy", 25),
        debt("28", 28),
        debt("2", 2),
      ],
      today,
    );
    expect(list.map((d) => d.id)).toEqual(["hoy", "28", "2"]);
    expect(list[0].dueState).toMatchObject({ tone: "today", paidThisCycle: false });
    expect(list[1].dueState?.tone).toBe("soon");
  });

  it("pagado este mes: pasa al siguiente con paidThisCycle", () => {
    const [d] = upcomingDebts([debt("nov", 25, ["2026-10"])], today);
    expect(d.dueState).toEqual({ due: "2026-11-25", paidThisCycle: true, tone: "later" });
  });

  it("porcentaje pagado con el pago inicial y sin las saldadas", () => {
    const list = upcomingDebts([debt("a", 5, [], 250n), debt("pagada", 5, [], 0n)], today);
    expect(list).toHaveLength(1);
    expect(list[0].percent).toBe(75);
    expect(list[0].dueState).toBeTruthy();
  });

  it("sin día de pago: sin estado, al final", () => {
    expect(upcomingDebts([debt("x", null)], today)[0].dueState).toBeNull();
  });
});
