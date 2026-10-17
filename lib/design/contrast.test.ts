/**
 * Test de contraste de los tokens de diseño (port de docs/contrast.py).
 *
 * Lee los valores reales de app/globals.css (bloques claro y oscuro) y
 * comprueba cada par contra el umbral de la spec:
 *   - texto: 4.5:1 (WCAG 1.4.3)
 *   - gráficos y bordes de controles: 3:1 (WCAG 1.4.11)
 * Cuando la spec cita un ratio exacto, también exige ese valor (±0.01), para
 * detectar que alguien cambió un hex aunque siga pasando el umbral.
 *
 * Los pares de contrast.py que la spec v3 descartó (rosa #C24A75, texto del
 * hero al 90 %) no se incluyen: la spec los reemplazó.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { contrastRatio, mix } from "./contrast";

const TEXT = 4.5;
const GRAPHIC = 3;

/** Extrae `--token: #hex;` del bloque CSS que empieza con `selector {`. */
function readTokens(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`No se encontró el bloque ${selector} en globals.css`);
  const block = css.slice(start, css.indexOf("\n}", start));
  const tokens: Record<string, string> = {};
  for (const m of block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    tokens[m[1]] = m[2].toUpperCase();
  }
  return tokens;
}

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
const LIGHT = readTokens(css, ":root,\n.light");
const DARK = readTokens(css, ".dark");

/**
 * Un par: primer plano, fondo, umbral y (opcional) el ratio que cita la spec.
 * Los valores que empiezan con "#" son literales; el resto, nombres de token.
 */
type Pair = [label: string, fg: string, bg: string, min: number, specRatio?: number];

function resolve(tokens: Record<string, string>, value: string): string {
  if (value.startsWith("#")) return value;
  const hex = tokens[value];
  if (!hex) throw new Error(`Token --${value} no definido en globals.css`);
  return hex;
}

