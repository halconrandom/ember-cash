// Tests de la lógica de transacciones: validación, agrupación por día y filtros.
import { describe, expect, it } from "vitest";

import { money } from "@/lib/money/money";

import { addDays, monthBounds, shiftMonth, todayIn } from "./dates";
import { dateRange, parseFilters, withFilters } from "./filters";
import { groupByDay } from "./group";
import { validateTransaction, type TransactionInput } from "./schema";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const base: TransactionInput = {
  id: null,
  kind: "expense",
  amount: "125.000",
  currency: "COP",
  categoryKey: "food",
  description: "Mercado",
  note: "",
  occurredOn: "2026-10-16",
  accountId: ACCOUNT,
  transferToAccountId: null,
  paidBy: null,
  repeat: "never",
};

describe("validación del formulario", () => {
  it("acepta un gasto válido y lo deja listo para guardar", () => {
    const r = validateTransaction(base, "es");
    expect(r).toEqual({
      ok: true,
      value: expect.objectContaining({
        amount: money(125000n, "COP"),
        categoryKey: "food",
        note: null,
      }),
    });
  });

  it("monto vacío o 0: 'Enter an amount greater than 0'", () => {
    expect(validateTransaction({ ...base, amount: "" }, "es")).toEqual({
      ok: false,
      errors: { amount: "amountPositive" },
    });
    expect(validateTransaction({ ...base, amount: "0" }, "es")).toEqual({
      ok: false,
      errors: { amount: "amountPositive" },
    });
  });

  it("USD con 3 decimales o COP con decimales no pasan", () => {
    expect(validateTransaction({ ...base, currency: "USD", amount: "1.999" }, "en")).toMatchObject({
      ok: false,
      errors: { amount: "amountTooManyDecimals" },
    });
    expect(validateTransaction({ ...base, amount: "12,5" }, "es")).toMatchObject({
      ok: false,
      errors: { amount: "amountTooManyDecimals" },
    });
  });

  it("exige descripción, cuenta, fecha y una categoría del tipo correcto", () => {
    const r = validateTransaction(
      { ...base, description: "  ", accountId: "", occurredOn: "", categoryKey: "salary" },
      "es",
    );
    expect(r).toEqual({
      ok: false,
      errors: {
        description: "descriptionRequired",
        accountId: "accountRequired",
        occurredOn: "dateRequired",
        categoryKey: "categoryRequired",
      },
    });
    expect(validateTransaction({ ...base, kind: "income", categoryKey: "salary" }, "es").ok).toBe(
      true,
    );
  });

  it("transferencia: cuenta destino distinta, sin categoría ni pagador", () => {
    const transfer = { ...base, kind: "transfer" as const, categoryKey: "food", paidBy: OTHER };
    expect(validateTransaction(transfer, "es")).toEqual({
      ok: false,
      errors: { transferToAccountId: "transferToRequired" },
    });
    expect(validateTransaction({ ...transfer, transferToAccountId: ACCOUNT }, "es")).toEqual({
      ok: false,
      errors: { transferToAccountId: "transferSameAccount" },
    });
    const ok = validateTransaction({ ...transfer, transferToAccountId: OTHER }, "es");
    expect(ok).toMatchObject({
      ok: true,
      value: { categoryKey: null, paidBy: null, transferToAccountId: OTHER },
    });
  });

  it("rechaza datos con forma inválida", () => {
    expect(validateTransaction({ nope: true }, "es").ok).toBe(false);
  });
});

