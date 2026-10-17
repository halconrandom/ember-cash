/**
 * Decisiones puras de los comandos de base.
 *
 * Hay un solo proyecto de Supabase, enlazado en supabase/.temp/project-ref.
 * Sirve para desarrollo y para producción, así que aplicar migraciones pide
 * el ref escrito y el seed de demostración no corre contra ese proyecto.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Raíz del repo, a partir de este archivo. */
export const ROOT = new URL("..", import.meta.url).pathname;

/** Ref del proyecto enlazado, o cadena vacía si no hay enlace. */
export function readLinkedProjectRef(root = ROOT) {
  try {
    return readFileSync(join(root, "supabase/.temp/project-ref"), "utf8").trim();
  } catch {
    return "";
  }
}

/**
 * La confirmación vale solo si la respuesta es el ref, sin espacios de más.
 * Mayúsculas distintas no cuentan: el ref se copia tal cual.
 */
export function isPushConfirmed(answer, projectRef) {
  if (!projectRef) return false;
  return answer.trim() === projectRef;
}

/** Texto con el que el seed de demostración se niega. */
export function seedRefusal(projectRef) {
  const where = projectRef ? ` (${projectRef})` : "";
  return `No se carga el seed de demostración contra el proyecto enlazado${where}. Ese proyecto es el de desarrollo y el de producción.`;
}
