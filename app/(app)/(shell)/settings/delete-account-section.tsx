"use client";

/**
 * Eliminar cuenta y datos (beta, B3): Ajustes, sección "Privacidad y datos".
 * El texto de account.* es el copy legal aprobado (docs/legal/legal.*.json),
 * tal cual; el resto (el botón que abre la confirmación, las dos formas de
 * confirmar y los mensajes de error) es texto de interfaz, en deleteAccount.*.
 *
 * Dos formas equivalentes de confirmar, igual que otras acciones
 * irreversibles de la app (DESIGN_SPEC §5 y components/ui/hold-to-delete):
 * mantener presionado 2 s, o escribir la palabra de confirmación. Las dos
 * llaman a la misma Server Action, que vuelve a validar todo en el servidor.
 */
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { HoldToDeleteButton } from "@/components/ui/hold-to-delete";

import { deleteAccount, type DeleteAccountResult } from "./delete-account-actions";

/** Mensaje ya traducido para un resultado que no fue ok. */
function errorMessage(
  result: Extract<DeleteAccountResult, { ok: false }>,
  t: ReturnType<typeof useTranslations<"deleteAccount">>,
  rateLimitT: ReturnType<typeof useTranslations<"rateLimit">>,
): string {
  if (result.code === "rate_limited") return rateLimitT("write");
  if (result.code === "balance_not_settled") {
    return t("errors.balanceNotSettled", { household: result.household ?? "" });
  }
  if (result.code === "owns_household_with_members") {
    return t("errors.ownsHouseholdWithMembers", { household: result.household ?? "" });
  }
  return t("errors.generic");
}

export function DeleteAccountSection({ exportLabel }: { exportLabel: string }) {
  const t = useTranslations("deleteAccount");
  const accountT = useTranslations("account");
  const rateLimitT = useTranslations("rateLimit");
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<"hold" | "type">("hold");
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const confirmWord = t("confirmWord");

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await deleteAccount();
      if (result.ok) {
        // La sesión ya no es válida: a /login, sin pasar por el shell.
        router.push("/login");
        return;
      }
      setError(errorMessage(result, t, rateLimitT));
    });
  }

  return (
    <Card className="space-y-4">
      <CardTitle>{t("sectionTitle")}</CardTitle>

      <div className="space-y-2">
        <p className="text-body text-ink-2">{accountT("exportNotice")}</p>
        {/* <a>, no Link: un prefetch no debe disparar la descarga. */}
        <a
          href="/settings/export"
          className="border-border bg-surface text-body text-ink hover:bg-surface2 inline-flex min-h-11 items-center rounded-full border px-6 font-semibold transition-colors duration-100"
        >
          {exportLabel}
        </a>
      </div>

      {!open ? (
        <Button variant="danger-outline" icon="trash" onClick={() => setOpen(true)}>
          {t("open")}
        </Button>
      ) : (
        <section className="rounded-row border-negative/40 space-y-4 border p-4">
          <h3 className="text-headline text-ink">{accountT("deleteTitle")}</h3>
          <p className="text-callout text-ink-2">{accountT("deleteBody")}</p>
          <p className="text-callout text-ink-2">{accountT("deleteSharedNote")}</p>

          {pending ? (
            // HoldToDeleteButton no tiene un estado "deshabilitado" (no hace
            // falta: mantener presionado 2 s ya es su propia confirmación).
            // Mientras la Server Action corre, se reemplaza por un aviso para
            // que un segundo intento no alcance a disparar otra llamada.
            <p className="text-callout text-ink-2" aria-live="polite">
              {t("deleting")}
            </p>
          ) : method === "hold" ? (
            <div className="space-y-3">
              <HoldToDeleteButton
                label={accountT("deleteConfirm")}
                itemName={t("itemName")}
                onConfirm={confirm}
              />
              <button
                type="button"
                className="text-callout text-ember-text block font-medium underline-offset-4 hover:underline"
                onClick={() => setMethod("type")}
              >
                {t("typeToggle")}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <Field
                label={t("typeLabel")}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={confirmWord}
                autoComplete="off"
                disabled={pending}
              />
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="danger"
                  disabled={typed !== confirmWord || pending}
                  onClick={confirm}
                >
                  {pending ? t("deleting") : accountT("deleteConfirm")}
                </Button>
                <button
                  type="button"
                  className="text-callout text-ember-text font-medium underline-offset-4 hover:underline"
                  onClick={() => setMethod("hold")}
                  disabled={pending}
                >
                  {t("holdToggle")}
                </button>
              </div>
            </div>
          )}

          {error && (
            <p role="alert" className="text-callout text-negative-text">
              {error}
            </p>
          )}

          <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
            {accountT("deleteCancel")}
          </Button>
        </section>
      )}
    </Card>
  );
}
