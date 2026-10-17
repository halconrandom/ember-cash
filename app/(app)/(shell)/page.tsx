/**
 * Dashboard (01-dashboard.png / 09-dashboard-dark.png). Si el usuario no
 * terminó el onboarding, lo manda a /onboarding.
 *
 * Cada tarjeta es un componente de servidor con su propio <Suspense>
 * (cargando) y su propia lectura protegida con safe() (error): una consulta
 * que falla muestra esa tarjeta en error y las demás siguen. Las cinco tarjetas de dinero
 * comparten una sola consulta agregada (getAggregates, con cache de React).
 * Todo respeta el scope y el mes elegido (?month); "Agregar" de la topbar
 * abre el modal de transacciones aquí mismo (?tx=new).
 */
import { redirect, unstable_rethrow } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { TopbarSubtitle } from "@/components/shell/topbar-context";
import { getAccounts } from "@/lib/accounts/queries";
import { getCurrentProfile, requireUser } from "@/lib/auth/session";
import { lastMonths } from "@/lib/dashboard/aggregate";
import {
  getAggregates,
  getDebtsSummary,
  getGoalsSummary,
  getSubscriptionsSummary,
  getUpcomingPayments,
} from "@/lib/dashboard/queries";
import { formatDate } from "@/lib/i18n/format";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config";
import { getScope } from "@/lib/scope/server";
import { createClient } from "@/lib/supabase/server";
import { shiftMonth, todayIn } from "@/lib/transactions/dates";
import { parseFilters } from "@/lib/transactions/filters";

import { CardError } from "./_dashboard/card-error";
import { CardSkeleton } from "./_dashboard/card-frame";
import { CategoryCard } from "./_dashboard/category-card";
import { StatCard } from "./_dashboard/stat-cards";
import { DebtsCard, GoalsCard, SubscriptionsCard, UpcomingCard } from "./_dashboard/summary-cards";
import { TrendCard } from "./_dashboard/trend-card";
import { TransactionModal } from "./transactions/transaction-modal";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <Suspense fallback={null}>
        <OnboardingGuard />
      </Suspense>
      <Suspense fallback={null}>
        <Subtitle searchParams={searchParams} />
      </Suspense>
      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-3">
          {(["balance", "income", "expenses"] as const).map((card) => (
            <Suspense key={card} fallback={<CardSkeleton rows={0} className="min-h-[188px]" />}>
              <StatSlot searchParams={searchParams} card={card} />
            </Suspense>
          ))}
        </div>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          <Suspense fallback={<CardSkeleton rows={7} className="min-h-[420px]" />}>
            <CategorySlot searchParams={searchParams} />
          </Suspense>
          <Suspense fallback={<CardSkeleton rows={7} className="min-h-[420px]" />}>
            <TrendSlot searchParams={searchParams} />
          </Suspense>
        </div>
        <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
          <Suspense fallback={<CardSkeleton rows={5} />}>
            <UpcomingSlot />
          </Suspense>
          <Suspense fallback={<CardSkeleton rows={5} />}>
            <GoalsSlot />
          </Suspense>
          <div className="space-y-6">
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

/** Marca de una lectura que falló. */
const FAILED = Symbol("failed");

/**
 * Lee los datos de una tarjeta. Si fallan, devuelve FAILED para dibujar esa
 * tarjeta en error. Los errores internos de Next (redirect, render dinámico)
 * se relanzan con unstable_rethrow para no romper su manejo.
 */
async function safe<T>(load: () => Promise<T>): Promise<T | typeof FAILED> {
  try {
    return await load();
  } catch (error) {
    unstable_rethrow(error);
    console.error("Dashboard: no se pudo cargar una tarjeta", error);
    return FAILED;
  }
}

async function OnboardingGuard() {
  const profile = await getCurrentProfile();
  if (!profile.onboarded_at) redirect("/onboarding");
  return null;
}

/** Hoy (zona del perfil) y el mes elegido en la URL. */
async function context(searchParams: SearchParams) {
  const [params, profile, scope] = await Promise.all([
    searchParams,
    getCurrentProfile(),
    getScope(),
  ]);
  const today = todayIn(profile.timezone);
  const { month } = parseFilters(params, today);
  return { params, today, month, scope };
}

/** Rango de la consulta agregada: los 6 meses de la tendencia (incluye el anterior). */
async function aggregatesFor(searchParams: SearchParams) {
  const { month, scope } = await context(searchParams);
  const months = lastMonths(month, 6);
  const rows = await getAggregates(scope, months[0], month);
  return { rows, month };
}

async function Subtitle({ searchParams }: { searchParams: SearchParams }) {
  const [{ month }, localeRaw, t] = await Promise.all([
    context(searchParams),
    getLocale(),
    getTranslations("dashboard"),
  ]);
  const locale = isLocale(localeRaw) ? localeRaw : DEFAULT_LOCALE;
  return (
    <TopbarSubtitle
      text={t("subtitle", { month: formatDate(`${month}-01`, locale, "monthYear") })}
    />
  );
}

async function StatSlot({
  searchParams,
  card,
}: {
  searchParams: SearchParams;
  card: "balance" | "income" | "expenses";
}) {
  const data = await safe(() => aggregatesFor(searchParams));
  if (data === FAILED) {
    const t = await getTranslations("dashboard");
    return <CardError title={t(card)} className="min-h-[188px]" />;
  }
  return (
    <StatCard
      rows={data.rows}
      month={data.month}
      previousMonth={shiftMonth(data.month, -1)}
      card={card}
    />
  );
}

async function CategorySlot({ searchParams }: { searchParams: SearchParams }) {
  const data = await safe(() => aggregatesFor(searchParams));
  if (data === FAILED) {
    const t = await getTranslations("dashboard");
    return <CardError title={t("byCategory")} />;
  }
  return <CategoryCard rows={data.rows} month={data.month} />;
}

async function TrendSlot({ searchParams }: { searchParams: SearchParams }) {
  const data = await safe(() => aggregatesFor(searchParams));
  if (data === FAILED) {
    const t = await getTranslations("dashboard");
    return <CardError title={t("trend")} />;
  }
  return <TrendCard rows={data.rows} month={data.month} />;
}

async function UpcomingSlot() {
  const data = await safe(async () => {
    const [profile, scope, user] = await Promise.all([
      getCurrentProfile(),
      getScope(),
      requireUser(),
    ]);
    const today = todayIn(profile.timezone);
    return { today, ...(await getUpcomingPayments(scope, today, user.id)) };
  });
  if (data === FAILED) {
    const t = await getTranslations("dashboard");
    return <CardError title={t("upcoming")} />;
  }
  return <UpcomingCard items={data.items} total={data.total} today={data.today} />;
}

async function GoalsSlot() {
  const data = await safe(async () => getGoalsSummary(await getScope()));
  if (data === FAILED) {
    const t = await getTranslations("dashboard");
    return <CardError title={t("goals")} />;
  }
  return <GoalsCard summary={data} />;
}

async function DebtsSlot() {
  const data = await safe(async () =>
    getDebtsSummary(todayIn((await getCurrentProfile()).timezone)),
  );
  if (data === FAILED) {
    const t = await getTranslations("dashboard");
    return <CardError title={t("debts")} />;
  }
  return <DebtsCard summary={data} />;
}

async function SubscriptionsSlot() {
  const data = await safe(async () => getSubscriptionsSummary(await getScope()));
  if (data === FAILED) {
    const t = await getTranslations("dashboard");
    return <CardError title={t("subscriptions")} />;
  }
  return <SubscriptionsCard summary={data} />;
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
