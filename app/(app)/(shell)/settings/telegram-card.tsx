/**
 * Tarjeta Conexiones. No se pinta si faltan las variables del bot, y no
 * muestra el error de la base: sin fila, simplemente no está vinculado.
 */
import { getTranslations } from "next-intl/server";

import { Card, CardTitle } from "@/components/ui/card";
import { getServerEnv } from "@/lib/env-server";
import { createClient } from "@/lib/supabase/server";
import { isTelegramConfigured } from "@/lib/telegram/config";

import { TelegramConnect } from "./telegram-connect";

/** Sección de Ajustes. La envuelve un Suspense porque lee la sesión. */
export async function TelegramCard() {
  if (!isTelegramConfigured(getServerEnv())) return null;
  const t = await getTranslations("settings");
  const supabase = await createClient();
  const { data, error } = await supabase.from("telegram_links").select("user_id").maybeSingle();
  return (
    <Card className="space-y-3">
      <CardTitle>{t("connections")}</CardTitle>
      <TelegramConnect linked={!error && data !== null} />
    </Card>
  );
}
