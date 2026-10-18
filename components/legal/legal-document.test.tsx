// @vitest-environment jsdom
// El aviso y los términos se pintan en es y en, sin sesión, con el texto legal.
import { cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import PrivacyPage from "@/app/privacidad/page";
import TermsPage from "@/app/terminos/page";
import { renderWithIntl } from "@/test/intl";

import { LegalDocument } from "./legal-document";

const EMAIL = "contacto@example.com";

afterEach(() => {
  cleanup();
});

describe("páginas legales", () => {
  it("el aviso en español incluye lo compartido, la versión y el correo, sin borrador ni prueba", () => {
    const { container } = renderWithIntl(<PrivacyPage />, "es");
    expect(container.querySelector("h1")?.textContent).toBe("Aviso de privacidad");
    expect(container.textContent).not.toContain("Borrador sujeto a revisión legal.");
    expect(container.textContent).not.toContain("versión de prueba");
    expect(container.textContent).not.toContain("cifras inventadas");
    expect(container.querySelector("h2")?.textContent).not.toBe("");
    const headings = [...container.querySelectorAll("h2")].map((node) => node.textContent);
    expect(headings).toContain("Gastos compartidos del hogar");
    expect(container.textContent).toContain("Usuario eliminado");
    expect(container.textContent).toContain(
      "Versión 2026-10-v1 · Actualizado el 17 de octubre de 2026",
    );
    expect(container.querySelector('a[href="mailto:contacto@example.com"]')?.textContent).toBe(
      EMAIL,
    );
    const items = [...container.querySelectorAll("li")].map((node) => node.textContent);
    expect(items[0]).toBe("Tu correo electrónico.");
    expect(items).toHaveLength(8 + 3 + 5);
  });

  it("los términos en inglés agrupan el uso aceptable y muestran el correo", () => {
    const { container } = renderWithIntl(<TermsPage />, "en");
    expect(container.querySelector("h1")?.textContent).toBe("Terms of use");
    expect(container.textContent).not.toContain("Draft, subject to legal review.");
    expect(container.textContent).not.toContain("Test version");
    expect(container.textContent).not.toContain("made-up");
    expect(container.textContent).toContain(
      "It is provided as is, with no guarantee that it will always work or never fail.",
    );
    expect(container.textContent).toContain("Version 2026-10-v1 · Updated October 17, 2026");
    const items = [...container.querySelectorAll("li")].map((node) => node.textContent);
    expect(items).toEqual([
      "Not use it for anything illegal.",
      "Not try to access other people's data.",
      "Not damage or overload the service.",
      "Keep your account and password safe.",
    ]);
    expect(container.querySelector('a[href="mailto:contacto@example.com"]')?.textContent).toBe(
      EMAIL,
    );
  });

  it("el aviso en inglés no se salta el apartado de gastos compartidos", () => {
    const { container } = renderWithIntl(
      <LegalDocument section="privacy" contactEmail={EMAIL} />,
      "en",
    );
    const headings = [...container.querySelectorAll("h2")].map((node) => node.textContent);
    expect(headings).toContain("Shared household expenses");
    expect(container.textContent).toContain("Deleted user");
    expect(container.textContent).not.toContain("Draft, subject to legal review.");
    expect(container.textContent).not.toContain("Test version");
    expect(container.textContent).not.toContain("made-up");
  });
});
