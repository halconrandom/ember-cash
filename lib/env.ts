/**
 * Variables de entorno públicas (las que Next puede incrustar en el cliente).
 *
 * Las secretas están en lib/env-server.ts. Este archivo no las nombra: el
 * cliente de Supabase del navegador solo importa getPublicEnv().
 *
 * La validación completa (públicas y secretas) corre al arrancar desde
 * next.config.ts, así que `pnpm dev` y `pnpm build` fallan de inmediato si
 * falta alguna.
 */
import { z } from "zod";

/** Origen de las variables: normalmente `process.env`. */
type EnvSource = Record<string, string | undefined>;

/**
 * ¿Es una llave de servidor de Supabase? (JWT con rol service_role o
 * supabase_admin, o una llave nueva sb_secret_). La anon key y las
 * sb_publishable_ son públicas. Decodifica con atob para funcionar también en
 * el navegador; scripts/secret-scan.mts hace lo mismo para los scripts.
 */
export function isServerSupabaseKey(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.startsWith("sb_secret_")) return true;
  const parts = trimmed.split(".");
  if (parts.length !== 3 || !parts[0].startsWith("eyJ")) return false;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")));
    return payload?.role === "service_role" || payload?.role === "supabase_admin";
  } catch {
    return false;
  }
}

/** Variables públicas: Next.js las incrusta en el bundle del cliente. */
export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  // Si aquí se pegara la service role, quedaría en el bundle de todos los
  // navegadores: se rechaza.
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1)
    .refine((value) => !isServerSupabaseKey(value), "es una llave de servidor"),
});

/** Nombres que nunca deben llevar el prefijo NEXT_PUBLIC_. */
const SECRET_NAME = /SERVICE_ROLE|SECRET|PRIVATE|PASSWORD/i;

/**
 * Revisa TODAS las variables NEXT_PUBLIC_* del entorno (no solo las que usa
 * la app): ninguna puede llamarse como un secreto ni contener una llave de
 * servidor de Supabase. Next las incrusta en el cliente. Corre al arrancar
 * (getServerEnv desde next.config) y nombra la variable sin mostrar su valor.
 */
export function assertNoSecretsInPublicEnv(source: EnvSource): void {
  const bad = Object.entries(source)
    .filter(([key]) => key.startsWith("NEXT_PUBLIC_"))
    .filter(([key, value]) => SECRET_NAME.test(key) || (value && isServerSupabaseKey(value)))
    .map(([key]) => key);
  if (bad.length > 0) {
    throw new EnvError(
      `[Ember Cash] Estas variables NEXT_PUBLIC_ llevan un secreto o una llave de servidor: ${bad.join(", ")}. ` +
        "Todo lo que empieza con NEXT_PUBLIC_ termina en el navegador. Quita el prefijo y, si el valor ya se publicó, rota la llave.",
    );
  }
}

export type PublicEnv = z.infer<typeof publicEnvSchema>;

/** Error propio para distinguir fallos de configuración de otros errores. */
export class EnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvError";
  }
}

/**
 * Valida `source` contra `schema`. Si algo falla, lanza un EnvError que
 * separa las variables que faltan de las que tienen un valor inválido y
 * explica cómo crear .env.local.
 */
export function parseEnv<S extends z.ZodObject>(schema: S, source: EnvSource): z.infer<S> {
  // Las cadenas vacías cuentan como "falta", igual que una variable sin definir.
  const cleaned: EnvSource = {};
  for (const key of Object.keys(schema.shape)) {
    const value = source[key];
    cleaned[key] = value === undefined || value.trim() === "" ? undefined : value;
  }

  const result = schema.safeParse(cleaned);
  if (result.success) return result.data;

  const missing: string[] = [];
  const invalid: string[] = [];
  for (const issue of result.error.issues) {
    const key = String(issue.path[0]);
    if (cleaned[key] === undefined) {
      if (!missing.includes(key)) missing.push(key);
    } else if (!invalid.includes(key)) {
      invalid.push(key);
    }
  }

  const lines = ["[Ember Cash] Configuración de entorno incompleta."];
  if (missing.length > 0) {
    lines.push(`Faltan estas variables: ${missing.join(", ")}.`);
  }
  if (invalid.length > 0) {
    lines.push(`Estas variables tienen un valor inválido: ${invalid.join(", ")}.`);
  }
  lines.push(
    "Copia .env.example a .env.local y completa los valores:",
    "  Mac/Linux:  cp .env.example .env.local",
    "  Windows:    copy .env.example .env.local",
    "Después reinicia el servidor.",
  );
  throw new EnvError(lines.join("\n"));
}

/**
 * Devuelve las variables públicas validadas. Se leen una por una de forma
 * literal porque Next.js solo incrusta en el cliente las referencias exactas a
 * `process.env.NEXT_PUBLIC_*`. Es una función (no una constante) para que
 * importar este módulo nunca lance por sí solo.
 */
export function getPublicEnv(): PublicEnv {
  return parseEnv(publicEnvSchema, {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}
