"use client";

/**
 * Fila del interruptor Personal / Compartido sobre el contenido, solo en las
 * rutas que dependen del scope (nav.ts, scope: "shell"). Hogar lo pone en su
 * propia fila junto a los miembros.
 */
import { usePathname } from "next/navigation";

import { PAGE_TITLES } from "./nav";
import { ScopeSwitch } from "./scope-switch";

export function ScopeRow(props: { scope: "personal" | "shared"; householdId: string | null }) {
  const pathname = usePathname();
  if (PAGE_TITLES[pathname]?.scope !== "shell") return null;
  return (
    <div className="mb-6 hidden lg:block">
      <ScopeSwitch {...props} />
    </div>
  );
}

/** Espacio reservado mientras carga el scope (misma altura, sin salto). */
export function ScopeRowFallback() {
  const pathname = usePathname();
  if (PAGE_TITLES[pathname]?.scope !== "shell") return null;
  return <div aria-hidden className="mb-6 hidden h-11 lg:block" />;
}
