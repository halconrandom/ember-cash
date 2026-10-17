"use client";

/**
 * Botón "Aceptar invitación". Muestra el error de la RPC si el token ya se
 * usó, venció o el household está lleno.
 */
import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";

import { acceptInvite, type AcceptState } from "./actions";

const initial: AcceptState = { error: null };

export function AcceptInvite({ token }: { token: string }) {
  const [state, action, pending] = useActionState(acceptInvite, initial);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <Button type="submit" icon="check" disabled={pending}>
        {pending ? "Aceptando..." : "Aceptar invitación"}
      </Button>
      {state.error && (
        <div className="space-y-2">
          <p role="alert" className="text-callout text-negative-text">
            {state.error}
          </p>
          <Link
            href="/"
            className="text-body text-ember-text font-medium underline-offset-4 hover:underline"
          >
            Ir al inicio
          </Link>
        </div>
      )}
    </form>
  );
}
