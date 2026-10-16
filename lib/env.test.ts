// Tests de la validación de variables de entorno.
import { describe, expect, it } from "vitest";

import { EnvError, getPublicEnv, getServerEnv } from "./env";

/** Conjunto completo y válido de variables para partir en cada test. */
const valid = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  CRON_SECRET: "cron",
};

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
      /NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET/,
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
  });
});
