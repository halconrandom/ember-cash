/**
 * Layout raíz. Carga la fuente Inter (definida en docs/DESIGN_SPEC.md) y los
 * estilos globales.
 */
import type { Metadata } from "next";
import { Inter } from "next/font/google";

import "./globals.css";

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
    <html lang="es" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
