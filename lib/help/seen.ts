/**
 * Si ya se abrió el panel de ayuda de una página (para el punto de "nuevo").
 * Conveniencia del navegador: nunca falla si no hay almacenamiento (modo
 * privado, bloqueado) — en ese caso no se muestra el punto de más.
 */
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
}
