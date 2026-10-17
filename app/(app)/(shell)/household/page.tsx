/**
 * Hogar: miembros del hogar del usuario y, para quien lo administra, el
 * enlace de invitación (flujo de la fase 2). Las finanzas compartidas llegan
 * después.
 */
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/chip";
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
  const [households, maxMembers, t] = await Promise.all([
    getMyHouseholds(user.id),
    getMaxHouseholdMembers(),
    getTranslations("household"),
  ]);

  if (households.length === 0) {
    return <EmptyState icon="users" title={t("emptyTitle")} description={t("emptyDescription")} />;
  }

  return households.map((household) => (
    <Card key={household.id} className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <CardTitle>{household.name}</CardTitle>
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
              {member.userId === user.id && <span className="text-ink-3"> {t("you")}</span>}
            </span>
            <Badge tone="neutral" size="sm">
              {member.role === "owner" ? t("roleOwner") : t("roleMember")}
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
