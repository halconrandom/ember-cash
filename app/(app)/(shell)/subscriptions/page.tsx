/**
 * Suscripciones: resumen, lista y cobros de 14 días. El modal se abre con
 * ?sub=new o ?sub=<id>. Respeta el scope.
 */
import { Suspense } from "react";
import { z } from "zod";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getAccounts } from "@/lib/accounts/queries";
import { getCurrentProfile, requireUser } from "@/lib/auth/session";
import { listSubscriptions } from "@/lib/recurring/queries";
import { getScope } from "@/lib/scope/server";
import { todayIn } from "@/lib/transactions/dates";

import { SubscriptionModal } from "./subscription-modal";
import { SubscriptionsView } from "./subscriptions-view";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function SubscriptionsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<SubscriptionsSkeleton />}>
      <SubscriptionsContent searchParams={searchParams} />
    </Suspense>
  );
}

/** Placeholder con la geometría de las tarjetas y la lista. */
function SubscriptionsSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-busy="true">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="h-28 space-y-3">
            <Skeleton className="h-3 w-28 rounded-full" />
            <Skeleton className="h-7 w-36 rounded-full" />
          </Card>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="h-32" />
        ))}
      </div>
    </div>
  );
}

async function SubscriptionsContent({ searchParams }: { searchParams: SearchParams }) {
  const [params, profile, scope, user] = await Promise.all([
    searchParams,
    getCurrentProfile(),
    getScope(),
    requireUser(),
  ]);
  const today = todayIn(profile.timezone);
  const [{ items, upcoming }, accounts] = await Promise.all([
    listSubscriptions(scope, today, user.id),
    getAccounts(scope),
  ]);
  const sub = typeof params.sub === "string" ? params.sub : null;
  const editing =
    sub && z.uuid().safeParse(sub).success ? (items.find((item) => item.id === sub) ?? null) : null;

  return (
    <>
      <SubscriptionsView items={items} upcoming={upcoming} today={today} accounts={accounts} />
      <SubscriptionModal
        key={sub ?? "closed"}
        open={sub === "new" || Boolean(editing)}
        editing={editing}
        lockedKind="subscription"
        today={today}
        param="sub"
      />
    </>
  );
}
