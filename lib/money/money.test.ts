// Tests de lib/money: operaciones, formato, parseo y conversión.
import { describe, expect, it } from "vitest";

import { convert, divRound, isStale, parseRate, totalIn, type Rate } from "./convert";
import { formatAmount, formatMoney } from "./format";
import { add, compare, equals, money, negate, subtract, sum, toDbAmount } from "./money";
import { parseMoney } from "./parse";

const NBSP = " ";
/** Tasa de ejemplo de la spec: 1 USD = 4.000 COP. */
const RATE: Rate = {
  base: "USD",
  quote: "COP",
  rate: "4000",
  asOf: "2026-10-16",
  fetchedAt: "2026-10-16T13:00:00Z",
  source: "test",
};
/** TRM real del 17 de octubre de 2026. */
const TRM: Rate = { ...RATE, rate: "3174.67", asOf: "2026-10-17" };

describe("operaciones", () => {
  it("suma, resta, compara y niega sin floats", () => {
    expect(add(money(1n, "USD"), money(2n, "USD"))).toEqual(money(3n, "USD"));
    expect(subtract(money(100n, "COP"), money(250n, "COP"))).toEqual(money(-150n, "COP"));
    expect(compare(money(5n, "COP"), money(7n, "COP"))).toBe(-1);
    expect(compare(money(7n, "COP"), money(7n, "COP"))).toBe(0);
    expect(negate(money(5n, "USD"))).toEqual(money(-5n, "USD"));
    expect(sum([], "COP")).toEqual(money(0n, "COP"));
    expect(sum([money(1n, "COP"), money(2n, "COP")], "COP")).toEqual(money(3n, "COP"));
  });

  it("no mezcla monedas sin convertir", () => {
    expect(() => add(money(1n, "USD"), money(1n, "COP"))).toThrow(TypeError);
    expect(equals(money(1n, "USD"), money(1n, "COP"))).toBe(false);
  });

  it("12 dígitos y más sin perder precisión", () => {
    const big = money(999_999_999_999n, "COP");
    expect(add(big, money(1n, "COP")).amountMinor).toBe(1_000_000_000_000n);
    expect(toDbAmount(money(123_456_789_012_345n, "COP"))).toBe("123456789012345");
    expect(() => money(2 ** 53, "COP")).toThrow(RangeError);
  });
});

describe("formato", () => {
  it("0 y 1 en cada moneda", () => {
    expect(formatMoney(money(0n, "COP"), "es")).toBe(`0${NBSP}COP`);
    expect(formatMoney(money(0n, "USD"), "en")).toBe(`US$${NBSP}0.00`);
    expect(formatMoney(money(1n, "COP"), "en")).toBe(`1${NBSP}COP`);
    expect(formatMoney(money(1n, "USD"), "en")).toBe(`US$${NBSP}0.01`);
  });

  it("COP sin decimales y USD con 2, separadores según el idioma", () => {
    expect(formatMoney(money(125000n, "COP"), "es")).toBe(`125.000${NBSP}COP`);
    expect(formatMoney(money(125000n, "COP"), "en")).toBe(`125,000${NBSP}COP`);
    expect(formatMoney(money(1599n, "USD"), "es")).toBe(`US$${NBSP}15,99`);
    expect(formatMoney(money(1599n, "USD"), "en")).toBe(`US$${NBSP}15.99`);
    expect(formatMoney(money(3125n, "USD"), "en", { unit: "code" })).toBe(`31.25${NBSP}USD`);
  });

  it("12 dígitos, negativos y aproximados", () => {
    expect(formatMoney(money(999_999_999_999n, "COP"), "es")).toBe(`999.999.999.999${NBSP}COP`);
    expect(formatMoney(money(123_456_789_012_34n, "USD"), "en")).toBe(
      `US$${NBSP}123,456,789,012.34`,
    );
    expect(formatMoney(money(-18500n, "COP"), "en")).toBe(`-18,500${NBSP}COP`);
    expect(formatMoney(money(-1599n, "USD"), "en")).toBe(`-US$${NBSP}15.99`);
    expect(formatMoney(money(230000n, "USD"), "en", { approx: true })).toBe(
      `≈${NBSP}US$${NBSP}2,300.00`,
    );
    expect(formatAmount(money(-5n, "USD"), "es")).toBe("-0,05");
  });
});

