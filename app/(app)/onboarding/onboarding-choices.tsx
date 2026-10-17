"use client";

/**
 * Las tres opciones del onboarding. Cada una es un formulario con su Server
 * Action. Solo "Crear hogar" usa el botón primario (uno por pantalla).
 */
import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";

import { chooseAlone, createHousehold, goToInvite, type FormState } from "./actions";

const initial: FormState = { error: null };

export function OnboardingChoices() {
  const t = useTranslations("onboarding");
  const [aloneState, aloneAction, alonePending] = useActionState(chooseAlone, initial);
  const [createState, createAction, createPending] = useActionState(createHousehold, initial);
  const [joinState, joinAction, joinPending] = useActionState(goToInvite, initial);

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <CardTitle>{t("alone.title")}</CardTitle>
        <p className="text-body text-ink-2">{t("alone.description")}</p>
        <form action={aloneAction}>
          <Button type="submit" variant="secondary" icon="user" disabled={alonePending}>
            {alonePending ? t("alone.saving") : t("alone.button")}
          </Button>
        </form>
        <ErrorText message={aloneState.error} />
      </Card>

      <Card className="space-y-3">
        <CardTitle>{t("create.title")}</CardTitle>
        <p className="text-body text-ink-2">{t("create.description")}</p>
        <form action={createAction} className="space-y-4">
          <Field
            label={t("create.nameLabel")}
            name="name"
            required
            maxLength={80}
            placeholder={t("create.namePlaceholder")}
            error={createState.error}
          />
          <Button type="submit" icon="plus" disabled={createPending}>
            {createPending ? t("create.creating") : t("create.button")}
          </Button>
        </form>
      </Card>

      <Card className="space-y-3">
        <CardTitle>{t("join.title")}</CardTitle>
        <p className="text-body text-ink-2">{t("join.description")}</p>
        <form action={joinAction} className="space-y-4">
          <Field
            label={t("join.label")}
            name="invite"
            required
            placeholder={t("join.placeholder")}
            error={joinState.error}
          />
          <Button type="submit" variant="secondary" disabled={joinPending}>
            {t("join.button")}
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
