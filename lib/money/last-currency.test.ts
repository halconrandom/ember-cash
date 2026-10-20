// @vitest-environment jsdom
// Tests de lib/money/last-currency: orden de <CurrencyPicker> (recientes
// primero, luego alfabético) y el almacenamiento de monedas recientes.
import { beforeEach, describe, expect, it } from "vitest";

import {
  orderCurrencyOptions,
  readRecentCurrencies,
  recordRecentCurrency,
} from "./last-currency";

beforeEach(() => {
  localStorage.clear();
});

describe("orderCurrencyOptions", () => {
  it("sin recientes, alfabético", () => {
    expect(orderCurrencyOptions(["USD", "COP", "EUR"], [])).toEqual(["COP", "EUR", "USD"]);
  });

  it("las recientes van primero, en orden de uso; el resto, alfabético", () => {
    expect(orderCurrencyOptions(["COP", "USD", "EUR", "ARS", "MXN"], ["MXN", "COP"])).toEqual([
      "MXN",
      "COP",
      "ARS",
      "EUR",
      "USD",
    ]);
  });

  it("ignora una reciente que ya no está habilitada", () => {
    expect(orderCurrencyOptions(["COP", "USD"], ["EUR", "USD"])).toEqual(["USD", "COP"]);
  });
});

describe("recordRecentCurrency / readRecentCurrencies", () => {
  it("guarda la más reciente primero, sin repetir, hasta 3", () => {
    recordRecentCurrency("COP");
    recordRecentCurrency("USD");
    recordRecentCurrency("EUR");
    recordRecentCurrency("ARS");
    expect(readRecentCurrencies()).toEqual(["ARS", "EUR", "USD"]);
  });

  it("volver a elegir una ya reciente la sube al frente", () => {
    recordRecentCurrency("COP");
    recordRecentCurrency("USD");
    recordRecentCurrency("COP");
    expect(readRecentCurrencies()).toEqual(["COP", "USD"]);
  });

  it("sin nada guardado, lista vacía", () => {
    expect(readRecentCurrencies()).toEqual([]);
  });
});
