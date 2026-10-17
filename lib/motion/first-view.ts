"use client";

/**
 * "Solo en la primera carga" (DESIGN_SPEC §7): las entradas, el Number Ticker
 * y el llenado de barras y anillos corren la primera vez que se ve una
 * pantalla en esta carga de la app. Al volver a esa pantalla (navegación del
 * cliente) todo aparece al instante; una recarga completa vuelve a empezar.
 *
 * El registro vive en memoria del módulo, solo en el navegador. En el
 * servidor siempre es "primera vez", igual que en la hidratación inicial
 * del cliente, así el HTML coincide y no hay saltos.
 */
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const seen = new Set<string>();

/** ¿Es la primera vez que se ve `key` en esta carga? (sin efectos secundarios) */
export function isFirstView(key: string): boolean {
  return typeof window === "undefined" || !seen.has(key);
}

/** Marca `key` como vista. */
export function markSeen(key: string): void {
  seen.add(key);
}

/**
 * Hook: true durante toda la vida del componente si es la primera vez que se
 * ve la pantalla actual (o `scope`, si se pasa). Se marca al montar, así
 * todos los componentes que montan juntos en esa visita ven lo mismo.
 */
export function useFirstView(scope?: string): boolean {
  const pathname = usePathname();
  const key = scope ?? pathname;
  const [first] = useState(() => isFirstView(key));
  useEffect(() => {
    markSeen(key);
  }, [key]);
  return first;
}

/** Solo para tests: vacía el registro. */
export function resetFirstViews(): void {
  seen.clear();
}

/**
 * Entrada de una lista: true solo para la lista inicial en la primera carga.
 * Si `listKey` cambia (otro filtro), la lista nueva aparece sin animar; úsalo
 * también como `key` de la lista para que se monte de nuevo.
 */
export function useEntrance(listKey: string): boolean {
  const first = useFirstView();
  const [initialKey] = useState(listKey);
  return first && listKey === initialKey;
}
