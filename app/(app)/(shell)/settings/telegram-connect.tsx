"use client";

/**
 * Conexión de Telegram en Ajustes. Un solo botón primario (Vincular).
 * Desvincular es secundario. El enlace al chat no es otro botón de marca.
 */
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

import { createTelegramLink, unlinkTelegram } from "./telegram-actions";

/** Estado del vínculo y las acciones. `linked` llega del servidor. */
export function TelegramConnect({ linked }: { linked: boolean }) {
  const t = useTranslations("settings");
  const [isLinked, setLinked] = useState(linked);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function link() {
    setError(null);
    startTransition(async () => {
      const result = await createTelegramLink();
      if (result.ok) {
        setUrl(result.url);
        return;
      }
      setUrl(null);
      setError(
        result.error === "rate_limited"
          ? t("telegramRateLimited")
          : result.error === "unavailable"
            ? t("telegramUnavailable")
            : t("telegramFailed"),
      );
    });
  }

  function unlink() {
    setError(null);
    startTransition(async () => {
      const result = await unlinkTelegram();
      if (!result.ok) {
        setError(t("telegramUnlinkFailed"));
        return;
      }
      setLinked(false);
      setUrl(null);
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-callout text-ink-2 font-semibold">{t("telegramTitle")}</p>
      <p className="text-body text-ink-2">{t("telegramBody")}</p>
      {isLinked ? <p className="text-body text-ink">{t("telegramLinked")}</p> : null}
      {url ? (
        <div className="space-y-2">
          <a
            href={url}
            className="text-body text-ember-text font-medium break-all underline-offset-4 hover:underline"
          >
            {url}
          </a>
          <p className="text-body text-ink-2">{t("telegramExpires")}</p>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-callout text-negative-text flex items-start gap-2">
          <Icon name="exclamation" size={16} />
          {error}
        </p>
      ) : null}
      {isLinked ? (
        <Button type="button" variant="secondary" disabled={pending} onClick={unlink}>
          {t("telegramUnlink")}
        </Button>
      ) : (
        <Button type="button" variant="primary" disabled={pending} onClick={link}>
          {t("telegramLink")}
        </Button>
      )}
    </div>
  );
}
