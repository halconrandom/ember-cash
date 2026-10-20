// @vitest-environment jsdom
// Tests de MoneyAmount: reglas de moneda de la fase E2 (3 monedas).
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Rate } from "@/lib/money/convert";
import type { CurrencyCode } from "@/lib/db/types";
import { money } from "@/lib/money/money";
import { renderWithIntl as render } from "@/test/intl";

import { MoneyAmount } from "./money-amount";
import { RateProvider, type RateStatus } from "./rate-provider";

// Las Server Actions no se ejecutan en estos tests.
vi.mock("@/lib/money/actions", () => ({ refreshRates: vi.fn(), saveDisplayCurrency: vi.fn() }));

afterEach(cleanup);

const NBSP = " ";
const USD_COP: Rate = {
  base: "USD",
  quote: "COP",
  rate: "4000",
  asOf: "2026-10-16",
  fetchedAt: new Date().toISOString(),
  source: "test",
};
const EUR_USD: Rate = {
  base: "EUR",
  quote: "USD",
  rate: "1.1",
  asOf: "2026-10-16",
  fetchedAt: new Date().toISOString(),
  source: "test",
};
const EUR_COP: Rate = { ...USD_COP, base: "EUR", quote: "COP", rate: "4400" };

function setup(
  node: React.ReactElement,
  display: CurrencyCode = "COP",
  status?: RateStatus,
  rates: Rate[] = [USD_COP, EUR_USD, EUR_COP],
) {
  return render(
    <RateProvider
      initialRates={rates}
      initialDisplayCurrency={display}
      persist={false}
      forcedStatus={status}
    >
      {node}
    </RateProvider>,
  );
}

describe("MoneyAmount: variant=row", () => {
  it("misma moneda: solo el importe, sin línea secundaria", () => {
    const { container } = setup(<MoneyAmount value={money(89900n, "COP")} />);
    expect(container.textContent).toBe(`89,900${NBSP}COP`);
  });

  it("distinta moneda: convertido primero (sin ≈), 'original' e insignia debajo", () => {
    const { container } = setup(<MoneyAmount value={money(1599n, "USD")} />);
    expect(container.textContent).toContain(`63,960${NBSP}COP`);
    expect(container.querySelector(".text-footnote")?.textContent).toBe(
      `original US$${NBSP}15.99USD`,
    );
    expect(container.textContent).not.toContain("≈");
  });

  it("EUR convertido a COP con la tasa EUR/COP guardada", () => {
    const { container } = setup(<MoneyAmount value={money(100n, "EUR")} />);
    expect(container.textContent).toContain(`4,400${NBSP}COP`);
  });

  it("tasa faltante: el original sigue como principal y dice 'rate unavailable', nunca 0", () => {
    const { container } = setup(<MoneyAmount value={money(1599n, "USD")} />, "COP", undefined, []);
    expect(container.textContent).toContain(`US$${NBSP}15.99`);
    expect(screen.getByText("rate unavailable")).toBeTruthy();
    expect(container.textContent).not.toContain("COP");
  });

  it("error de red: el original sigue como principal, no un número viejo", () => {
    const { container } = setup(<MoneyAmount value={money(1599n, "USD")} />, "COP", "error");
    expect(container.textContent).toContain(`US$${NBSP}15.99`);
    expect(screen.getByText("rate unavailable")).toBeTruthy();
  });

  it("actualizando: el importe convertido baja al 60 %", () => {
    const { container } = setup(<MoneyAmount value={money(1599n, "USD")} />, "COP", "updating");
    expect(container.querySelector(".opacity-60")?.textContent).toBe(`63,960${NBSP}COP`);
  });
});

describe("MoneyAmount: variant=total", () => {
  it("sin desglose: solo el total, sin línea secundaria", () => {
    const { container } = setup(
      <MoneyAmount variant="total" value={money(3_360_000n, "COP")} />,
    );
    expect(container.textContent).toBe(`3,360,000${NBSP}COP`);
  });

  it("con desglose en otra moneda: texto para abrir el sheet, y el sheet con el detalle", () => {
    setup(
      <MoneyAmount
        variant="total"
        value={money(3_360_000n, "COP")}
        breakdown={[money(2_000_000n, "COP"), money(34000n, "USD")]}
      />,
    );
    const toggle = screen.getByText("Converted with today's rates");
    fireEvent.click(toggle);
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("Breakdown by currency");
    expect(dialog.textContent).toContain(`US$${NBSP}340.00`);
    expect(dialog.textContent).toContain("rate 4,000.00, as of Oct 16");
  });
});
