/**
 * Registro de errores del servidor sin fugas (auditoría, fase 2).
 *
 * Nunca se imprime el objeto de error completo: un error de PostgREST trae
 * `details` y `hint` con valores de la fila (montos, correos, ids) y un error
 * de fetch puede traer la URL con un token. Solo se registran el contexto,
 * el tipo, el código y un mensaje recortado, sin correos, JWT ni números
 * largos. El cliente nunca recibe esto: solo una clave de error genérica.
 */
import "server-only";

export type LoggedError = { context: string; name: string; code?: string; message: string };

const MAX_MESSAGE = 200;

/** Quita del mensaje lo que podría ser un dato personal o un secreto. */
export function scrubMessage(message: string): string {
  return message
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[jwt]")
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[correo]")
    .replace(/[?&](access_token|token|apikey|key)=[^&\s]+/gi, "?$1=[oculto]")
    .replace(/\d{4,}/g, "[n]")
    .slice(0, MAX_MESSAGE);
}

/** Resumen seguro de un error cualquiera. */
export function summarizeError(context: string, error: unknown): LoggedError {
  const base =
    typeof error === "object" && error !== null ? (error as Record<string, unknown>) : {};
  const name =
    error instanceof Error ? error.name : typeof base.name === "string" ? base.name : typeof error;
  const message =
    error instanceof Error
      ? error.message
      : typeof base.message === "string"
        ? base.message
        : String(error);
  const code = typeof base.code === "string" ? base.code : undefined;
  return { context, name, ...(code ? { code } : {}), message: scrubMessage(message) };
}

/** Registra un error del servidor (va a los logs de Vercel, nunca al cliente). */
export function logServerError(context: string, error: unknown): void {
  console.error("[Ember Cash]", JSON.stringify(summarizeError(context, error)));
}
