"use client";

/**
 * Las tres opciones del onboarding. Cada una es un formulario con su Server
 * Action. Solo "Crear household" usa el botón primario (uno por pantalla).
 */
import { useActionState } from "react";

import { ui } from "@/components/provisional/styles";

import { createHousehold, goToInvite, chooseAlone, type FormState } from "./actions";

const initial: FormState = { error: null };

export function OnboardingChoices() {
  const [aloneState, aloneAction, alonePending] = useActionState(chooseAlone, initial);
  const [createState, createAction, createPending] = useActionState(createHousehold, initial);
  const [joinState, joinAction, joinPending] = useActionState(goToInvite, initial);

  return (
    <div className="space-y-4">
      {/* Opción 1: usar solo */}
      <section className={`${ui.card} space-y-3`}>
        <h2 className={ui.headline}>Usar solo yo</h2>
        <p className={ui.body2}>Tus finanzas personales, sin compartir con nadie.</p>
        <form action={aloneAction}>
          <button type="submit" className={ui.secondaryButton} disabled={alonePending}>
            {alonePending ? "Guardando..." : "Usar solo yo"}
          </button>
        </form>
        <ErrorText message={aloneState.error} />
      </section>

      {/* Opción 2: crear household */}
      <section className={`${ui.card} space-y-3`}>
        <h2 className={ui.headline}>Crear household</h2>
        <p className={ui.body2}>Comparte gastos con otra persona. Tú serás el owner.</p>
        <form action={createAction} className="space-y-3">
          <div>
            <label htmlFor="household-name" className={ui.label}>
              Nombre del household
            </label>
            <input
              id="household-name"
              name="name"
              required
              maxLength={80}
              placeholder="Casa"
              className={`${ui.input} mt-1.5`}
              aria-invalid={createState.error ? true : undefined}
            />
          </div>
          <button type="submit" className={ui.primaryButton} disabled={createPending}>
            {createPending ? "Creando..." : "Crear household"}
          </button>
        </form>
        <ErrorText message={createState.error} />
      </section>

      {/* Opción 3: unirse con invitación */}
      <section className={`${ui.card} space-y-3`}>
        <h2 className={ui.headline}>Unirme con una invitación</h2>
        <p className={ui.body2}>Pega el link que te compartió el owner del household.</p>
        <form action={joinAction} className="space-y-3">
          <div>
            <label htmlFor="invite" className={ui.label}>
              Link de invitación
            </label>
            <input
              id="invite"
              name="invite"
              required
              placeholder="https://.../invite/..."
              className={`${ui.input} mt-1.5`}
              aria-invalid={joinState.error ? true : undefined}
            />
          </div>
          <button type="submit" className={ui.secondaryButton} disabled={joinPending}>
            Continuar
          </button>
        </form>
        <ErrorText message={joinState.error} />
      </section>
    </div>
  );
}

/** Mensaje de error accesible bajo cada opción. */
function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className={ui.error}>
      {message}
    </p>
  );
}
