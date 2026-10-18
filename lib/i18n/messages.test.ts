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

  it("el consentimiento usa el texto legal, sin reescribirlo", () => {
    expect(es.auth.consent).toBe(
      "Soy mayor de 18 años, leí el <privacy>aviso de privacidad</privacy> y los <terms>términos</terms>, y autorizo el tratamiento de mis datos.",
    );
    expect(en.auth.consent).toBe(
      "I am over 18, I read the <privacy>privacy notice</privacy> and the <terms>terms</terms>, and I authorize the processing of my data.",
    );
    expect(es.auth.consentError).toBe("Marca esta casilla para crear tu cuenta.");
    expect(en.auth.consentError).toBe("Check this box to create your account.");
    expect(es.auth).not.toHaveProperty("loginNotice");
    expect(en.auth).not.toHaveProperty("loginNotice");
    expect(es.legal.versionLine).toBe("Versión {version} · Actualizado el {date}");
    expect(en.legal.versionLine).toBe("Version {version} · Updated {date}");
    expect(es.legal).not.toHaveProperty("draftNotice");
    expect(en.legal).not.toHaveProperty("draftNotice");
    expect(es.legal.privacy.intro).toBe(
      "Ember Cash es una app personal de finanzas. Aquí te contamos, sin vueltas, qué datos guardamos y qué hacemos con ellos.",
    );
    expect(en.legal.privacy.intro).toBe(
      "Ember Cash is a personal finance app. Here is what data we keep and what we do with it, plain and simple.",
    );
    expect(es.legal.privacy).not.toHaveProperty("betaTitle");
    expect(en.legal.privacy).not.toHaveProperty("betaBody");
    expect(es.legal.terms.betaBody).toBe(
      "Se ofrece tal cual, sin garantía de que funcione siempre ni de que no falle.",
    );
    expect(en.legal.terms.betaBody).toBe(
      "It is provided as is, with no guarantee that it will always work or never fail.",
    );
    expect(es.legal.terms).not.toHaveProperty("betaTitle");
    expect(es.legal.terms).not.toHaveProperty("testTitle");
    expect(en.legal.terms).not.toHaveProperty("testBody");
    expect(es.legal.privacy.sharedTitle).toBe("Gastos compartidos del hogar");
    expect(en.legal.privacy.sharedTitle).toBe("Shared household expenses");
    expect(es.legal.privacy.sharedBody).toBe(
      "Si borras tu cuenta, los gastos que compartiste con tu hogar se quedan para que los demás miembros puedan seguir con sus cuentas, pero sin tu nombre ni tu correo: aparecen como Usuario eliminado.",
    );
    expect(en.legal.privacy.sharedBody).toBe(
      "If you delete your account, the expenses you shared with your household stay so the other members can keep their books straight, but without your name or email: they show up as Deleted user.",
    );
    expect(es.legal.privacy.contactBody).toContain("{contactEmail}");
    expect(en.legal.privacy.contactBody).toContain("{contactEmail}");
    expect(es.legal.terms.contactBody).toContain("{contactEmail}");
    expect(en.legal.terms.contactBody).toContain("{contactEmail}");
  });
});
