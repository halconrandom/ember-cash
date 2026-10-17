/**
 * Hogar (08-household.png / 18-household-dark.png).
 *
 * - Sin hogar: el interruptor y un estado vacío para crear uno o unirse.
 * - Con hogar, en scope Personal: los miembros, la invitación y una nota
 *   para cambiar a Compartido (las finanzas del hogar solo se ven ahí).
 * - En scope Compartido: tarjetas de miembros, liquidar cuentas, gastos
 *   compartidos del mes con su reparto, presupuesto compartido, meta
 *   compartida e historial de liquidaciones. "Agregar gasto compartido"
 *   abre el modal de transacciones (?tx=new) con "Pagó".
 */
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { z } from "zod";

import { TopbarHideAction, TopbarSubtitle } from "@/components/shell/topbar-context";
import { Card } from "@/components/ui/card";
import { SkeletonList } from "@/components/ui/skeleton";
import { getAccounts } from "@/lib/accounts/queries";
import { getCurrentProfile, requireUser } from "@/lib/auth/session";
import {
  getHouseholdMembers,
  getSharedGoal,
  listBudgets,
  listDepartures,
  listSettlements,
  listSharedTransactions,
  previousBudgetMonth,
} from "@/lib/household/queries";
import { getMaxHouseholdMembers, getMyHouseholds } from "@/lib/households/queries";
import { getScope } from "@/lib/scope/server";
import { todayIn } from "@/lib/transactions/dates";
import { parseFilters } from "@/lib/transactions/filters";
import { getTransaction } from "@/lib/transactions/queries";

import { TransactionModal } from "../transactions/transaction-modal";
import { HouseholdHeader, NoHousehold, PersonalScopeNote } from "./household-header";
import { HouseholdView } from "./household-view";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function HouseholdPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<HouseholdSkeleton />}>
      <HouseholdContent searchParams={searchParams} />
    </Suspense>
  );
}

/** Placeholder con la geometría de la pantalla mientras carga. */
function HouseholdSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-12" />
      <div className="grid gap-6 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Card key={i}>
            <SkeletonList rows={2} />
          </Card>
        ))}
      </div>
    </div>
  );
}

async function HouseholdContent({ searchParams }: { searchParams: SearchParams }) {
  const [params, user, profile, scope, t] = await Promise.all([
    searchParams,
    requireUser(),
    getCurrentProfile(),
    getScope(),
    getTranslations("household"),
  ]);
  const [households, maxMembers] = await Promise.all([
    getMyHouseholds(user.id),
    getMaxHouseholdMembers(),
  ]);
  const today = todayIn(profile.timezone);

  if (households.length === 0) {
    return (
      <>
        <TopbarHideAction />
        <NoHousehold />
      </>
    );
  }

  const household =
    (scope.kind === "household" && households.find((h) => h.id === scope.householdId)) ||
    households[0];
  const header = (
    <HouseholdHeader
      scope={scope.kind === "household" ? "shared" : "personal"}
      household={household}
      currentUserId={user.id}
      maxMembers={maxMembers}
    />
  );

  const departures = await listDepartures(household.id);

  if (scope.kind !== "household") {
    return (
      <div className="space-y-6">
        <TopbarHideAction />
        {header}
        <PersonalScopeNote />
      </div>
    );
  }

  const { month } = parseFilters(params, today);
  const txParam = typeof params.tx === "string" ? params.tx : null;
  const editingId = txParam && z.uuid().safeParse(txParam).success ? txParam : null;
  const [members, transactions, settlements, budgets, prevMonth, goal, accounts, editing] =
    await Promise.all([
      getHouseholdMembers(household.id),
      listSharedTransactions(household.id),
      listSettlements(household.id),
      listBudgets(household.id, month),
      previousBudgetMonth(household.id, month),
      getSharedGoal(household.id),
      getAccounts(scope, { includeArchived: true }),
      editingId ? getTransaction(editingId) : Promise.resolve(null),
    ]);
  const others = members.filter((m) => m.userId !== user.id);

  return (
    <div className="space-y-6">
      <TopbarSubtitle
        text={
          others.length > 0
            ? t("subtitleWith", {
                names: others.map((m) => m.displayName ?? t("noName")).join(", "),
              })
            : t("subtitleAlone")
        }
      />
      {header}
      <HouseholdView
        householdId={household.id}
        members={members}
        departures={departures}
        currentUserId={user.id}
        transactions={transactions}
        settlements={settlements}
        budgets={budgets}
        previousBudgetMonth={prevMonth}
        goal={goal}
        month={month}
      />
      <TransactionModal
        key={txParam ?? "closed"}
        open={txParam === "new" || Boolean(editing)}
        editing={editing}
        accounts={accounts.filter((a) => !a.archived_at || a.id === editing?.account?.id)}
        members={members.map((m) => ({ userId: m.userId, displayName: m.displayName }))}
        currentUserId={user.id}
        today={today}
      />
    </div>
  );
}
