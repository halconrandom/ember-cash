/**
 * Más (docs/Phone/ember-cash-mobile-1-frames/m10). Deudas, suscripciones y
 * hogar salen de la barra inferior y viven aquí. Los conteos salen de las
 * consultas reales; si una falla, esa fila lo dice y las demás siguen.
 */
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { unstable_rethrow } from "next/navigation";

import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import type { IconName } from "@/components/ui/icon-registry";
import { getCurrentProfile, requireUser } from "@/lib/auth/session";
import {
  getDebtsSummary,
  getSubscriptionsSummary,
  type DebtsSummary,
  type SubscriptionsSummary,
} from "@/lib/dashboard/queries";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/i18n/config";
import { getMyHouseholds } from "@/lib/households/queries";
import { formatMoney } from "@/lib/money/format";
import { getScope } from "@/lib/scope/server";
import { todayIn } from "@/lib/transactions/dates";

export default function MorePage() {
  return (
    <Suspense fallback={<MoreSkeleton />}>
      <MoreContent />
    </Suspense>
  );
}

/** Tres bloques mientras llegan el perfil y los conteos. */
function MoreSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true">
      <Card className="h-20" />
      <Card className="h-48" />
      <Card className="h-16" />
    </div>
  );
}

async function MoreContent() {
  const user = await requireUser();
  const scopePromise = getScope();
  const [debts, subscriptions, households, profile, scope, localeRaw, t, tNav, tUser] =
    await Promise.all([
      settle(getDebtsSummary(todayIn())),
      settle(scopePromise.then((next) => getSubscriptionsSummary(next))),
      settle(getMyHouseholds(user.id)),
      settle(getCurrentProfile()),
      settle(scopePromise),
      getLocale(),
      getTranslations("more"),
      getTranslations("nav"),
      getTranslations("userCard"),
    ]);
  const locale: Locale = isLocale(localeRaw) ? localeRaw : DEFAULT_LOCALE;
  const shared =
    scope?.kind === "household"
      ? households?.find((item) => item.id === scope.householdId)
      : undefined;
  const home = shared ?? households?.[0];
  const name = profile?.display_name ?? user.email ?? tUser("fallbackName");

  return (
    <div className="space-y-4">
      <Link
        href="/settings"
        className="rounded-card border-card-edge bg-surface shadow-card flex min-h-16 items-center gap-3 border px-4 py-3"
      >
        <Avatar name={name} size={44} />
        <span className="min-w-0 flex-1">
          <span className="sr-only">{t("profileLabel")}</span>
          <span className="text-body text-ink block font-semibold">{name}</span>
          <span className="text-footnote text-ink-2 block">
            {shared?.name ?? tUser("personalSpace")}
          </span>
          {user.email && (
            <span className="text-footnote text-ink-3 block break-all">{user.email}</span>
          )}
        </span>
        <Icon name="angle-small-right" className="text-ink-3 shrink-0" />
      </Link>

      <Card className="divide-divider divide-y p-0">
        <MoreRow
          href="/debts"
          icon="credit-card"
          title={tNav("debts")}
          detail={debts ? debtDetail(debts, locale, t) : t("errorRow")}
        />
        <MoreRow
          href="/subscriptions"
          icon="refresh"
          title={tNav("subscriptions")}
          detail={subscriptions ? subscriptionDetail(subscriptions, locale, t) : t("errorRow")}
        />
        <MoreRow
          href="/household"
          icon="users"
          title={tNav("household")}
          detail={
            households
              ? home
                ? t("householdDetail", { name: home.name, count: home.members.length })
                : t("householdNone")
              : t("errorRow")
          }
        />
      </Card>

      <Card className="p-0">
        <MoreRow
          href="/settings"
          icon="settings"
          title={tNav("settings")}
          detail={t("settingsDetail")}
        />
      </Card>
    </div>
  );
}

function debtDetail(
  summary: DebtsSummary,
  locale: Locale,
  t: Awaited<ReturnType<typeof getTranslations>>,
): string {
  const count = t("debtsDetail", { count: summary.count });
  if (summary.balances.length === 0) return count;
  return `${count} · ${summary.balances.map((item) => formatMoney(item, locale)).join(" · ")}`;
}

function subscriptionDetail(
  summary: SubscriptionsSummary,
  locale: Locale,
  t: Awaited<ReturnType<typeof getTranslations>>,
): string {
  const count = t("subscriptionsDetail", { count: summary.count });
  if (summary.monthly.length === 0) return count;
  return `${count} · ${summary.monthly.map((item) => formatMoney(item, locale)).join(" · ")}`;
}

/** Una fila de Más: ícono, título, detalle y chevron. El detalle no se corta. */
function MoreRow({
  href,
  icon,
  title,
  detail,
}: {
  href: string;
  icon: IconName;
  title: string;
  detail: string;
}) {
  return (
    <Link href={href} className="flex min-h-16 items-center gap-3 px-4 py-3">
      <span className="bg-surface2 text-ink-2 rounded-control grid size-11 shrink-0 place-items-center">
        <Icon name={icon} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-body text-ink block font-semibold">{title}</span>
        <span className="text-footnote text-ink-2 block break-words tabular-nums">{detail}</span>
      </span>
      <Icon name="angle-small-right" className="text-ink-3 shrink-0" />
    </Link>
  );
}

/**
 * null si la consulta falla. unstable_rethrow deja pasar redirect() y
 * notFound() para no tragarse el control de Next.
 */
async function settle<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch (error) {
    unstable_rethrow(error);
    return null;
  }
}