const LIGHT_PAIRS: Pair[] = [
  // Texto base
  ["text / surface", "text", "surface", TEXT],
  ["text2 / surface", "text2", "surface", TEXT, 7.29],
  ["text2 / canvas", "text2", "canvas", TEXT, 6.69],
  ["text3 / surface", "text3", "surface", TEXT, 5.15],
  ["text3 / canvas", "text3", "canvas", TEXT, 4.73],
  ["text3 / surface2", "text3", "surface2", TEXT, 4.73],
  // Marca
  ["blanco / ember-fill", "#FFFFFF", "ember-fill", TEXT, 4.61],
  ["blanco / ember-press", "#FFFFFF", "ember-press", TEXT, 5.63],
  ["blanco / hero-start", "#FFFFFF", "hero-start", TEXT, 4.59],
  ["blanco / hero-end", "#FFFFFF", "hero-end", TEXT, 5.6],
  // Distintivo de variación dentro del hero (fase 11): texto blanco.
  ["blanco / hero-chip", "#FFFFFF", "hero-chip", TEXT],
  ["ember-text / surface", "ember-text", "surface", TEXT, 5.1],
  ["ember-text / canvas", "ember-text", "canvas", TEXT, 4.68],
  ["ember-text / ember-50", "ember-text", "ember-50", TEXT, 4.68],
  // Etiqueta del ítem activo del sidebar: ember-text sobre la píldora (surface)
  ["nav activa: ember-text / surface", "ember-text", "surface", TEXT, 5.1],
  ["ember (gráfico) / surface", "ember", "surface", GRAPHIC, 3.05],
  // Barra de pagado de deudas (ember-fill) sobre su pista y sobre la fila.
  ["barra deudas: debt-bar (ember-fill) / track", "debt-bar", "track", GRAPHIC, 3.88],
  ["barra deudas: debt-bar (ember-fill) / surface2", "debt-bar", "surface2", GRAPHIC, 4.24],
  // Estados y categorías: texto sobre su tinte
  ["positive-text / tint", "positive-text", "positive-tint", TEXT, 4.71],
  ["positive-text / surface", "positive-text", "surface", TEXT, 5.26],
  ["negative-text / tint", "negative-text", "negative-tint", TEXT, 4.64],
  ["info-text / tint", "info-text", "info-tint", TEXT, 4.62],
  ["violet-text / tint", "violet-text", "violet-tint", TEXT, 4.63],
  ["amber-text / tint", "amber-text", "amber-tint", TEXT, 4.72],
  ["pink-text / tint", "pink-text", "pink-tint", TEXT, 5.14],
  ["teal-text / tint", "teal-text", "teal-tint", TEXT, 5.01],
  ["olive-text / tint", "olive-text", "olive-tint", TEXT, 5.03],
  ["slate-text / tint", "slate-text", "slate-tint", TEXT, 6.69],
  // Gráficos (barras, anillos, puntos)
  ["positive / surface", "positive", "surface", GRAPHIC, 3.26],
  ["negative / surface", "negative", "surface", GRAPHIC, 3.91],
  ["info / surface", "info", "surface", GRAPHIC, 3.68],
  ["violet / surface", "violet", "surface", GRAPHIC, 4.23],
  ["amber / surface", "amber", "surface", GRAPHIC, 3.23],
  ["pink / surface", "pink", "surface", GRAPHIC, 3.27],
  ["teal / surface", "teal", "surface", GRAPHIC, 3.33],
  ["olive / surface", "olive", "surface", GRAPHIC, 3.73],
  ["slate / surface", "slate", "surface", GRAPHIC, 4.76],
  ["income-bar / surface", "income-bar", "surface", GRAPHIC, 5.26],
  ["expense-bar / surface", "expense-bar", "surface", GRAPHIC, 3.05],
  ["neutral-bar / surface", "neutral-bar", "surface", GRAPHIC, 5.15],
  // Estados del presupuesto compartido en claro. La barra ámbar usa su token
  // (budget-warn-bar = amber-text #936316) para llegar a 3:1 contra la pista.
  ["presupuesto ámbar: budget-warn-bar / track", "budget-warn-bar", "track", GRAPHIC, 4.38],
  ["presupuesto ámbar: budget-warn-bar / surface", "budget-warn-bar", "surface", GRAPHIC, 5.2],
  ["presupuesto rojo: negative / track", "negative", "track", GRAPHIC, 3.29],
  ["presupuesto gris: neutral-bar / track", "neutral-bar", "track", GRAPHIC, 4.34],
  ["presupuesto ámbar: amber-text / surface", "amber-text", "surface", TEXT, 5.2],
  ["presupuesto rojo: negative-text / surface", "negative-text", "surface", TEXT, 5.3],
  // Miembros (iniciales sobre el avatar)
  ["member-a-on / member-a", "member-a-on", "member-a", TEXT],
  ["member-b-on / member-b", "member-b-on", "member-b", TEXT, 5.35],
  // Foco y borrado irreversible
  ["focus-ring / canvas", "focus-ring", "canvas", GRAPHIC, 4.68],
  ["focus-ring / surface", "focus-ring", "surface", GRAPHIC, 5.1],
  ["blanco / danger-fill", "#FFFFFF", "danger-fill", TEXT, 5.99],
  ["text / negative-tint (hold sin llenar)", "text", "negative-tint", TEXT, 14.73],
  ["negative / negative-tint (borde hold)", "negative", "negative-tint", GRAPHIC],
  // Toast y tooltip
  ["toast-text / toast-bg", "toast-text", "toast-bg", TEXT],
  ["toast-action / toast-bg", "toast-action", "toast-bg", TEXT],
  ["toast-icon / toast-bg", "toast-icon", "toast-bg", GRAPHIC],
];