describe("agrupación por día", () => {
  const rows = [
    { id: "a", occurredOn: "2026-10-16" },
    { id: "b", occurredOn: "2026-10-14" },
    { id: "c", occurredOn: "2026-10-16" },
    { id: "d", occurredOn: "2026-10-15" },
    { id: "e", occurredOn: "2025-12-31" },
  ];

  it("ordena del más reciente al más antiguo y marca hoy y ayer", () => {
    const groups = groupByDay(rows, "2026-10-16", "en");
    expect(groups.map((g) => g.date)).toEqual([
      "2026-10-16",
      "2026-10-15",
      "2026-10-14",
      "2025-12-31",
    ]);
    expect(groups.map((g) => g.relative)).toEqual(["today", "yesterday", null, null]);
    expect(groups[0].items.map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("etiquetas como en el frame, en cada idioma", () => {
    const [today, , wednesday, old] = groupByDay(rows, "2026-10-16", "en");
    expect([today.weekday, today.shortDate]).toEqual(["Friday", "Oct 16"]);
    expect([wednesday.weekday, wednesday.shortDate]).toEqual(["Wednesday", "Oct 14"]);
    expect(old.shortDate).toBe("Dec 31, 2025");
    const [hoy] = groupByDay(rows, "2026-10-16", "es");
    expect(hoy.weekday).toBe("viernes");
  });

  it("sin filas no hay grupos", () => {
    expect(groupByDay([], "2026-10-16", "es")).toEqual([]);
  });
});

describe("filtros", () => {
  const today = "2026-10-16";

  it("valores por defecto: este mes, todo, página 1", () => {
    expect(parseFilters({}, today)).toEqual({
      q: "",
      category: "all",
      account: "all",
      currency: "all",
      type: "all",
      range: "month",
      from: null,
      to: null,
      month: "2026-10",
      page: 1,
    });
  });

  it("lee filtros válidos y descarta los raros", () => {
    const f = parseFilters(
      {
        q: " café ",
        category: "food",
        account: ACCOUNT,
        currency: "USD",
        type: "expense",
        month: "2026-09",
        page: "3",
      },
      today,
    );
    expect(f).toMatchObject({
      q: "café",
      category: "food",
      account: ACCOUNT,
      currency: "USD",
      type: "expense",
      month: "2026-09",
      page: 3,
    });
    expect(
      parseFilters(
        { category: "hack", account: "1; drop", currency: "EUR", page: "-2", month: "2026-13" },
        today,
      ),
    ).toMatchObject({
      category: "all",
      account: "all",
      currency: "all",
      page: 1,
      month: "2026-10",
    });
  });

  it("calcula el rango de fechas", () => {
    expect(dateRange(parseFilters({ month: "2026-02" }, today), today)).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    });
    expect(dateRange(parseFilters({ range: "last30" }, today), today)).toEqual({
      from: "2026-09-17",
      to: today,
    });
    expect(dateRange(parseFilters({ range: "year" }, today), today)).toEqual({
      from: "2026-01-01",
      to: "2026-12-31",
    });
    expect(dateRange(parseFilters({ range: "all" }, today), today)).toEqual({
      from: null,
      to: null,
    });
    expect(
      dateRange(
        parseFilters({ range: "custom", from: "2026-10-10", to: "2026-10-01" }, today),
        today,
      ),
    ).toEqual({
      from: "2026-10-01",
      to: "2026-10-10",
    });
    // Personalizado sin fechas vuelve a este mes.
    expect(parseFilters({ range: "custom", from: "2026-10-10" }, today).range).toBe("month");
  });

  it("al cambiar un filtro vuelve a la página 1 y no escribe defectos", () => {
    const current = new URLSearchParams("page=3&type=income&tx=new");
    expect(withFilters(current, { category: "food" })).toBe("?type=income&tx=new&category=food");
    expect(withFilters(current, { type: "all" })).toBe("?tx=new");
    expect(withFilters(current, { page: "4" })).toBe("?page=4&type=income&tx=new");
    expect(withFilters(current, { tx: null })).toBe("?page=3&type=income");
  });
});

describe("fechas", () => {
  it("hoy en Bogotá aunque en UTC ya sea mañana", () => {
    expect(todayIn("America/Bogota", new Date("2026-10-17T03:00:00Z"))).toBe("2026-10-16");
  });

  it("meses y días", () => {
    expect(monthBounds("2024-02")).toEqual({ from: "2024-02-01", to: "2024-02-29" });
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});
