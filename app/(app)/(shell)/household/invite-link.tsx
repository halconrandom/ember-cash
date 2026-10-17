"use client";

/**
 * Botón para que quien administra el hogar genere un enlace de invitación y
 * lo copie. Cada clic crea una invitación nueva (de un solo uso, vence en 7 días).
 */
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

import { createInviteLink } from "./actions";

export function InviteLink({ householdId }: { householdId: string }) {
  const t = useTranslations("household");
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function generate() {
    setError(null);
    setCopied(false);
    startTransition(async () => {
      const result = await createInviteLink(householdId);
      if (result.ok) setUrl(result.url);
      else setError(result.error);
    });
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Sin permiso de portapapeles: el usuario puede copiarlo a mano.
      setCopied(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button icon="user-add" onClick={generate} disabled={pending}>
        {pending ? t("inviteGenerating") : url ? t("inviteRegenerate") : t("inviteGenerate")}
      </Button>

      {url && (
        <div className="space-y-2">
          <label htmlFor="invite-url" className="text-callout text-ink-2 block font-semibold">
            {t("inviteLabel")}
          </label>
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <Input
                id="invite-url"
                readOnly
                value={url}
                onFocus={(e) => e.currentTarget.select()}
              />
            </div>
            <Button variant="secondary" size="lg" onClick={copy}>
              {copied ? t("copied") : t("copy")}
            </Button>
          </div>
          <p className="text-footnote text-ink-3">{t("inviteHint")}</p>
        </div>
      )}

      {error && (
        <p role="alert" className="text-callout text-negative-text">
          {error}
        </p>
      )}
    </div>
  );
}
