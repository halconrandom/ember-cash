/**
 * Layout raíz.
 * - Fuente Inter (DESIGN_SPEC §2) como --font-sans.
 * - Íconos Flaticon Uicons (regular rounded y solid rounded) vía CSS.
 * - Script inline que aplica el tema antes del primer pintado.
 * - Proveedores de cliente: tema, movimiento reducido y toasts.
 */
import type { Metadata } from "next";
import { Inter } from "next/font/google";

import "@flaticon/flaticon-uicons/css/regular/rounded.css";
import "@flaticon/flaticon-uicons/css/solid/rounded.css";
import "./globals.css";

import { Providers } from "@/components/providers";
import { THEME_SCRIPT } from "@/lib/theme/constants";

// Inter se expone como --font-sans, que usa la utilidad `font-sans` de Tailwind.
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ember Cash",
  description: "Finanzas personales",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: el script del tema cambia la clase de <html>
    // antes de que React hidrate.
    <html lang="es" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
