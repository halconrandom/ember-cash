/**
 * Variables de entorno que solo existen en el servidor.
 *
 * Este módulo no se importa desde componentes de cliente. La service role y
 * el secreto del cron no llevan prefijo NEXT_PUBLIC_, así que Next no los
 * incrusta en el bundle; separarlos de lib/env.ts evita además que el código
 * del cliente mencione esos nombres.
 */
import { EnvError, parseEnv, publicEnvSchema } from "./env";

import { z } from "zod";

/** Variables de servidor: nunca deben enviarse al navegador. */
export const serverEnvSchema = publicEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  CRON_SECRET: z.string().min(1),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

type EnvSource = Record<string, string | undefined>;

/** Devuelve todas las variables validadas. Solo para código de servidor. */
export function getServerEnv(source: EnvSource = process.env): ServerEnv {
  if (typeof window !== "undefined") {
    throw new EnvError(
      "[Ember Cash] getServerEnv() se llamó en el navegador. Las variables secretas solo existen en el servidor.",
    );
  }
  return parseEnv(serverEnvSchema, source);
}
