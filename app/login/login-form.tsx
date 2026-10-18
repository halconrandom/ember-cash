"use client";

/**
 * Formulario de login. Google redirige a /auth/callback; el enlace mágico
 * llega por correo y entra por /auth/confirm (según la plantilla de Supabase).
 * Un solo botón primario: "Enviar enlace mágico". Google es secundario.
 * La casilla es obligatoria: sin ella no se abre Google ni se envía el correo.
 */
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { ConsentFields } from "@/components/legal/consent-fields";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { magicLinkFailure } from "@/lib/auth/magic-link";
import { createClient } from "@/lib/supabase/client";

/** Claves de login.errors. */
type ErrorKey =
  "invalidEmail" | "googleFailed" | "rateLimited" | "sendFailed" | "callback" | "link";

type Props = {
  /** Ruta interna a la que volver después del login. */
  next: string;
  /** Error que llega en la URL (por ejemplo, un enlace vencido). */
  initialError: "callback" | "link" | null;
};

export function LoginForm({ next, initialError }: Props) {
  const t = useTranslations("login");
  const auth = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [consentMissing, setConsentMissing] = useState(false);
  const [pending, setPending] = useState<"google" | "email" | null>(null);
  const [error, setError] = useState<ErrorKey | null>(initialError);
  const [emailError, setEmailError] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  /** URL de retorno, conservando `next`. */
  const callbackUrl = () =>
    `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function signInWithGoogle() {
    // Sin la casilla no se abre Google y no se crea la cuenta.
    if (!accepted) {
      setConsentMissing(true);
      return;
    }
    setConsentMissing(false);
    setPending("google");
    setError(null);
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl() },
    });
    // Si todo va bien el navegador ya está saliendo hacia Google.
    if (error) {
      setError("googleFailed");
      setPending(null);
    }
  }

  async function sendMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = email.trim();
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address);
    setEmailError(!emailOk);
    // Sin la casilla no se envía el enlace y no se crea la cuenta.
    if (!accepted) {
      setConsentMissing(true);
      return;
    }
    setConsentMissing(false);
    if (!emailOk) return;
    setPending("email");
    setError(null);
    const { error } = await createClient().auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: callbackUrl(), shouldCreateUser: true },
    });
    setPending(null);
    // Mismo resultado si el correo ya tenía cuenta o si se acaba de crear.
    const failure = magicLinkFailure(error);
    if (failure) {
      setError(failure);
      return;
    }
    setSentTo(address);
  }

  if (sentTo) {
    return (
      <div className="mt-6 space-y-3" aria-live="polite">
        <p className="text-body text-positive-text font-semibold">{t("sent", { email: sentTo })}</p>
        <p className="text-callout text-ink-2">{t("sentHint")}</p>
        <button
          type="button"
          className="text-body text-ember-text font-medium underline-offset-4 hover:underline"
          onClick={() => setSentTo(null)}
        >
          {t("otherEmail")}
        </button>
        <p className="text-footnote text-ink-2">{auth("loginNotice")}</p>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-5">
      <ConsentFields
        checked={accepted}
        onChange={(value) => {
          setAccepted(value);
          if (value) setConsentMissing(false);
        }}
        showError={consentMissing}
      />
      <Button
        variant="secondary"
        className="w-full"
        onClick={signInWithGoogle}
        disabled={pending !== null}
      >
        {pending === "google" ? t("googleOpening") : t("google")}
      </Button>

      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="bg-border h-px flex-1" />
        <span className="text-footnote text-ink-3">{t("orEmail")}</span>
        <span className="bg-border h-px flex-1" />
      </div>

      <form onSubmit={sendMagicLink} className="space-y-4" noValidate>
        <Field
          label={t("emailLabel")}
          type="email"
          autoComplete="email"
          placeholder={t("emailPlaceholder")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={emailError ? t("errors.invalidEmail") : null}
        />
        <Button type="submit" className="w-full" disabled={pending !== null}>
          {pending === "email" ? t("sending") : t("send")}
        </Button>
      </form>

      {error && (
        <p role="alert" className="text-callout text-negative-text">
          {t(`errors.${error}`)}
        </p>
      )}
      <p className="text-footnote text-ink-2">{auth("loginNotice")}</p>
    </div>
  );
}
