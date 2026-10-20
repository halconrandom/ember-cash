/**
 * El bot está activo solo si el servidor tiene el token y el secreto del
 * webhook. Si falta uno, Ajustes oculta la sección y la ruta responde 404.
 * No son obligatorios: la app arranca igual sin ellos.
 */
import type { ServerEnv } from "@/lib/env-server";

type TelegramEnv = ServerEnv & { TELEGRAM_BOT_TOKEN: string; TELEGRAM_WEBHOOK_SECRET: string };

/** True cuando las dos variables están y el secreto mide al menos 32. */
export function isTelegramConfigured(env: ServerEnv): env is TelegramEnv {
  return (
    typeof env.TELEGRAM_BOT_TOKEN === "string" &&
    env.TELEGRAM_BOT_TOKEN.length > 0 &&
    typeof env.TELEGRAM_WEBHOOK_SECRET === "string" &&
    env.TELEGRAM_WEBHOOK_SECRET.length >= 32
  );
}
