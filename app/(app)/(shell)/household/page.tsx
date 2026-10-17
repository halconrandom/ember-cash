/**
 * Household: miembros del household del usuario y, para el owner, el link de
 * invitación (flujo de la fase 2). Las finanzas compartidas llegan después.
 */
import { Suspense } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/chip";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/session";
import { getMaxHouseholdMembers, getMyHouseholds } from "@/lib/households/queries";

import { InviteLink } from "./invite-link";

export default function HouseholdPage() {
  return (
    <div className="max-w-xl space-y-6">
      <Suspense
        fallback={
          <Card>
            <SkeletonList rows={2} />
          </Card>
        }
      >
        <HouseholdContent />
      </Suspense>
    </div>
  );
}

async function HouseholdContent() {
  const user = await requireUser();
  const [households, maxMembers] = await Promise.all([
    getMyHouseholds(user.id),
    getMaxHouseholdMembers(),
  ]);

  if (households.length === 0) {
    return (
      <EmptyState
        icon="users"
        title="Estás usando Ember Cash solo"
        description="Cuando crees o te unas a un household, sus miembros aparecerán aquí."
      />
    );
  }

  return households.map((household) => (
    <Card key={household.id} className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <CardTitle>{household.name}</CardTitle>
        <span className="text-callout text-ink-2 tabular-nums">
          {household.members.length} de {maxMembers} miembros
        </span>
      </div>

      <ul className="divide-divider divide-y">
        {household.members.map((member, i) => (
          <li key={member.userId} className="flex items-center gap-3 py-3">
            <Avatar name={member.displayName} member={i === 0 ? "a" : "b"} />
            <span className="text-body text-ink min-w-0 flex-1 font-medium">
              {member.displayName ?? "Sin nombre"}
              {member.userId === user.id && <span className="text-ink-3"> (tú)</span>}
            </span>
            <Badge tone="neutral" size="sm">
              {member.role === "owner" ? "Owner" : "Miembro"}
            </Badge>
          </li>
        ))}
      </ul>

      {household.myRole === "owner" && household.members.length < maxMembers && (
        <InviteLink householdId={household.id} />
      )}
    </Card>
  ));
}
