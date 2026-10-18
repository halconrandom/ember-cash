/**
 * Si no hay consentimiento de la versión vigente, no se pintan las páginas
 * de la app: solo la pantalla de aceptación.
 */
export function ConsentBoundary({
  allowed,
  blocked,
  children,
}: {
  allowed: boolean;
  blocked: React.ReactNode;
  children: React.ReactNode;
}) {
  if (!allowed) return blocked;
  return children;
}
