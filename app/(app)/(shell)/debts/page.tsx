/**
 * Deudas (04-debts.png): resumen, lista de deudas, plan de pago con
 * avalancha / bola de nieve y tarjeta de pago extra. Modales con
 * ?debt=new|<id> y ?pay=<id>. Las deudas son siempre personales.
 */
import { Suspense } from "react";
import { z } from "zod";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getAccounts } from "@/lib/accounts/queries";
import { getCurrentProfile } from "@/lib/auth/session";
import { listDebts } from "@/lib/debts/queries";
import { PERSONAL_SCOPE } from "@/lib/scope/constants";
import { todayIn } from "@/lib/transactions/dates";

import { DebtModal } from "./debt-modal";
import { DebtsView } from "./debts-view";
import { PaymentModal } from "./payment-modal";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function DebtsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<DebtsSkeleton />}>
      <DebtsContent searchParams={searchParams} />
    </Suspense>
  );
}

function DebtsSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-busy="true">
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="h-[104px] space-y-3">
            <Skeleton className="h-3 w-28 rounded-full" />
            <Skeleton className="h-7 w-40 rounded-full" />
          </Card>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card className="h-[420px] space-y-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="rounded-row h-24 w-full" />
          ))}
        </Card>
        <Card className="h-[420px]">
          <Skeleton className="rounded-row h-full w-full" />
        </Card>
      </div>
    </div>
  );
}

async function DebtsContent({ searchParams }: { searchParams: SearchParams }) {
  const [params, profile, debts] = await Promise.all([
    searchParams,
    getCurrentProfile(),
    listDebts(),
  ]);
  const today = todayIn(profile.timezone);
  const debtParam = typeof params.debt === "string" ? params.debt : null;
  const editing =
    debtParam && debtParam !== "new" ? (debts.find((d) => d.id === debtParam) ?? null) : null;
  const payId =
    typeof params.pay === "string" && z.uuid().safeParse(params.pay).success ? params.pay : null;
  const paying = payId ? (debts.find((d) => d.id === payId) ?? null) : null;
  // Las deudas son personales: la transacción vinculada sale de una cuenta personal.
  const accounts = paying
    ? (await getAccounts(PERSONAL_SCOPE)).filter((a) => a.currency === paying.balance.currency)
    : [];

  return (
    <>
      <DebtsView debts={debts} today={today} />
      <DebtModal
        key={debtParam ?? "closed"}
        open={debtParam === "new" || Boolean(editing)}
        editing={editing}
      />
      <PaymentModal key={payId ?? "none"} debt={paying} accounts={accounts} today={today} />
    </>
  );
}
