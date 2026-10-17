/**
 * Contraste WCAG 2.x. Port directo de docs/contrast.py (mismas fórmulas,
 * incluido el umbral 0.03928 de la linealización sRGB).
 */

/** Convierte "#RRGGBB" en [r, g, b] de 0 a 255. */
function channels(hex: string): [number, number, number] {
  const h = hex.replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`Color inválido: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/** Luminancia relativa (contrast.py: lum). */
export function luminance(hex: string): number {
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = channels(hex).map((c) => f(c / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Ratio de contraste entre dos colores, de 1 a 21 (contrast.py: cr). */
export function contrastRatio(a: string, b: string): number {
  let la = luminance(a);
  let lb = luminance(b);
  if (la < lb) [la, lb] = [lb, la];
  return (la + 0.05) / (lb + 0.05);
}

/**
 * Mezcla `fg` sobre `bg` con opacidad `alpha` y redondea cada canal
 * (contrast.py: mix). Sirve para colores con transparencia, como el relleno
 * del botón "mantener para borrar".
 */
export function mix(fg: string, bg: string, alpha: number): string {
  const f = channels(fg);
  const b = channels(bg);
  const out = f.map((c, i) => Math.round(c * alpha + b[i] * (1 - alpha)));
  return `#${out
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}
