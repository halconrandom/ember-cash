"use client";

/**
 * Topbar de 72 px: título (Title 1) y subtítulo de la ruta actual. Las
 * acciones del frame (chip de tasa, mes, COP/USD, botón primario) llegan con
 * la lógica de cada pantalla.
 */
import { usePathname } from "next/navigation";

import { PAGE_TITLES } from "./nav";

export function Topbar() {
  const pathname = usePathname();
  const page = PAGE_TITLES[pathname] ?? { title: "Ember Cash" };

  return (
    <header className="flex min-h-[72px] items-center justify-between gap-6 px-4 py-3 lg:px-8">
      <div className="min-w-0">
        <h1 className="text-title1 text-ink">{page.title}</h1>
        {page.subtitle && <p className="text-body text-ink-2 mt-0.5">{page.subtitle}</p>}
      </div>
    </header>
  );
}
