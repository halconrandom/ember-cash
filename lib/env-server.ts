/**
 * Variables de entorno que solo existen en el servidor.
 *
 * Este módulo no se importa desde componentes de cliente. La service role y
 * el secreto del cron no llevan prefijo NEXT_PUBLIC_, así que Next no los
 * incrusta en el bundle; separarlos de lib/env.ts evita además que el código
 * del cliente mencione esos nombres.
 */
import { assertNoSecretsInPublicEnv, EnvError, parseEnv, publicEnvSchema } from "./env";

import { z } from "zod";

/** Variables de servidor: nunca deben enviarse al navegador. */
export const serverEnvSchema = publicEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // Al menos 32 caracteres: `openssl rand -hex 32` da 64 (auditoría B-02).
  CRON_SECRET: z.string().min(32),
  // Opcionales. Si falta el token o el secreto, el bot no existe: Ajustes
  // oculta Conexiones y /api/telegram/webhook responde 404. Un secreto
  // presente pero corto sí impide arrancar (igual que CRON_SECRET).
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(32).optional(),
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
  assertNoSecretsInPublicEnv(source);
  const parsed = parseEnv(serverEnvSchema, source);
  // Una opcional ausente no debe quedar como clave undefined: si no, el
  // objeto ya no es igual al conjunto de variables obligatorias.
  if (parsed.TELEGRAM_BOT_TOKEN === undefined) delete parsed.TELEGRAM_BOT_TOKEN;
  if (parsed.TELEGRAM_WEBHOOK_SECRET === undefined) delete parsed.TELEGRAM_WEBHOOK_SECRET;
  return parsed;
}
