"use client";

/**
 * Formulario de la pantalla que bloquea la app. Sin la casilla no llama a
 * acceptConsent y muestra auth.consentError. Con ella, guarda la versión
 * vigente y pide al layout que vuelva a pintar la app.
 */
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { acceptConsent } from "@/lib/legal/actions";

import { ConsentFields } from "./consent-fields";

type GateError = "consent" | "rateLimited" | "saveFailed";

/** Casilla, error y el único botón primario de esta pantalla. */
export function ConsentForm() {
  const t = useTranslations("auth");
  const rate = useTranslations("rateLimit");
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<GateError | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!checked) {
      setError("consent");
      return;
    }
    setError(null);
    setPending(true);
    try {
      const result = await acceptConsent();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
      <ConsentFields
        checked={checked}
        onChange={(value) => {
          setChecked(value);
          if (value) setError((current) => (current === "consent" ? null : current));
        }}
        showError={error === "consent"}
      />
      {error === "rateLimited" && (
        <p role="alert" className="text-callout text-negative-text">
          {rate("write")}
        </p>
      )}
      {error === "saveFailed" && (
        <p role="alert" className="text-callout text-negative-text">
          {t("consentSaveFailed")}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {t("consentSubmit")}
      </Button>
    </form>
  );
}