const DARK_PAIRS: Pair[] = [
  ["text / surface", "text", "surface", TEXT],
  ["text2 / surface", "text2", "surface", TEXT, 6.97],
  ["text3 / surface", "text3", "surface", TEXT, 5.22],
  ["text3 / surface2", "text3", "surface2", TEXT, 4.67],
  ["text3 / canvas", "text3", "canvas", TEXT],
  ["blanco / ember-fill", "#FFFFFF", "ember-fill", TEXT, 4.61],
  ["ember-text / surface", "ember-text", "surface", TEXT, 8.25],
  ["ember-text / ember-50", "ember-text", "ember-50", TEXT, 7.69],
  ["nav activa: ember-text / surface", "ember-text", "surface", TEXT, 8.25],
  ["ember (gráfico) / surface", "ember", "surface", GRAPHIC, 6.88],
  // Excepción de la spec: en oscuro la barra de deudas usa #FF7A2E.
  ["barra deudas: debt-bar (#FF7A2E) / track", "debt-bar", "track", GRAPHIC, 4.28],
  ["barra deudas: debt-bar (#FF7A2E) / surface2", "debt-bar", "surface2", GRAPHIC, 6.17],
  // Estados del presupuesto compartido (fase 10) en oscuro: barra contra su
  // pista y contra la tarjeta; el texto del estado ya está arriba
  // (amber-text, negative-text y text2 sobre surface).
  ["presupuesto ámbar: budget-warn-bar / track", "budget-warn-bar", "track", GRAPHIC, 6.18],
  ["presupuesto rojo: negative / track", "negative", "track", GRAPHIC, 3.84],
  ["presupuesto gris: neutral-bar / track", "neutral-bar", "track", GRAPHIC, 3.25],
  ["presupuesto ámbar: budget-warn-bar / surface", "budget-warn-bar", "surface", GRAPHIC, 9.93],
  ["presupuesto rojo: negative / surface", "negative", "surface", GRAPHIC, 6.17],
  ["presupuesto gris: neutral-bar / surface", "neutral-bar", "surface", GRAPHIC, 5.22],
  ["positive / surface", "positive-text", "surface", TEXT, 9.54],
  ["negative / surface", "negative-text", "surface", TEXT, 6.17],
  ["info / surface", "info-text", "surface", TEXT, 6.46],
  ["violet / surface", "violet-text", "surface", TEXT, 6.58],
  ["amber / surface", "amber-text", "surface", TEXT, 9.93],
  ["pink / surface", "pink-text", "surface", TEXT, 7.33],
  ["teal / surface", "teal-text", "surface", TEXT, 9.62],
  ["olive / surface", "olive-text", "surface", TEXT, 9.39],
  ["slate / surface", "slate-text", "surface", TEXT, 8.47],
  ["positive / tint", "positive-text", "positive-tint", TEXT, 8.39],
  ["negative / tint", "negative-text", "negative-tint", TEXT, 5.84],
  ["amber / tint", "amber-text", "amber-tint", TEXT, 8.54],
  ["info / tint", "info-text", "info-tint", TEXT],
  ["violet / tint", "violet-text", "violet-tint", TEXT],
  ["pink / tint", "pink-text", "pink-tint", TEXT],
  ["teal / tint", "teal-text", "teal-tint", TEXT],
  ["olive / tint", "olive-text", "olive-tint", TEXT],
  ["slate / tint", "slate-text", "slate-tint", TEXT],
  ["income-bar / surface", "income-bar", "surface", GRAPHIC, 13.1],
  ["expense-bar / surface", "expense-bar", "surface", GRAPHIC, 6.88],
  ["member-a-on / member-a", "member-a-on", "member-a", TEXT],
  ["member-b-on / member-b", "member-b-on", "member-b", TEXT, 8.81],
  ["focus-ring / canvas", "focus-ring", "canvas", GRAPHIC],
  ["focus-ring / surface", "focus-ring", "surface", GRAPHIC, 8.25],
  ["blanco / danger-fill", "#FFFFFF", "danger-fill", TEXT, 5.99],
  ["text / negative-tint (hold sin llenar)", "text", "negative-tint", TEXT, 15.56],
  ["negative / negative-tint (borde hold)", "negative", "negative-tint", GRAPHIC],
  ["toast-text / toast-bg", "toast-text", "toast-bg", TEXT],
  ["toast-action / toast-bg", "toast-action", "toast-bg", TEXT],
];

