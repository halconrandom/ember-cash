// @vitest-environment jsdom
// El wizard: bienvenida, omitir sin modal, retomar un paso y el foco al título.
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { MotionConfig } from "motion/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test/intl";

import { Wizard } from "./wizard";
import { saveFirstAccount, skipOnboarding } from "./wizard-actions";

vi.mock("./wizard-actions", () => ({
  startOnboarding: vi.fn(async () => ({ formError: null, fields: {} })),
  saveCurrency: vi.fn(async () => ({ formError: null, fields: {} })),
  saveFirstAccount: vi.fn(async () => ({
    formError: "onboarding.account.errors.save",
    fields: { name: "onboarding.account.errors.name" },
  })),
  saveFocus: vi.fn(async () => ({ formError: null, fields: {} })),
  skipOnboarding: vi.fn(async () => ({ formError: null, fields: {} })),
  goBack: vi.fn(async () => ({ formError: null, fields: {} })),
}));

afterEach(cleanup);

const rates = [
  {
    base: "USD" as const,
    quote: "COP" as const,
    rate: "4000.5000000000",
    asOf: "2026-10-20",
    fetchedAt: "2026-10-20T12:00:00Z",
    source: "test-source",
  },
];

describe("wizard", () => {
  it("la bienvenida ofrece Empezar y Ya tengo cuenta, sin datos de ejemplo", () => {
    renderWithIntl(<Wizard step={0} currency="COP" rates={[]} />);
    expect(screen.getByRole("button", { name: "Start" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "I already have an account" })).toBeTruthy();
    expect(screen.queryByText(/sample data/i)).toBeNull();
    expect(screen.queryByText(/SAMPLE/)).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1 }));
    expect(document.querySelector("[aria-live='polite']")).toBeTruthy();
  });

  it("Omitir no abre un modal", async () => {
    renderWithIntl(<Wizard step={0} currency="COP" rates={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Skip the introduction" }));
    await waitFor(() => expect(skipOnboarding).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("retoma la moneda guardada y muestra la tasa real o que no hay", () => {
    const { unmount } = renderWithIntl(<Wizard step={1} currency="USD" rates={rates} />);
    expect(screen.getByRole("heading", { name: /which currency/i })).toBeTruthy();
    expect(
      screen.getByRole("radio", { name: "US dollar (USD)" }).getAttribute("aria-checked"),
    ).toBe("true");
    expect(screen.getByText(/1 USD = 4000\.5 COP/)).toBeTruthy();
    expect(screen.getByText(/Source: test-source/)).toBeTruthy();
    unmount();
    renderWithIntl(<Wizard step={1} currency="EUR" rates={[]} />);
    expect(screen.getByText(/couldn't get today's rate/i)).toBeTruthy();
  });

  it("el paso de la cuenta usa inputs de 16 px y muestra el error con texto", async () => {
    renderWithIntl(<Wizard step={2} currency="COP" rates={[]} />);
    const name = screen.getByLabelText("Name");
    expect((name as HTMLInputElement).style.fontSize).toBe("16px");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(saveFirstAccount).toHaveBeenCalled());
    const alerts = await screen.findAllByRole("alert");
    expect(alerts.some((node) => /couldn't save the account/i.test(node.textContent ?? ""))).toBe(
      true,
    );
    expect(screen.getByLabelText("Name").getAttribute("aria-invalid")).toBe("true");
  });

  it("con movimiento reducido el paso no parte desplazado", () => {
    renderWithIntl(
      <MotionConfig reducedMotion="always">
        <Wizard step={3} currency="COP" rates={[]} />
      </MotionConfig>,
    );
    const step = screen.getByTestId("onboarding-step");
    expect(step.getAttribute("style") ?? "").not.toMatch(/translateY\(16px\)/);
    expect(screen.getByRole("heading", { name: /what do you want to track/i })).toBeTruthy();
  });
});
