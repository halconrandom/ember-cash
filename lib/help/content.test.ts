// Tests de lib/help/content.ts: qué páginas tienen ayuda y que cada
// combinación de página+idioma cargue su archivo real.
import { describe, expect, it } from "vitest";

import { HELP_PAGES } from "@/lib/events/validate";

import { hasHelp, HELP_PAGES_READY, loadHelpContent } from "./content";

describe("hasHelp", () => {
  it("solo las páginas de esta fase (Panel, Deudas, Suscripciones)", () => {
    expect(HELP_PAGES_READY).toEqual(["dashboard", "debts", "subscriptions"]);
  });

  it("toda página lista es una página de ayuda válida (HELP_PAGES)", () => {
    for (const page of HELP_PAGES_READY) expect(HELP_PAGES as readonly string[]).toContain(page);
  });

  it("rechaza páginas sin contenido todavía (fase F3)", () => {
    expect(hasHelp("calendar")).toBe(false);
    expect(hasHelp("")).toBe(false);
  });
});

describe("loadHelpContent", () => {
  it("carga las 3 páginas en los 2 idiomas, con propósito, see, do y faq", async () => {
    for (const page of HELP_PAGES_READY) {
      for (const locale of ["es", "en"] as const) {
        const content = await loadHelpContent(page, locale);
        expect(content.purpose.length).toBeGreaterThan(0);
        expect(content.see.length).toBeGreaterThan(0);
        expect(content.do.length).toBeGreaterThan(0);
        expect(content.faq.length).toBeGreaterThan(0);
      }
    }
  });
});