function check(tokens: Record<string, string>, pairs: Pair[]) {
  for (const [label, fg, bg, min, specRatio] of pairs) {
    const ratio = contrastRatio(resolve(tokens, fg), resolve(tokens, bg));
    expect(ratio, `${label}: ${ratio.toFixed(2)} < ${min}`).toBeGreaterThanOrEqual(min);
    if (specRatio !== undefined) {
      expect(
        Math.abs(ratio - specRatio),
        `${label}: ${ratio.toFixed(2)}, la spec dice ${specRatio}`,
      ).toBeLessThanOrEqual(0.01);
    }
  }
}

describe("contraste de tokens", () => {
  it("la fórmula coincide con contrast.py", () => {
    // Valores impresos por `python3 docs/contrast.py`.
    expect(contrastRatio("#FFFFFF", "#C6500B")).toBeCloseTo(4.61, 2);
    expect(contrastRatio("#F26B1D", "#FFFFFF")).toBeCloseTo(3.05, 2);
    expect(contrastRatio("#A6EBCB", "#171719")).toBeCloseTo(13.1, 1);
    expect(mix("#FFFFFF", "#C84F00", 0.9)).toBe("#FAEDE6");
  });

  it("modo claro: todos los pares cumplen la spec", () => {
    check(LIGHT, LIGHT_PAIRS);
  });

  it("modo oscuro: todos los pares cumplen la spec", () => {
    check(DARK, DARK_PAIRS);
  });

  it("el texto del botón 'mantener para borrar' se lee sobre el relleno", () => {
    // Peor caso: rojo gráfico al 28 % sobre el tinte (spec §5).
    const light = mix(LIGHT.negative, LIGHT["negative-tint"], 0.28);
    const dark = mix(DARK.negative, DARK["negative-tint"], 0.28);
    expect(contrastRatio(LIGHT.text, light)).toBeCloseTo(10.45, 2);
    expect(contrastRatio(DARK.text, dark)).toBeCloseTo(9.69, 2);
  });

  it("ninguna variante rechazada por la spec volvió a los tokens", () => {
    // Texto rojo sobre el relleno (3.29 / 3.64) fue rechazado: el label usa text.
    expect(
      contrastRatio(LIGHT["negative-text"], mix(LIGHT.negative, LIGHT["negative-tint"], 0.28)),
    ).toBeLessThan(TEXT);
    // El naranja gráfico nunca es texto ni fondo de texto blanco.
    expect(contrastRatio("#FFFFFF", LIGHT.ember)).toBeLessThan(TEXT);
    expect(LIGHT["ember-text"]).not.toBe(LIGHT.ember);
  });

  it("la barra ámbar del presupuesto: amber-text en claro, el ámbar de siempre en oscuro", () => {
    // Antes, amber #C2821C contra la pista clara daba 2,72 (menos de 3:1).
    expect(LIGHT["budget-warn-bar"]).toBe(LIGHT["amber-text"]);
    expect(DARK["budget-warn-bar"]).toBe(DARK.amber);
    // Gris y rojo no cambian: siguen con sus tokens de siempre.
    expect(contrastRatio(LIGHT["neutral-bar"], LIGHT.track)).toBeCloseTo(4.34, 2);
    expect(contrastRatio(LIGHT.negative, LIGHT.track)).toBeCloseTo(3.29, 2);
    expect(contrastRatio(DARK["neutral-bar"], DARK.track)).toBeCloseTo(3.25, 2);
    expect(contrastRatio(DARK.negative, DARK.track)).toBeCloseTo(3.84, 2);
  });

  it("la barra de deudas usa ember-fill en claro y el naranja gráfico en oscuro", () => {
    expect(LIGHT["debt-bar"]).toBe(LIGHT["ember-fill"]);
    expect(DARK["debt-bar"]).toBe("#FF7A2E");
    expect(DARK["debt-bar"]).toBe(DARK.ember);
  });
});
