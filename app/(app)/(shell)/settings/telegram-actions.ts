"use server";

/**
 * Vincular y desvincular Telegram desde Ajustes. El código lo crea la base
 * con auth.uid(); el token del bot no sale de esta acción. url es t.me,
 * para copiarlo al teléfono. webUrl abre Telegram Web: t.me intenta tg://
 * y el navegador lo rechaza si no hay app instalada.
 */
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/session";
import { getServerEnv } from "@/lib/env-server";
import { isRateLimitedDbError } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { telegramBotUsername } from "@/lib/telegram/api";
import { isTelegramConfigured } from "@/lib/telegram/config";
import { telegramLinkUrls } from "@/lib/telegram/links";

const CODE = /^[a-f0-9]{64}$/;

export type TelegramLinkResult =
  | { ok: true; url: string; webUrl: string }
  | { ok: false; error: "unavailable" | "rate_limited" | "failed" };

/** Pide un código y arma el enlace para abrir el chat del bot. */
export async function createTelegramLink(): Promise<TelegramLinkResult> {
  await requireUser();
  const env = getServerEnv();
  if (!isTelegramConfigured(env)) return { ok: false, error: "unavailable" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_telegram_link_code");
  if (error) {
    return { ok: false, error: isRateLimitedDbError(error) ? "rate_limited" : "failed" };
  }
  if (typeof data !== "string" || !CODE.test(data)) return { ok: false, error: "failed" };

  const username = await telegramBotUsername(env.TELEGRAM_BOT_TOKEN);
  if (!username) return { ok: false, error: "unavailable" };
  const links = telegramLinkUrls(username, data);
  if (!links) return { ok: false, error: "failed" };

  revalidatePath("/settings");
  return { ok: true, url: links.appUrl, webUrl: links.webUrl };
}

/** Borra el vínculo propio. La política solo deja borrar la fila de quien entra. */
export async function unlinkTelegram(): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("telegram_links").delete().eq("user_id", user.id);
  if (error) return { ok: false };
  revalidatePath("/settings");
  return { ok: true };
}
