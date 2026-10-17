"use client";

/**
 * Formulario de login. Google redirige a /auth/callback; el link mágico llega
 * por correo y entra por /auth/confirm (según la plantilla de Supabase).
 */
import { useState, type FormEvent } from "react";

import { ui } from "@/components/provisional/styles";
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
  const [sentTo, setSentTo] = useState<string | null>(null);

  /** URL de retorno para Google, conservando `next`. */
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
    setPending("email");
    setError(null);
    const address = email.trim();
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
        <p className={ui.success}>Te enviamos un link a {sentTo}.</p>
        <p className={ui.helper}>Ábrelo para entrar. Puedes cerrar esta pestaña.</p>
        <button type="button" className={ui.link} onClick={() => setSentTo(null)}>
          Usar otro correo
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-5">
      {/* Google como secundario: el primario de la pantalla es "Enviar link". */}
      <button
        type="button"
        className={`${ui.secondaryButton} w-full`}
        onClick={signInWithGoogle}
        disabled={pending !== null}
      >
        {pending === "google" ? "Abriendo Google..." : "Continuar con Google"}
      </button>

      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="bg-border h-px flex-1" />
        <span className={ui.helper}>o con tu correo</span>
        <span className="bg-border h-px flex-1" />
      </div>

      <form onSubmit={sendMagicLink} className="space-y-3">
        <label htmlFor="email" className={ui.label}>
          Correo
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          placeholder="tu@correo.com"
          className={`${ui.input} mt-1.5`}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "login-error" : undefined}
        />
        <button type="submit" className={`${ui.primaryButton} w-full`} disabled={pending !== null}>
          {pending === "email" ? "Enviando..." : "Enviar link mágico"}
        </button>
      </form>

      {error && (
        <p id="login-error" role="alert" className={ui.error}>
          {error}
        </p>
      )}
    </div>
  );
}
