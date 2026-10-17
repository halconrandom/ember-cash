/**
 * Estilos PROVISIONALES de la fase 2 (login, onboarding, invitaciones).
 * Usan los tokens provisionales de app/globals.css, tomados de
 * docs/DESIGN_SPEC.md. La fase 4 reemplaza esto por los componentes reales.
 */
export const ui = {
  /** Tarjeta: radio 20, padding 24. Sombra en claro, borde de 1 px en oscuro. */
  card: "rounded-[1.25rem] border border-[var(--card-border)] bg-card p-6 shadow-[var(--card-shadow)]",
  /** Botón primario (ember-fill con texto blanco). Uno solo por pantalla. */
  primaryButton:
    "inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 text-[0.875rem] font-semibold text-primary-foreground transition-transform duration-100 ease-out hover:bg-primary-press active:scale-[0.97] active:bg-primary-press disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
  /** Botón secundario: superficie con borde. */
  secondaryButton:
    "inline-flex h-11 items-center justify-center gap-2 rounded-full border border-border bg-card px-5 text-[0.875rem] font-semibold text-foreground transition-transform duration-100 ease-out hover:bg-muted active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
  /** Campo de texto: radio 12 (controles). */
  input:
    "h-11 w-full rounded-xl border border-border bg-card px-3.5 text-[0.875rem] text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-destructive",
  /** Etiqueta de campo (Callout 13 medium). */
  label: "text-[0.8125rem] font-medium text-foreground",
  /** Texto de ayuda (Footnote 12, text3). */
  helper: "text-xs text-muted-foreground",
  /** Mensaje de error (texto negativo). */
  error: "text-[0.8125rem] font-medium text-destructive",
  /** Mensaje de éxito (texto positivo). */
  success: "text-[0.8125rem] font-medium text-positive",
  /** Título de página (Title 1: 26 bold, tracking -1.8%). */
  title: "text-[1.625rem] leading-tight font-bold tracking-[-0.018em]",
  /** Título de tarjeta (Headline: 16 semibold, tracking -0.4%). */
  headline: "text-base font-semibold tracking-[-0.004em]",
  /** Texto secundario (Body 14, text2). */
  body2: "text-[0.875rem] text-text2",
  /** Enlace (ember-text). */
  link: "font-medium text-ember-text underline-offset-4 hover:underline",
} as const;
