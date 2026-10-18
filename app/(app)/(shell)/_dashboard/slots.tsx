/**
 * Tarjetas del dashboard como componentes de servidor (cada una en su
 * <Suspense> desde la página). Cada slot lee sus datos con safe(): si la
 * lectura falla, esa tarjeta se dibuja con CardError ("Reintentar") y las
 * demás siguen. Están en un módulo aparte para poder probarlas
 * (slots.test.tsx); un page.tsx solo puede exportar la página.
 */
import { redirect, unstable_rethrow } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { TopbarSubtitle } from "@/components/shell/topbar-context";
import { getCurrentProfile, requireUser } from "@/lib/auth/session";
import { lastMonths } from "@/lib/dashboard/aggregate";
import {
  getAggregates,
  getDebtsSummary,
  getGoalsSummary,
  getSubscriptionsSummary,
  getUpcomingPayments,
} from "@/lib/dashboard/queries";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config";
import { formatDate } from "@/lib/i18n/format";
import { logServerError } from "@/lib/log/server";
import { getScope } from "@/lib/scope/server";
import { shiftMonth, todayIn } from "@/lib/transactions/dates";
import { parseFilters } from "@/lib/transactions/filters";

import { CardError } from "./card-error";
import { CategoryCard } from "./category-card";
import { StatCard } from "./stat-cards";
import { DebtsCard, GoalsCard, SubscriptionsCard, UpcomingCard } from "./summary-cards";
import { TrendCard } from "./trend-card";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Marca de una lectura que falló. */
export const FAILED = Symbol("failed");

/**
 * Lee los datos de una tarjeta. Si fallan, devuelve FAILED para dibujar esa
 * tarjeta en error. Los errores internos de Next (redirect, render dinámico)
 * se relanzan con unstable_rethrow para no romper su manejo.
 */
export async function safe<T>(load: () => Promise<T>): Promise<T | typeof FAILED> {
  try {
    return await load();
  } catch (error) {
    unstable_rethrow(error);
    logServerError("dashboard", error);
    return FAILED;
  }
}

export async function OnboardingGuard() {
  const profile = await getCurrentProfile();
  if (!profile.onboarded_at) redirect("/onboarding");
  return null;
}

/** Hoy (zona del perfil) y el mes elegido en la URL. */
export async function context(searchParams: SearchParams) {
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

export async function Subtitle({ searchParams }: { searchParams: SearchParams }) {
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

export async function StatSlot({
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

export async function CategorySlot({ searchParams }: { searchParams: SearchParams }) {
  const data = await safe(() => aggregatesFor(searchParams));
  if (data === FAILED) {
    const t = await getTranslations("dashboard");
    return <CardError title={t("byCategory")} />;
  }
  return <CategoryCard rows={data.rows} month={data.month} />;
}

export async function TrendSlot({ searchParams }: { searchParams: SearchParams }) {
  const data = await safe(() => aggregatesFor(searchParams));
  if (data === FAILED) {
    const t = await getTranslations("dashboard");
    return <CardError title={t("trend")} />;
  }
  return <TrendCard rows={data.rows} month={data.month} />;
}

export async function UpcomingSlot() {
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

export async function GoalsSlot() {
  const data = await safe(async () => getGoalsSummary(await getScope()));
  if (data === FAILED) {
    const t = await getTranslations("dashboard");
    return <CardError title={t("goals")} />;
  }
  return <GoalsCard summary={data} />;
}

export async function DebtsSlot() {
  const data = await safe(async () =>
    getDebtsSummary(todayIn((await getCurrentProfile()).timezone)),
  );
  if (data === FAILED) {
    const t = await getTranslations("dashboard");
    return <CardError title={t("debts")} />;
  }
  return <DebtsCard summary={data} />;
}

export async function SubscriptionsSlot() {
  const data = await safe(async () => getSubscriptionsSummary(await getScope()));
  if (data === FAILED) {
    const t = await getTranslations("dashboard");
    return <CardError title={t("subscriptions")} />;
  }
  return <SubscriptionsCard summary={data} />;
}
