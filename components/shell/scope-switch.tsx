"use client";

/**
 * Interruptor Personal / Compartido (08-household.png). Cambia el scope de
 * toda la app (cookie ec-scope) y vuelve a pedir la página. Si el usuario no
 * tiene hogar, "Compartido" abre el modal para crear uno o unirse.
 */
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useActionState, useState, useTransition } from "react";

import { createHouseholdAndSwitch } from "@/app/(app)/(shell)/household/actions";
import { goToInvite, type FormState } from "@/app/(app)/onboarding/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { setScope } from "@/lib/scope/actions";

type Props = {
  scope: "personal" | "shared";
  /** Hogar del usuario (null si no tiene). */
  householdId: string | null;
  className?: string;
};

export function ScopeSwitch({ scope, householdId, className }: Props) {
  const t = useTranslations("scope");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Valor optimista: la píldora se mueve al instante mientras carga.
  const [optimistic, setOptimistic] = useState<Props["scope"] | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const value = pending && optimistic ? optimistic : scope;

  function change(next: Props["scope"]) {
    if (next === value) return;
    if (next === "shared" && !householdId) {
      setSetupOpen(true);
      return;
    }
    setOptimistic(next);
    startTransition(async () => {
      await setScope(next === "shared" ? householdId! : "personal");
      router.refresh();
    });
  }

  return (
    <>
      <SegmentedControl
        label={t("label")}
        value={value}
        onChange={change}
        options={[
          { value: "personal", label: t("personal") },
          { value: "shared", label: t("shared") },
        ]}
        className={className}
      />
      <HouseholdSetupModal open={setupOpen} onClose={() => setSetupOpen(false)} />
    </>
  );
}

const initial: FormState = { error: null };

/** Crear un hogar o unirse a uno con el enlace de invitación (flujo de la fase 2). */
export function HouseholdSetupModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("scope");
  const to = useTranslations("onboarding");
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, startCreate] = useTransition();
  const [joinState, joinAction, joining] = useActionState(goToInvite, initial);

  function create(event: React.FormEvent) {
    event.preventDefault();
    startCreate(async () => {
      const result = await createHouseholdAndSwitch(name);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal open={open} onClose={onClose} title={t("setupTitle")} closeLabel={t("close")}>
      <div className="space-y-6 pb-5">
        <p className="text-body text-ink-2">{t("setupDescription")}</p>
        <form onSubmit={create} className="space-y-4">
          <h3 className="text-headline text-ink">{to("create.title")}</h3>
          <Field
            label={to("create.nameLabel")}
            name="name"
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={to("create.namePlaceholder")}
            error={error}
          />
          <Button type="submit" icon="plus" disabled={creating}>
            {creating ? to("create.creating") : to("create.button")}
          </Button>
        </form>
        <div className="border-divider border-t" />
        <form action={joinAction} className="space-y-4">
          <h3 className="text-headline text-ink">{to("join.title")}</h3>
          <Field
            label={to("join.label")}
            name="invite"
            required
            placeholder={to("join.placeholder")}
            hint={to("join.description")}
            error={joinState.error}
          />
          <Button type="submit" variant="secondary" disabled={joining}>
            {to("join.button")}
          </Button>
        </form>
      </div>
    </Modal>
  );
}
