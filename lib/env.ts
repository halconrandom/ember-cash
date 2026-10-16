/**
 * Validación de variables de entorno con zod.
 *
 * - `getPublicEnv()`: variables NEXT_PUBLIC_* que pueden llegar al navegador.
 * - `getServerEnv()`: todas las variables, incluidas las secretas. Solo se
 *   puede llamar en el servidor; en el navegador lanza un error para evitar
 *   que SUPABASE_SERVICE_ROLE_KEY o CRON_SECRET terminen en el cliente.
 *
 * La validación completa se ejecuta al arrancar desde next.config.ts, así que
 * `pnpm dev` y `pnpm build` fallan de inmediato si falta alguna variable.
 */
import { z } from "zod";

/** Variables públicas: Next.js las incrusta en el bundle del cliente. */
export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

/** Variables de servidor: nunca deben enviarse al navegador. */
export const serverEnvSchema = publicEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  CRON_SECRET: z.string().min(1),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Origen de las variables: normalmente `process.env`. */
type EnvSource = Record<string, string | undefined>;

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

/** Devuelve todas las variables validadas. Solo para código de servidor. */
export function getServerEnv(source: EnvSource = process.env): ServerEnv {
  if (typeof window !== "undefined") {
    throw new EnvError(
      "[Ember Cash] getServerEnv() se llamó en el navegador. Las variables secretas solo existen en el servidor.",
    );
  }
  return parseEnv(serverEnvSchema, source);
}
