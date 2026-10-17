/**
 * `cn` de shadcn/ui: une clases de Tailwind y resuelve conflictos.
 *
 * Se configura con los tamaños de la escala tipográfica propia
 * (app/globals.css). Sin esto, `cn("text-headline", "text-ink")` tomaría los
 * dos como colores y descartaría el tamaño.
 */
import { createCn } from "cn/config";

/** Tamaños de texto definidos en @theme (--text-*). */
export const FONT_SIZES = [
  "display",
  "amount-xl",
  "title1",
  "title2",
  "amount-l",
  "brand",
  "headline",
  "body",
  "callout",
  "footnote",
  "caption",
] as const;

export const cn = createCn({
  extend: { classGroups: { "font-size": [{ text: [...FONT_SIZES] }] } },
});
