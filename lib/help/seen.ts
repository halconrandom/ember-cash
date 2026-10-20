/**
 * Si ya se abrió el panel de ayuda de una página (para el punto de "nuevo").
 * Conveniencia del navegador: nunca falla si no hay almacenamiento (modo
 * privado, bloqueado) — en ese caso no se muestra el punto de más.
 *
 * No leerlo en el primer render: en el servidor localStorage no existe y
 * esto devuelve true, y en el navegador puede devolver false. Ese par es
 * el error de hidratación 418. useSyncExternalStore usa la instantánea del
 * servidor en ese render y esta función solo después.
 */
const listeners = new Set<() => void>();

export function hasSeenHelp(page: string): boolean {
  try {
    return localStorage.getItem(`ec:helpSeen:${page}`) === "1";
  } catch {
    return true;
  }
}

export function markHelpSeen(page: string): void {
  try {
    localStorage.setItem(`ec:helpSeen:${page}`, "1");
  } catch {
    // Almacenamiento no disponible: se ignora.
  }
  for (const listener of listeners) listener();
}

/** Avisa cuando markHelpSeen cambia el valor en esta pestaña. */
export function subscribeHelpSeen(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}
