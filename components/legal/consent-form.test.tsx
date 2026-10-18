// @vitest-environment jsdom
// Sin la casilla no se guarda el consentimiento. Con ella, sí, y con la versión del código.
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LEGAL_VERSION } from "@/lib/legal/version";
import { renderWithIntl as render } from "@/test/intl";

import { ConsentForm } from "./consent-form";

const { acceptConsent, refresh } = vi.hoisted(() => ({
  acceptConsent: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/legal/actions", () => ({ acceptConsent }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

afterEach(() => {
  cleanup();
  acceptConsent.mockReset();
  refresh.mockReset();
});

describe("ConsentForm", () => {
  it("sin la casilla muestra el error y no guarda", () => {
    render(<ConsentForm />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("alert").textContent).toBe("Check this box to create your account.");
    expect(acceptConsent).not.toHaveBeenCalled();
    expect(screen.getByText(new RegExp(LEGAL_VERSION)).textContent).toContain(LEGAL_VERSION);
  });

  it("con la casilla guarda y vuelve a pedir la app", async () => {
    acceptConsent.mockResolvedValue({ ok: true });
    render(<ConsentForm />);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(acceptConsent).toHaveBeenCalledOnce();
  });

  it("el texto de la casilla enlaza el aviso y los términos", () => {
    render(<ConsentForm />);
    expect(screen.getByRole("link", { name: "privacy notice" }).getAttribute("href")).toBe(
      "/privacidad",
    );
    expect(screen.getByRole("link", { name: "terms" }).getAttribute("href")).toBe("/terminos");
  });
});
