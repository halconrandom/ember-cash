// Las claves de messages/es.json y messages/en.json deben ser las mismas:
// cada texto existe en los dos idiomas. Falla mostrando las que faltan.
import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import es from "@/messages/es.json";

/** Aplana {a: {b: "x"}} a ["a.b"]. */
function keys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object"
      ? keys(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );
}

/** Variables {nombre} y etiquetas <tag> de un mensaje. */
function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}|<(\w+)>/g)].map((m) => m[1] ?? `<${m[2]}>`).sort();
}

function get(obj: Record<string, unknown>, path: string): string {
  return path
    .split(".")
    .reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], obj) as string;
}

describe("messages", () => {
  const esKeys = keys(es);
  const enKeys = keys(en);

  it("toda clave de es existe en en", () => {
    expect(esKeys.filter((k) => !enKeys.includes(k))).toEqual([]);
  });

  it("toda clave de en existe en es", () => {
    expect(enKeys.filter((k) => !esKeys.includes(k))).toEqual([]);
  });

  it("ningún texto está vacío", () => {
    expect(esKeys.filter((k) => !get(es, k).trim())).toEqual([]);
    expect(enKeys.filter((k) => !get(en, k).trim())).toEqual([]);
  });

  it("las variables y etiquetas coinciden entre idiomas", () => {
    const mismatched = esKeys.filter(
      (k) => placeholders(get(es, k)).join() !== placeholders(get(en, k)).join(),
    );
    expect(mismatched).toEqual([]);
  });
});
