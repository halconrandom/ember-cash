/**
 * Utilidades para redirecciones después del login.
 */

/**
 * Devuelve `next` solo si es una ruta interna segura ("/algo"). Así se evita
 * un open redirect del tipo `?next=https://sitio-malo.com` o `?next=//malo.com`.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next) return fallback;
  // Debe empezar con una sola barra y no contener barras invertidas ni saltos.
  if (!next.startsWith("/") || next.startsWith("//") || /[\\\r\n\t]/.test(next)) {
    return fallback;
  }
  return next;
}
