"use client";

/**
 * Botón "Aceptar invitación". Muestra el error de la RPC si el token ya se
 * usó, venció o el household está lleno.
 */
import Link from "next/link";
import { useActionState } from "react";

import { ui } from "@/components/provisional/styles";

import { acceptInvite, type AcceptState } from "./actions";

const initial: AcceptState = { error: null };

export function AcceptInvite({ token }: { token: string }) {
  const [state, action, pending] = useActionState(acceptInvite, initial);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <button type="submit" className={ui.primaryButton} disabled={pending}>
        {pending ? "Aceptando..." : "Aceptar invitación"}
      </button>
      {state.error && (
        <div className="space-y-2">
          <p role="alert" className={ui.error}>
            {state.error}
          </p>
          <Link href="/" className={ui.link}>
            Ir al inicio
          </Link>
        </div>
      )}
    </form>
  );
}
