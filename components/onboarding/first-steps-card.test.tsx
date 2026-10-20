// @vitest-environment jsdom
// Primeros pasos: pendientes, cierre al completar y el aviso de omitir.
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test/intl";

import { DoneHint } from "./done-hint";
import { FirstStepsCard } from "./first-steps-card";
import { SkippedToast } from "./skipped-toast";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

const show = vi.fn();
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ show }),
}));

afterEach(() => {
  cleanup();
  show.mockClear();
});

describe("primeros pasos", () => {
  it("enlaza lo pendiente y marca lo hecho", () => {
    renderWithIntl(
      <FirstStepsCard
        flags={{ expense: true, goal: false, debt: false, household: false }}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByRole("link", { name: "Create a savings goal" }).getAttribute("href")).toBe(
      "/savings?goal=new",
    );
    expect(screen.queryByRole("link", { name: "Record an expense" })).toBeNull();
    expect(
      screen.getByText("Share expenses and goals with your partner or the people you live with."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hide" })).toBeTruthy();
  });

  it("al completar los cuatro deja el texto de cierre", () => {
    renderWithIntl(
      <FirstStepsCard
        flags={{ expense: true, goal: true, debt: true, household: true }}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText("You have the basics. We'll leave it here.")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("la pista del panel explica el total y no usa el botón primario", () => {
    renderWithIntl(<DoneHint currency="COP" onDismiss={vi.fn(async () => {})} />);
    expect(screen.getByRole("heading", { name: "Done. This is your dashboard." })).toBeTruthy();
    expect(screen.getByText(/total in COP/)).toBeTruthy();
    expect(screen.getByText(/help button/)).toBeTruthy();
    const button = screen.getByRole("button", { name: "Got it" });
    expect(button.className).not.toMatch(/ember-fill/);
  });
});

describe("aviso de omitir", () => {
  it("muestra el texto del copy", () => {
    renderWithIntl(<SkippedToast />);
    expect(show).toHaveBeenCalledWith({
      message: "No problem. We used default values and you can change them in Settings.",
    });
  });
});
