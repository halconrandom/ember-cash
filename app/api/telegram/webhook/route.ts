/**
 * POST /api/telegram/webhook
 * Telegram llama esta ruta con el encabezado X-Telegram-Bot-Api-Secret-Token.
 * Si el bot no está configurado, responde 404. Si el secreto no coincide,
 * 401, comparado en tiempo constante. El resto responde 200: un 5xx haría
 * que Telegram reintente el mismo update.
 *
 * No se declara `runtime`: con cacheComponents Next rechaza esa opción.
 * El import de node:crypto deja la ruta en Node, igual que los cron.
 */
import { timingSafeEqual } from "node:crypto";

import { getServerEnv } from "@/lib/env-server";
import { logServerError } from "@/lib/log/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { telegramAnswer, telegramEdit, telegramSend } from "@/lib/telegram/api";
import { isTelegramConfigured } from "@/lib/telegram/config";
import { telegramGateway } from "@/lib/telegram/db";
import { handleTelegramUpdate } from "@/lib/telegram/handle";

/** Compara el secreto del encabezado sin salir en el primer byte distinto. */
function authorized(header: string | null, secret: string): boolean {
  const received = Buffer.from(header ?? "");
  const expected = Buffer.from(secret);
  if (received.length !== expected.length) {
    timingSafeEqual(expected, expected);
    return false;
  }
  return timingSafeEqual(received, expected);
}

export async function POST(request: Request) {
  let env;
  try {
    env = getServerEnv();
  } catch (error) {
    logServerError("telegram.webhook.env", error);
    return new Response(null, { status: 404 });
  }
  if (!isTelegramConfigured(env)) {
    return new Response(null, { status: 404 });
  }
  const header = request.headers.get("x-telegram-bot-api-secret-token");
  if (!authorized(header, env.TELEGRAM_WEBHOOK_SECRET)) {
    return Response.json({ ok: false }, { status: 401 });
  }

  let update: unknown;
  try {
    update = await request.json();
  } catch (error) {
    logServerError("telegram.webhook.json", error);
    return Response.json({ ok: true });
  }

  const token = env.TELEGRAM_BOT_TOKEN;
  try {
    await handleTelegramUpdate(update, telegramGateway(createAdminClient()), {
      send: (chatId, text, buttons) => telegramSend(token, chatId, text, buttons),
      answer: (callbackId) => telegramAnswer(token, callbackId),
      edit: (chatId, messageId, text) => telegramEdit(token, chatId, messageId, text),
    });
  } catch (error) {
    logServerError("telegram.webhook", error);
  }
  return Response.json({ ok: true });
}
