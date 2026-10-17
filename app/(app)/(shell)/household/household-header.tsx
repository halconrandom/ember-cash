"use client";

/**
 * Fila superior de Hogar (08-household.png): a la izquierda el interruptor
 * Personal / Compartido; a la derecha los avatares, "2 miembros" e "Invitar
 * miembro" (modal con la lista de miembros y el enlace de la fase 2).
 * En el mismo modal: "Quitar" (quien administra) y "Salir del hogar" (los
 * demás), en dos pasos; la base exige el saldo en cero (0010).
 * También los estados sin hogar y en scope Personal.
 */
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { HouseholdSetupModal, ScopeSwitch } from "@/components/shell/scope-switch";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { TwoStepDeleteButton } from "@/components/ui/hold-to-delete";
import { Modal } from "@/components/ui/modal";
import type { MyHousehold } from "@/lib/households/queries";

import { leaveHousehold, removeMember } from "./actions";
import { InviteLink } from "./invite-link";

type HeaderProps = {
  scope: "personal" | "shared";
  household: MyHousehold;
  currentUserId: string;
  maxMembers: number;
};

export function HouseholdHeader({ scope, household, currentUserId, maxMembers }: HeaderProps) {
  const t = useTranslations("household");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isOwner = household.myRole === "owner";

  /** Salir o quitar; si la base lo rechaza (saldo pendiente), muestra el motivo. */
  function detach(userId: string | null) {
    setError(null);
    startTransition(async () => {
      const result = userId
        ? await removeMember({ householdId: household.id, userId })
        : await leaveHousehold(household.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (!userId) setOpen(false);
      router.refresh();
    });
  }
  const canInvite = household.myRole === "owner" && household.members.length < maxMembers;

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <ScopeSwitch scope={scope} householdId={household.id} />
      <div className="flex items-center gap-4">
        <div className="flex -space-x-2">
          {household.members.map((m, i) => (
            <Avatar
              key={m.userId}
              name={m.displayName}
              member={i === 0 ? "a" : "b"}
              size={36}
              className="ring-canvas ring-2"
            />
          ))}
        </div>
        <span className="text-body text-ink-2 tabular-nums">
          {t("members", { count: household.members.length })}
        </span>
        <Button variant="secondary" icon="user-add" onClick={() => setOpen(true)}>
          {t("inviteMember")}
        </Button>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={household.name}
        closeLabel={t("close")}
      >
        <div className="space-y-5 pb-5">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-headline text-ink">{t("membersTitle")}</h3>
            <span className="text-callout text-ink-2 tabular-nums">
              {t("membersCount", { count: household.members.length, max: maxMembers })}
            </span>
          </div>
          <ul className="divide-divider divide-y">
            {household.members.map((member, i) => (
              <li key={member.userId} className="flex items-center gap-3 py-3">
                <Avatar name={member.displayName} member={i === 0 ? "a" : "b"} />
                <span className="text-body text-ink min-w-0 flex-1 font-medium">
                  {member.displayName ?? t("noName")}
                  {member.userId === currentUserId && (
                    <span className="text-ink-3"> {t("you")}</span>
                  )}
                </span>
                <Badge tone="neutral" size="sm">
                  {member.role === "owner" ? t("roleOwner") : t("roleMember")}
                </Badge>
                {isOwner && member.userId !== currentUserId && (
                  <TwoStepDeleteButton
                    label={t("removeMember")}
                    confirmLabel={t("removeConfirm")}
                    onConfirm={() => detach(member.userId)}
                  />
                )}
              </li>
            ))}
          </ul>
          {canInvite ? (
            <InviteLink householdId={household.id} />
          ) : (
            <p className="text-callout text-ink-2">
              {household.myRole !== "owner" ? t("inviteOnlyOwner") : t("inviteFull")}
            </p>
          )}
          {!isOwner && (
            <div className="border-divider space-y-2 border-t pt-5">
              <p className="text-callout text-ink-2">{t("leaveHint")}</p>
              <TwoStepDeleteButton
                label={t("leave")}
                confirmLabel={t("leaveConfirm")}
                onConfirm={() => detach(null)}
              />
            </div>
          )}
          {isOwner && household.members.length > 1 && (
            <p className="text-callout text-ink-2">{t("removeHint")}</p>
          )}
          {(error || pending) && (
            <p
              role={error ? "alert" : "status"}
              className={error ? "text-callout text-negative-text" : "text-callout text-ink-2"}
            >
              {error ?? t("leaving")}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}

/** Sin hogar: interruptor en Personal y opciones para crear o unirse. */
export function NoHousehold() {
  const t = useTranslations("household");
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-6">
      <ScopeSwitch scope="personal" householdId={null} />
      <EmptyState
        icon="users"
        title={t("emptyTitle")}
        description={t("emptyDescription")}
        actions={
          <Button icon="plus" onClick={() => setOpen(true)}>
            {t("setupAction")}
          </Button>
        }
      />
      <HouseholdSetupModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

/** En scope Personal: las finanzas del hogar se ven al cambiar a Compartido. */
export function PersonalScopeNote() {
  const t = useTranslations("household");
  return (
    <Card className="max-w-xl space-y-2">
      <h2 className="text-headline text-ink">{t("personalNoteTitle")}</h2>
      <p className="text-body text-ink-2">{t("personalNoteDescription")}</p>
    </Card>
  );
}
