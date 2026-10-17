/**
 * Ahorros (03-savings.png): tres tarjetas resumen, una tarjeta por meta y la
 * tarjeta punteada para crear. Los modales se abren con ?goal=new|<id> y
 * ?contribute=<id>. Respeta el scope.
 */
import { Suspense } from "react";
import { z } from "zod";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentProfile } from "@/lib/auth/session";
import { listGoals, listLinkableTransactions } from "@/lib/goals/queries";
import { getScope } from "@/lib/scope/server";
import { todayIn } from "@/lib/transactions/dates";

import { ContributionModal } from "./contribution-modal";
import { GoalModal } from "./goal-modal";
import { SavingsView } from "./savings-view";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function SavingsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<SavingsSkeleton />}>
      <SavingsContent searchParams={searchParams} />
    </Suspense>
  );
}

/** Placeholder con la geometría de la pantalla. */
function SavingsSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-busy="true">
      <div className="grid gap-6 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="h-[112px] space-y-3">
            <Skeleton className="h-3 w-28 rounded-full" />
            <Skeleton className="h-7 w-44 rounded-full" />
          </Card>
        ))}
      </div>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="flex h-[300px] items-center gap-6">
            <Skeleton className="size-[124px] shrink-0 rounded-full" />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-3 w-20 rounded-full" />
              <Skeleton className="h-6 w-36 rounded-full" />
              <Skeleton className="h-3 w-28 rounded-full" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

async function SavingsContent({ searchParams }: { searchParams: SearchParams }) {
  const [params, profile, scope] = await Promise.all([
    searchParams,
    getCurrentProfile(),
    getScope(),
  ]);
  const today = todayIn(profile.timezone);
  const goals = await listGoals(scope);

  const goalParam = typeof params.goal === "string" ? params.goal : null;
  const editing =
    goalParam && goalParam !== "new" ? (goals.find((g) => g.id === goalParam) ?? null) : null;
  const contributeId =
    typeof params.contribute === "string" && z.uuid().safeParse(params.contribute).success
      ? params.contribute
      : null;
  const contributeGoal = contributeId ? (goals.find((g) => g.id === contributeId) ?? null) : null;
  const linkable = contributeGoal
    ? await listLinkableTransactions(scope, contributeGoal.target.currency)
    : [];

  return (
    <>
      <SavingsView goals={goals} today={today} />
      <GoalModal
        key={goalParam ?? "closed"}
        open={goalParam === "new" || Boolean(editing)}
        editing={editing}
        today={today}
      />
      <ContributionModal
        key={contributeId ?? "none"}
        goal={contributeGoal}
        transactions={linkable}
        today={today}
      />
    </>
  );
}
