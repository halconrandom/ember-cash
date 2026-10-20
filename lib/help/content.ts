/**
 * Contenido del panel de ayuda por página (help/<página>.<idioma>.json),
 * cargado solo cuando se abre (import dinámico: no entra al paquete
 * principal). Fase F2: Panel, Deudas y Suscripciones; el resto llega en F3.
 */
import type { HelpPage } from "@/lib/events/validate";
import type { Locale } from "@/lib/i18n/config";

export type HelpFaqItem = { q: string; a: string };

export type HelpContent = {
  /** Propósito de la página (1-2 frases). */
  purpose: string;
  /** "Qué ves aquí", en una sola cadena (viñetas separadas por " · "). */
  see: string;
  /** "Qué puedes hacer", igual formato que `see`. */
  do: string;
  faq: HelpFaqItem[];
};

/** Páginas con contenido de ayuda en esta fase. */
export const HELP_PAGES_READY = ["dashboard", "debts", "subscriptions"] as const satisfies readonly HelpPage[];
export type HelpPageReady = (typeof HELP_PAGES_READY)[number];

export function hasHelp(page: string): page is HelpPageReady {
  return (HELP_PAGES_READY as readonly string[]).includes(page);
}

/**
 * Un `import()` por combinación (ruta estática: así el empaquetador puede
 * partirlo en un trozo propio por archivo, sin adivinar con una plantilla).
 */
const LOADERS: Record<`${HelpPageReady}.${Locale}`, () => Promise<{ default: HelpContent }>> = {
  "dashboard.es": () => import("@/help/dashboard.es.json"),
  "dashboard.en": () => import("@/help/dashboard.en.json"),
  "debts.es": () => import("@/help/debts.es.json"),
  "debts.en": () => import("@/help/debts.en.json"),
  "subscriptions.es": () => import("@/help/subscriptions.es.json"),
  "subscriptions.en": () => import("@/help/subscriptions.en.json"),
};

export async function loadHelpContent(page: HelpPageReady, locale: Locale): Promise<HelpContent> {
  const mod = await LOADERS[`${page}.${locale}`]();
  return mod.default;
}
