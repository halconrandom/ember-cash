"use client";

/**
 * Botón para que el owner genere un link de invitación y lo copie.
 * Cada clic crea una invitación nueva (de un solo uso, vence en 7 días).
 */
import { useState, useTransition } from "react";

import { ui } from "@/components/provisional/styles";

import { createInviteLink } from "./actions";

export function InviteLink({ householdId }: { householdId: string }) {
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
      <button type="button" className={ui.primaryButton} onClick={generate} disabled={pending}>
        {pending ? "Generando..." : url ? "Generar otro link" : "Generar link de invitación"}
      </button>

      {url && (
        <div className="space-y-2">
          <label htmlFor="invite-url" className={ui.label}>
            Link de invitación
          </label>
          <div className="flex gap-2">
            <input
              id="invite-url"
              readOnly
              value={url}
              className={`${ui.input} font-mono text-xs`}
              onFocus={(e) => e.currentTarget.select()}
            />
            <button type="button" className={ui.secondaryButton} onClick={copy}>
              {copied ? "Copiado" : "Copiar"}
            </button>
          </div>
          <p className={ui.helper}>Sirve una sola vez y vence en 7 días.</p>
        </div>
      )}

      {error && (
        <p role="alert" className={ui.error}>
          {error}
        </p>
      )}
    </div>
  );
}
