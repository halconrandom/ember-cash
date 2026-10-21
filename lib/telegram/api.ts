/**
 * Llamadas a la API de Telegram desde el servidor. El token va en la ruta
 * y no se registra: un error de red se anota solo como el método y el estado.
 */
import "server-only";

import { logServerError } from "@/lib/log/server";

import type { OutboundButton } from "./types";

const USERNAME = /^[A-Za-z0-9_]{5,32}$/;

/** POST a un método. Null si Telegram no contestó ok. No lanza la URL. */
async function call(
  token: string,
  method: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      logServerError("telegram.api", new Error(`${method} HTTP ${response.status}`));
      return null;
    }
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" || (payload as { ok?: unknown }).ok !== true) {
      logServerError("telegram.api", new Error(`${method} rejected`));
      return null;
    }
    return payload as Record<string, unknown>;
  } catch (error) {
    logServerError("telegram.api", error instanceof Error ? new Error(`${method} network`) : error);
    return null;
  }
}

/** Usuario público del bot, para armar t.me/<bot>?start=<código>. */
export async function telegramBotUsername(token: string): Promise<string | null> {
  const payload = await call(token, "getMe", {});
  const result = payload?.result;
  const username =
    result && typeof result === "object" ? (result as { username?: unknown }).username : undefined;
  return typeof username === "string" && USERNAME.test(username) ? username : null;
}

/** Un botón por fila: con dos (Guardar/Cancelar) o con los hasta 5 de /pagar. */
function keyboardOf(buttons: OutboundButton[]) {
  return { inline_keyboard: buttons.map((button) => [{ text: button.label, callback_data: button.data }]) };
}

/**
 * Envía un mensaje. Los botones son texto nuestro, no lo que escribió la
 * persona. `forceReply` es para "¿Cuánto abonaste/aportaste?" (/abono,
 * /ahorro): no se combina con botones, Telegram solo admite un
 * reply_markup por mensaje.
 */
export async function telegramSend(
  token: string,
  chatId: number,
  text: string,
  buttons?: OutboundButton[],
  options?: { forceReply?: boolean },
): Promise<void> {
  await call(token, "sendMessage", {
    chat_id: chatId,
    text,
    ...(buttons
      ? { reply_markup: keyboardOf(buttons) }
      : options?.forceReply
        ? { reply_markup: { force_reply: true } }
        : {}),
  });
}

/** Cierra el reloj del botón inline. */
export async function telegramAnswer(token: string, callbackId: string): Promise<void> {
  await call(token, "answerCallbackQuery", { callback_query_id: callbackId });
}

/**
 * Reemplaza el texto. Sin botones, los quita (para que no se pulse dos
 * veces después de Guardar o Cancelar); con botones, pone los nuevos (para
 * pasar de la lista de /pagar al Guardar/Cancelar de ese cobro).
 */
export async function telegramEdit(
  token: string,
  chatId: number,
  messageId: number,
  text: string,
  buttons?: OutboundButton[],
): Promise<void> {
  await call(token, "editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    reply_markup: buttons ? keyboardOf(buttons) : { inline_keyboard: [] },
  });
}
