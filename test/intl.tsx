/**
 * Ayuda de tests: renderiza con NextIntlClientProvider y los mensajes reales
 * del idioma pedido (inglés por defecto, para que los tests lean igual que
 * los frames). Usa `wrapper`, así `rerender` conserva el proveedor.
 */
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "@/messages/en.json";
import es from "@/messages/es.json";

const MESSAGES = { en, es } as const;

export function renderWithIntl(ui: React.ReactElement, locale: keyof typeof MESSAGES = "en") {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]} timeZone="America/Bogota">
        {children}
      </NextIntlClientProvider>
    );
  }
  return render(ui, { wrapper: Wrapper });
}
