"use client";

/**
 * Formulario de login. Google redirige a /auth/callback; el link mágico llega
 * por correo y entra por /auth/confirm (según la plantilla de Supabase).
 * Un solo botón primario: "Enviar link mágico". Google es secundario.
 */
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/client";

type Props = {
  /** Ruta interna a la que volver después del login. */
  next: string;
  /** Error que llega en la URL (por ejemplo, un link vencido). */
  initialError: string | null;
};

export function LoginForm({ next, initialError }: Props) {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState<"google" | "email" | null>(null);
  const [error, setError] = useState<string | null>(initialError);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  /** URL de retorno, conservando `next`. */
  const callbackUrl = () =>
    `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function signInWithGoogle() {
    setPending("google");
    setError(null);
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl() },
    });
    // Si todo va bien el navegador ya está saliendo hacia Google.
    if (error) {
      setError("No se pudo abrir el inicio de sesión con Google. Intenta de nuevo.");
      setPending(null);
    }
  }

  async function sendMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setEmailError("Escribe un correo válido.");
      return;
    }
    setEmailError(null);
    setPending("email");
    setError(null);
    const { error } = await createClient().auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: callbackUrl(), shouldCreateUser: true },
    });
    setPending(null);
    if (error) {
      setError(
        error.status === 429
          ? "Se enviaron demasiados correos. Espera unos minutos e intenta de nuevo."
          : "No se pudo enviar el link. Revisa el correo e intenta de nuevo.",
      );
      return;
    }
    setSentTo(address);
  }

  if (sentTo) {
    return (
      <div className="mt-6 space-y-3" aria-live="polite">
        <p className="text-body text-positive-text font-semibold">
          Te enviamos un link a {sentTo}.
        </p>
        <p className="text-callout text-ink-2">Ábrelo para entrar. Puedes cerrar esta pestaña.</p>
        <button
          type="button"
          className="text-body text-ember-text font-medium underline-offset-4 hover:underline"
          onClick={() => setSentTo(null)}
        >
          Usar otro correo
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-5">
      <Button
        variant="secondary"
        className="w-full"
        onClick={signInWithGoogle}
        disabled={pending !== null}
      >
        {pending === "google" ? "Abriendo Google..." : "Continuar con Google"}
      </Button>

      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="bg-border h-px flex-1" />
        <span className="text-footnote text-ink-3">o con tu correo</span>
        <span className="bg-border h-px flex-1" />
      </div>

      <form onSubmit={sendMagicLink} className="space-y-4" noValidate>
        <Field
          label="Correo"
          type="email"
          autoComplete="email"
          placeholder="tu@correo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={emailError}
        />
        <Button type="submit" className="w-full" disabled={pending !== null}>
          {pending === "email" ? "Enviando..." : "Enviar link mágico"}
        </Button>
      </form>

      {error && (
        <p role="alert" className="text-callout text-negative-text">
          {error}
        </p>
      )}
    </div>
  );
}
