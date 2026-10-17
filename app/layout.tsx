/**
 * Layout raíz.
 * - Fuente Inter (DESIGN_SPEC §2) como --font-sans.
 * - Íconos Flaticon Uicons (regular rounded y solid rounded) vía CSS.
 * - Scripts inline que aplican el tema y el idioma (<html lang>) antes del
 *   primer pintado.
 * - Idioma: next-intl lo toma de la cookie ec-locale. Como es un dato de la
 *   petición, el proveedor va dentro de <Suspense> (cacheComponents).
 * - Proveedores de cliente: tema, movimiento reducido y toasts.
 */
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import "@flaticon/flaticon-uicons/css/regular/rounded.css";
import "@flaticon/flaticon-uicons/css/solid/rounded.css";
import "./globals.css";

import { Providers } from "@/components/providers";
import { DEFAULT_LOCALE, DEFAULT_TIME_ZONE, LOCALE_SCRIPT } from "@/lib/i18n/config";
import { THEME_SCRIPT } from "@/lib/theme/constants";

// Inter se expone como --font-sans, que usa la utilidad `font-sans` de Tailwind.
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("common.appName"), description: t("metadata.description") };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: los scripts inline cambian la clase y el lang
    // de <html> antes de que React hidrate.
    <html
      lang={DEFAULT_LOCALE}
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT + LOCALE_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <Suspense fallback={null}>
          <IntlRoot>{children}</IntlRoot>
        </Suspense>
      </body>
    </html>
  );
}

/** Proveedor de next-intl con el idioma y los mensajes de la petición. */
async function IntlRoot({ children }: { children: React.ReactNode }) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone={DEFAULT_TIME_ZONE}>
      <Providers>{children}</Providers>
    </NextIntlClientProvider>
  );
}
