/**
 * Dashboard (01-dashboard.png / 09-dashboard-dark.png). Si el usuario no
 * terminó el onboarding, lo manda a /onboarding.
 *
 * Cada tarjeta es un componente de servidor (_dashboard/slots.tsx) con su
 * propio <Suspense> (cargando) y su propia lectura protegida con safe()
 * (error): una consulta que falla muestra esa tarjeta en error y las demás
 * siguen. Las cinco tarjetas de dinero
 * comparten una sola consulta agregada (getAggregates, con cache de React).
 * Todo respeta el scope y el mes elegido (?month); "Agregar" de la topbar
 * abre el modal de transacciones aquí mismo (?tx=new).
 */
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { getAccounts } from "@/lib/accounts/queries";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { CardSkeleton } from "./_dashboard/card-frame";
import { DoneHintSlot, FirstStepsSlot, SkippedSlot } from "./_dashboard/onboarding-slots";
import {
  AccountsSlot,
  CategorySlot,
  context,
  DebtsSlot,
  GoalsSlot,
  OnboardingGuard,
  StatSlot,
  Subtitle,
  SubscriptionsSlot,
  TrendSlot,
  UpcomingSlot,
  type SearchParams,
} from "./_dashboard/slots";
import { TransactionModal } from "./transactions/transaction-modal";

export default function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <Suspense fallback={null}>
        <OnboardingGuard />
      </Suspense>
      <Suspense fallback={null}>
        <Subtitle searchParams={searchParams} />
      </Suspense>
      <div id="help-see-dashboard" className="space-y-6">
        <Suspense fallback={null}>
          <SkippedSlot searchParams={searchParams} />
        </Suspense>
        <Suspense fallback={null}>
          <DoneHintSlot />
        </Suspense>
        <Suspense fallback={null}>
          <FirstStepsSlot />
        </Suspense>
        <Suspense fallback={null}>
          <StatementLink />
        </Suspense>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 lg:gap-6">
          {(["balance", "income", "expenses"] as const).map((card) => (
            <div key={card} className={card === "balance" ? "col-span-2 lg:col-span-1" : undefined}>
              <Suspense fallback={<CardSkeleton rows={0} className="min-h-[188px]" />}>
                <StatSlot searchParams={searchParams} card={card} />
              </Suspense>
            </div>
          ))}
        </div>
        {/* grid-cols-1 (minmax(0,1fr)) en el teléfono: sin columnas explícitas
            la columna implícita es auto y se estira al ancho de lo que no se
            parte, empujando la página más allá de la pantalla. */}
        <div className="grid grid-cols-1 gap-6 min-[600px]:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          <Suspense fallback={<CardSkeleton rows={7} className="min-h-[420px]" />}>
            <CategorySlot searchParams={searchParams} />
          </Suspense>
          <Suspense fallback={<CardSkeleton rows={7} className="min-h-[420px]" />}>
            <TrendSlot searchParams={searchParams} />
          </Suspense>
        </div>
        <div className="grid grid-cols-1 gap-6 min-[600px]:grid-cols-2 xl:grid-cols-3">
          <Suspense fallback={<CardSkeleton rows={5} />}>
            <UpcomingSlot />
          </Suspense>
          <Suspense fallback={<CardSkeleton rows={5} />}>
            <GoalsSlot />
          </Suspense>
          <div className="space-y-6">
            <Suspense fallback={<CardSkeleton rows={2} />}>
              <AccountsSlot />
            </Suspense>
            <Suspense fallback={<CardSkeleton rows={2} />}>
              <DebtsSlot />
            </Suspense>
            <Suspense fallback={<CardSkeleton rows={2} />}>
              <SubscriptionsSlot />
            </Suspense>
          </div>
        </div>
      </div>
      <Suspense fallback={null}>
        <AddTransaction searchParams={searchParams} />
      </Suspense>
    </>
  );
}

/** Arriba del dashboard: abre el estado de cada cuenta (/accounts). */
async function StatementLink() {
  const t = await getTranslations("accounts.statement");
  return (
    <div className="flex justify-end">
      <Link
        href="/accounts"
        className="text-callout text-ember-text rounded-control border-border hover:bg-surface2 inline-flex items-center gap-2 border px-3 py-1.5 font-medium"
      >
        {t("title")}
      </Link>
    </div>
  );
}

/** "Agregar" de la topbar: el modal de transacciones, solo cuando ?tx=new. */
async function AddTransaction({ searchParams }: { searchParams: SearchParams }) {
  const [{ params, today, scope }, user] = await Promise.all([
    context(searchParams),
    requireUser(),
  ]);
  if (params.tx !== "new") return null;
  const [accounts, members] = await Promise.all([
    getAccounts(scope),
    scope.kind === "household" ? getMembers(scope.householdId) : Promise.resolve(null),
  ]);
  return (
    <TransactionModal
      key="new"
      open
      editing={null}
      accounts={accounts}
      members={members}
      currentUserId={user.id}
      today={today}
    />
  );
}

/** Miembros del hogar para "Pagó" (como en Transacciones). */
async function getMembers(householdId: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_household_members", { hid: householdId });
  return (data ?? []).map((m) => ({ userId: m.user_id, displayName: m.display_name }));
}
