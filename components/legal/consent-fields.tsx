"use client";

/**
 * Casilla de consentimiento y la línea de versión. La usan el login y la
 * pantalla que bloquea la app. El texto sale de auth.consent (etiquetas
 * <privacy> y <terms>) y de legal.versionLine. Los enlaces abren /privacidad
 * y /terminos, que son públicas.
 */
import { useTranslations } from "next-intl";
import { useId, type ReactNode } from "react";

import { useFormat } from "@/lib/i18n/use-format";
import { LEGAL_VERSION, LEGAL_VERSION_DATE } from "@/lib/legal/version";

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Muestra auth.consentError. La casilla no se envió marcada. */
  showError: boolean;
};

/** Enlace del texto rico. Parar el clic evita que la casilla cambie al seguir el enlace. */
function LegalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="text-ember-text font-medium underline-offset-4 hover:underline"
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </a>
  );
}

/** Casilla obligatoria, con la versión del texto que se está aceptando. */
export function ConsentFields({ checked, onChange, showError }: Props) {
  const t = useTranslations("auth");
  const legal = useTranslations("legal");
  const format = useFormat();
  const errorId = useId();

  return (
    <div className="space-y-2">
      <p className="text-footnote text-ink-2">
        {legal("versionLine", {
          version: LEGAL_VERSION,
          date: format.date(LEGAL_VERSION_DATE, "long"),
        })}
      </p>
      <label className="text-callout text-ink flex items-start gap-3">
        <input
          type="checkbox"
          name="consent"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          aria-invalid={showError || undefined}
          aria-describedby={showError ? errorId : undefined}
          className="mt-0.5 size-5 shrink-0 accent-[var(--ember-fill)]"
        />
        <span>
          {t.rich("consent", {
            privacy: (chunks) => <LegalLink href="/privacidad">{chunks}</LegalLink>,
            terms: (chunks) => <LegalLink href="/terminos">{chunks}</LegalLink>,
          })}
        </span>
      </label>
      {showError && (
        <p id={errorId} role="alert" className="text-callout text-negative-text">
          {t("consentError")}
        </p>
      )}
    </div>
  );
}
