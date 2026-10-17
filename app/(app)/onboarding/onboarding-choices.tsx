"use client";

/**
 * Las tres opciones del onboarding. Cada una es un formulario con su Server
 * Action. Solo "Crear household" usa el botón primario (uno por pantalla).
 */
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";

import { chooseAlone, createHousehold, goToInvite, type FormState } from "./actions";

const initial: FormState = { error: null };

export function OnboardingChoices() {
  const [aloneState, aloneAction, alonePending] = useActionState(chooseAlone, initial);
  const [createState, createAction, createPending] = useActionState(createHousehold, initial);
  const [joinState, joinAction, joinPending] = useActionState(goToInvite, initial);

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <CardTitle>Usar solo yo</CardTitle>
        <p className="text-body text-ink-2">Tus finanzas personales, sin compartir con nadie.</p>
        <form action={aloneAction}>
          <Button type="submit" variant="secondary" icon="user" disabled={alonePending}>
            {alonePending ? "Guardando..." : "Usar solo yo"}
          </Button>
        </form>
        <ErrorText message={aloneState.error} />
      </Card>

      <Card className="space-y-3">
        <CardTitle>Crear household</CardTitle>
        <p className="text-body text-ink-2">Comparte gastos con otra persona. Tú serás el owner.</p>
        <form action={createAction} className="space-y-4">
          <Field
            label="Nombre del household"
            name="name"
            required
            maxLength={80}
            placeholder="Casa"
            error={createState.error}
          />
          <Button type="submit" icon="plus" disabled={createPending}>
            {createPending ? "Creando..." : "Crear household"}
          </Button>
        </form>
      </Card>

      <Card className="space-y-3">
        <CardTitle>Unirme con una invitación</CardTitle>
        <p className="text-body text-ink-2">
          Pega el link que te compartió el owner del household.
        </p>
        <form action={joinAction} className="space-y-4">
          <Field
            label="Link de invitación"
            name="invite"
            required
            placeholder="https://.../invite/..."
            error={joinState.error}
          />
          <Button type="submit" variant="secondary" disabled={joinPending}>
            Continuar
          </Button>
        </form>
      </Card>
    </div>
  );
}

/** Mensaje de error accesible bajo una opción sin campo. */
function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-callout text-negative-text">
      {message}
    </p>
  );
}
