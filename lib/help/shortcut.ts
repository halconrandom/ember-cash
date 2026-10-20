/**
 * ¿El foco (el target del evento) está en un campo de escritura? Ahí la
 * tecla "?" debe escribir el carácter, no abrir el panel de ayuda.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest("input, textarea, [contenteditable='true']") !== null
  );
}