describe("parseo", () => {
  const ok = (v: bigint, c: "COP" | "USD") => ({ ok: true, value: money(v, c) });

  it("lee montos con los separadores del idioma", () => {
    expect(parseMoney("125.000", "COP", "es")).toEqual(ok(125000n, "COP"));
    expect(parseMoney("125,000", "COP", "en")).toEqual(ok(125000n, "COP"));
    expect(parseMoney("15,99", "USD", "es")).toEqual(ok(1599n, "USD"));
    expect(parseMoney("US$ 1,234.5", "USD", "en")).toEqual(ok(123450n, "USD"));
    expect(parseMoney("31.25 USD", "USD", "en")).toEqual(ok(3125n, "USD"));
    expect(parseMoney("1", "USD", "en")).toEqual(ok(100n, "USD"));
  });

  it("tolera el otro separador cuando solo puede ser decimal", () => {
    expect(parseMoney("15.99", "USD", "es")).toEqual(ok(1599n, "USD"));
    // "1.234" en es son mil doscientos treinta y cuatro (grupo de 3 cifras).
    expect(parseMoney("1.234", "COP", "es")).toEqual(ok(1234n, "COP"));
  });

  it("rechaza lo que no es un monto válido", () => {
    expect(parseMoney("", "COP", "es")).toEqual({ ok: false, error: "empty" });
    expect(parseMoney("abc", "COP", "es")).toEqual({ ok: false, error: "invalid" });
    expect(parseMoney("1.23.4", "COP", "es")).toEqual({ ok: false, error: "invalid" });
    expect(parseMoney("12,5", "COP", "es")).toEqual({ ok: false, error: "tooManyDecimals" });
    expect(parseMoney("1.999", "USD", "en")).toEqual({ ok: false, error: "tooManyDecimals" });
    expect(parseMoney("0", "COP", "es")).toEqual({ ok: false, error: "notPositive" });
    expect(parseMoney("-5", "COP", "es")).toEqual({ ok: false, error: "notPositive" });
    expect(parseMoney("1234567890123456", "COP", "es")).toEqual({ ok: false, error: "tooLarge" });
  });

  it("acepta 0 y negativos solo si se pide", () => {
    expect(parseMoney("0", "COP", "es", { allowZero: true })).toEqual(ok(0n, "COP"));
    expect(parseMoney("-18.500", "COP", "es", { allowNegative: true })).toEqual(ok(-18500n, "COP"));
  });

  it("ida y vuelta: formatear y volver a leer da el mismo importe", () => {
    for (const locale of ["es", "en"] as const) {
      for (const m of [
        money(1n, "USD"),
        money(1599n, "USD"),
        money(999_999_999_999n, "COP"),
        money(84000n, "USD"),
      ]) {
        expect(parseMoney(formatMoney(m, locale), m.currency, locale)).toEqual({
          ok: true,
          value: m,
        });
      }
    }
  });
});

describe("conversión", () => {
  it("convierte con la tasa en los dos sentidos", () => {
    expect(convert(money(2160n, "USD"), "COP", RATE)).toEqual(money(86400n, "COP"));
    expect(convert(money(86400n, "COP"), "USD", RATE)).toEqual(money(2160n, "USD"));
    expect(convert(money(5n, "COP"), "COP", RATE)).toEqual(money(5n, "COP"));
  });

  it("redondeo en USD: mitades lejos de cero", () => {
    // 20 COP / 4000 = 0,005 USD → 0,01 (la mitad sube); 19 COP → 0,00475 → 0,00
    expect(convert(money(20n, "COP"), "USD", RATE)).toEqual(money(1n, "USD"));
    expect(convert(money(19n, "COP"), "USD", RATE)).toEqual(money(0n, "USD"));
    expect(convert(money(-20n, "COP"), "USD", RATE)).toEqual(money(-1n, "USD"));
  });

  it("redondeo en COP con la TRM real", () => {
    // US$ 15,99 × 3174,67 = 50.762,9733 → 50.763 COP
    expect(convert(money(1599n, "USD"), "COP", TRM)).toEqual(money(50763n, "COP"));
    // US$ 0,01 × 3174,67 = 31,7467 → 32 COP
    expect(convert(money(1n, "USD"), "COP", TRM)).toEqual(money(32n, "COP"));
    expect(divRound(5n, 2n)).toBe(3n);
    expect(divRound(-5n, 2n)).toBe(-3n);
    expect(divRound(4n, 3n)).toBe(1n);
  });

  it("0, 1 y 12 dígitos", () => {
    expect(convert(money(0n, "USD"), "COP", TRM)).toEqual(money(0n, "COP"));
    expect(convert(money(1n, "COP"), "USD", RATE)).toEqual(money(0n, "USD"));
    expect(convert(money(999_999_999_999n, "COP"), "USD", RATE)).toEqual(
      money(25_000_000_000n, "USD"),
    );
  });

  it("ida y vuelta USD→COP→USD vuelve al mismo importe", () => {
    for (const cents of [1n, 99n, 1599n, 84000n, 123_456_789n]) {
      const usd = money(cents, "USD");
      expect(convert(convert(usd, "COP", TRM), "USD", TRM)).toEqual(usd);
    }
  });

  it("los totales suman por moneda y convierten una vez", () => {
    const total = totalIn(
      [money(1599n, "USD"), money(1n, "USD"), money(100000n, "COP")],
      "COP",
      RATE,
    );
    expect(total).toEqual(money(64000n + 100000n, "COP"));
  });

  it("rechaza tasas inválidas o que no sirven para el par", () => {
    expect(() => parseRate("0")).toThrow(RangeError);
    expect(() => parseRate("-1")).toThrow(RangeError);
    expect(() => convert(money(1n, "USD"), "COP", { ...RATE, base: "COP", quote: "COP" })).toThrow(
      TypeError,
    );
  });

  it("una tasa tiene más de 24 h: stale", () => {
    const now = new Date("2026-10-17T13:00:01Z").getTime();
    expect(isStale({ fetchedAt: "2026-10-16T13:00:00Z" }, now)).toBe(true);
    expect(isStale({ fetchedAt: "2026-10-16T13:00:02Z" }, now)).toBe(false);
  });
});
