// @vitest-environment jsdom
// Sin la casilla no se crea la cuenta: ni Google ni el enlace mágico.
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl as render } from "@/test/intl";

import { LoginForm } from "./login-form";

const { signInWithOAuth, signInWithOtp } = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(),
  signInWithOtp: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { signInWithOAuth, signInWithOtp },
  }),
}));

afterEach(() => {
  cleanup();
  signInWithOAuth.mockReset();
  signInWithOtp.mockReset();
});

function renderForm() {
  return render(<LoginForm next="/" initialError={null} />);
}

describe("LoginForm", () => {
  it("no muestra aviso de versión de prueba ni de cifras inventadas", () => {
    const { container } = renderForm();
    expect(container.textContent).not.toContain("Test version");
    expect(container.textContent).not.toContain("made-up");
  });

  it("sin la casilla no abre Google ni envía el correo", () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(signInWithOAuth).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe("Check this box to create your account.");

    fireEvent.change(screen.getByRole("textbox", { name: "Email" }), {
      target: { value: "a@b.co" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Send magic link" }).closest("form")!);
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("con la casilla sí llama a Google y al enlace, sin filtrar el error crudo", async () => {
    signInWithOAuth.mockResolvedValue({ error: null });
    signInWithOtp.mockResolvedValue({ error: null });
    renderForm();
    fireEvent.click(screen.getByRole("checkbox"));

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(signInWithOAuth).toHaveBeenCalledOnce();

    fireEvent.change(screen.getByRole("textbox", { name: "Email" }), {
      target: { value: "a@b.co" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Send magic link" }).closest("form")!);
    expect(signInWithOtp).toHaveBeenCalledOnce();
    const options = signInWithOtp.mock.calls[0]?.[0] as {
      options?: { shouldCreateUser?: boolean };
    };
    expect(options.options?.shouldCreateUser).toBe(true);
  });
});
