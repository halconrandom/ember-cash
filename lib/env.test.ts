// Tests de la validación de variables de entorno.
import { describe, expect, it } from "vitest";

import { getServerEnv } from "./env-server";
import { assertNoSecretsInPublicEnv, EnvError, getPublicEnv, isServerSupabaseKey } from "./env";

/** Conjunto completo y válido de variables para partir en cada test. */
const valid = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  NEXT_PUBLIC_CONTACT_EMAIL: "contacto@example.com",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  CRON_SECRET: "test-cron-secret-not-real-0000000000",
};

/** JWT falso con el rol pedido (firma de relleno; no es una llave real). */
function fakeJwt(role: string): string {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "HS256", typ: "JWT" })}.${part({ iss: "supabase", role })}.${"x".repeat(43)}`;
}

describe("getServerEnv", () => {
  it("devuelve las variables cuando están todas", () => {
    expect(getServerEnv(valid)).toEqual(valid);
  });

  it("dice qué variable falta y cómo crear .env.local", () => {
    const rest: Partial<typeof valid> = { ...valid };
    delete rest.CRON_SECRET;
    expect(() => getServerEnv(rest)).toThrow(EnvError);
    expect(() => getServerEnv(rest)).toThrow(/Faltan estas variables: CRON_SECRET\./);
    expect(() => getServerEnv(rest)).toThrow(/cp \.env\.example \.env\.local/);
  });

  it("trata una cadena vacía como variable faltante", () => {
    expect(() => getServerEnv({ ...valid, SUPABASE_SERVICE_ROLE_KEY: "  " })).toThrow(
      /Faltan estas variables: SUPABASE_SERVICE_ROLE_KEY\./,
    );
  });

  it("lista todas las que faltan si no hay ninguna", () => {
    expect(() => getServerEnv({})).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_CONTACT_EMAIL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET/,
    );
  });

  it("el bot de Telegram es opcional y solo cuenta si están las dos variables", () => {
    expect(getServerEnv(valid)).toEqual(valid);
    expect(
      getServerEnv({ ...valid, TELEGRAM_BOT_TOKEN: "  ", TELEGRAM_WEBHOOK_SECRET: "" }),
    ).toEqual(valid);
    const secret = "a".repeat(32);
    expect(
      getServerEnv({ ...valid, TELEGRAM_BOT_TOKEN: "123:abc", TELEGRAM_WEBHOOK_SECRET: secret }),
    ).toMatchObject({ TELEGRAM_BOT_TOKEN: "123:abc", TELEGRAM_WEBHOOK_SECRET: secret });
  });

  it("un secreto de Telegram corto no arranca", () => {
    expect(() =>
      getServerEnv({ ...valid, TELEGRAM_BOT_TOKEN: "123:abc", TELEGRAM_WEBHOOK_SECRET: "corto" }),
    ).toThrow(/valor inválido: TELEGRAM_WEBHOOK_SECRET/);
  });

  it("exige un correo de contacto y rechaza uno que no lo es", () => {
    expect(() => getServerEnv({ ...valid, NEXT_PUBLIC_CONTACT_EMAIL: "" })).toThrow(
      /Faltan estas variables: NEXT_PUBLIC_CONTACT_EMAIL/,
    );
    expect(() => getServerEnv({ ...valid, NEXT_PUBLIC_CONTACT_EMAIL: "no-es-correo" })).toThrow(
      /valor inválido: NEXT_PUBLIC_CONTACT_EMAIL/,
    );
  });

  it("separa las variables con valor inválido", () => {
    expect(() => getServerEnv({ ...valid, NEXT_PUBLIC_SUPABASE_URL: "no-es-url" })).toThrow(
      /valor inválido: NEXT_PUBLIC_SUPABASE_URL/,
    );
  });
});

describe("getPublicEnv", () => {
  it("lee las variables públicas de process.env", () => {
    // Vitest define valores falsos en vitest.config.mts.
    expect(getPublicEnv().NEXT_PUBLIC_SUPABASE_URL).toBe("http://127.0.0.1:54321");
    expect(getPublicEnv().NEXT_PUBLIC_CONTACT_EMAIL).toBe("contacto@example.com");
  });
});

describe("secretos fuera de NEXT_PUBLIC_ (auditoría, fase 1)", () => {
  it("CRON_SECRET necesita al menos 32 caracteres", () => {
    expect(() => getServerEnv({ ...valid, CRON_SECRET: "corto" })).toThrow(
      /valor inválido: CRON_SECRET/,
    );
    expect(getServerEnv({ ...valid, CRON_SECRET: "a".repeat(32) }).CRON_SECRET).toHaveLength(32);
  });

  it("la anon key no puede ser la service role (terminaría en el navegador)", () => {
    expect(() =>
      getServerEnv({ ...valid, NEXT_PUBLIC_SUPABASE_ANON_KEY: fakeJwt("service_role") }),
    ).toThrow(EnvError);
    expect(getServerEnv({ ...valid, NEXT_PUBLIC_SUPABASE_ANON_KEY: fakeJwt("anon") })).toBeTruthy();
  });

  it("ninguna NEXT_PUBLIC_* puede llamarse como un secreto", () => {
    for (const name of [
      "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY",
      "NEXT_PUBLIC_CRON_SECRET",
      "NEXT_PUBLIC_PRIVATE_TOKEN",
      "NEXT_PUBLIC_DB_PASSWORD",
    ]) {
      expect(() => assertNoSecretsInPublicEnv({ ...valid, [name]: "x" })).toThrow(name);
    }
  });

  it("ninguna NEXT_PUBLIC_* puede contener una llave de servidor, aunque tenga otro nombre", () => {
    expect(() =>
      assertNoSecretsInPublicEnv({ ...valid, NEXT_PUBLIC_ALGO: fakeJwt("service_role") }),
    ).toThrow(/NEXT_PUBLIC_ALGO/);
    expect(() =>
      assertNoSecretsInPublicEnv({
        ...valid,
        NEXT_PUBLIC_ALGO: ["sb", "secret", "abcdefghijkl"].join("_"),
      }),
    ).toThrow(/NEXT_PUBLIC_ALGO/);
  });

  it("el error nombra la variable pero no muestra su valor", () => {
    const value = fakeJwt("service_role");
    expect(() => assertNoSecretsInPublicEnv({ NEXT_PUBLIC_ALGO: value })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining(value) }),
    );
  });

  it("isServerSupabaseKey reconoce las llaves de servidor y deja pasar las públicas", () => {
    expect(isServerSupabaseKey(fakeJwt("service_role"))).toBe(true);
    expect(isServerSupabaseKey(fakeJwt("supabase_admin"))).toBe(true);
    expect(isServerSupabaseKey(fakeJwt("anon"))).toBe(false);
    expect(isServerSupabaseKey(["sb", "publishable", "abcdefghijkl"].join("_"))).toBe(false);
    expect(isServerSupabaseKey("anon")).toBe(false);
  });
});
