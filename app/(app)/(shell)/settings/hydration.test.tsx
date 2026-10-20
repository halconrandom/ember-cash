// @vitest-environment node
/**
 * Hidratación de la barra de Ajustes. El servidor no tiene localStorage;
 * el primer HTML del cliente tiene que ser el mismo. Si el punto de ayuda
 * (o el orden de monedas recientes) se calcula en ese render, React tira
 * el error 418 y rehace el árbol.
 */
import { createElement, type ReactNode } from "react";
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { JSDOM } from "jsdom";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LiveRateChip } from "@/components/money/live-rate-chip";
import { RateProvider } from "@/components/money/rate-provider";
import { Topbar } from "@/components/shell/topbar";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { ToastProvider } from "@/components/ui/toast";
import type { Rate } from "@/lib/money/convert";
import es from "@/messages/es.json";

import { CurrencySetting } from "./currency-setting";
import { ThemeSetting } from "./theme-setting";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

const RATES: Rate[] = [
  {
    base: "USD",
    quote: "COP",
    rate: "3900.50",
    asOf: "2026-10-20",
    fetchedAt: "2026-10-20T18:30:00.000Z",
    source: "datos.gov.co",
  },
];

/** Lo que pinta Ajustes en el cliente: tema, monedas y la barra con la ayuda. */
function Tree({ children }: { children?: ReactNode }) {
  return (
    <NextIntlClientProvider locale="es" messages={es} timeZone="America/Bogota">
      <ThemeProvider>
        <ToastProvider>
          <RateProvider
            initialRates={RATES}
            initialDisplayCurrency="COP"
            initialEnabledCurrencies={["COP", "USD", "EUR"]}
            persist={false}
          >
            <Topbar />
            <ThemeSetting />
            <CurrencySetting />
            <LiveRateChip />
            {children}
          </RateProvider>
        </ToastProvider>
      </ThemeProvider>
    </NextIntlClientProvider>
  );
}

describe("hidratación de Ajustes", () => {
  const errors: string[] = [];
  const original = console.error;

  afterEach(() => {
    console.error = original;
    Reflect.deleteProperty(globalThis, "localStorage");
  });

  it("el punto de ayuda no está en el HTML del servidor y aparece al montar", async () => {
    const html = renderToString(createElement(Tree));
    expect(html).not.toContain("Nuevo: aquí tienes ayuda");

    const dom = new JSDOM(`<!doctype html><html><body><div id="root">${html}</div></body></html>`, {
      url: "https://cash.halcon.dev/settings",
      pretendToBeVisual: true,
    });
    const { window } = dom;
    // Escritorio: el mismo ancho que el servidor (sin matchMedia).
    window.matchMedia = ((query: string) => ({
      matches: query.includes("dark"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    })) as unknown as typeof window.matchMedia;
    class NoopObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    }
    window.MutationObserver = NoopObserver as unknown as typeof MutationObserver;
    window.ResizeObserver = NoopObserver as unknown as typeof ResizeObserver;
    // Ayuda de Ajustes sin abrir, y monedas recientes distintas del orden del servidor.
    window.localStorage.removeItem("ec:helpSeen:settings");
    window.localStorage.setItem("ec:recentCurrencies", JSON.stringify(["EUR", "USD"]));

    Object.assign(globalThis, {
      window,
      document: window.document,
      HTMLElement: window.HTMLElement,
      Element: window.Element,
      Node: window.Node,
      MutationObserver: window.MutationObserver,
      ResizeObserver: window.ResizeObserver,
      IS_REACT_ACT_ENVIRONMENT: true,
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: window.localStorage,
    });

    console.error = (...args: unknown[]) => {
      errors.push(args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join("\n"));
    };

    const root = window.document.getElementById("root");
    expect(root).not.toBeNull();
    await act(async () => {
      hydrateRoot(root!, createElement(Tree));
    });

    const mismatch = errors.filter((message) => message.includes("Hydration failed"));
    expect(mismatch).toEqual([]);
    expect(window.document.body.textContent).toContain("Nuevo: aquí tienes ayuda");
  });
});
