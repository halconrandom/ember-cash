/**
 * Transacciones (02-transactions.png): filtros en la URL, lista agrupada por
 * día con paginación del servidor y el modal de agregar/editar (?tx=new o
 * ?tx=<id>). Todo respeta el scope (Personal por defecto).
 */
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { z } from "zod";

import { TopbarSubtitle } from "@/components/shell/topbar-context";
import { Card } from "@/components/ui/card";
import { SkeletonList } from "@/components/ui/skeleton";
import { getAccounts } from "@/lib/accounts/queries";
import { getCurrentProfile, requireUser } from "@/lib/auth/session";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config";
import { formatDate } from "@/lib/i18n/format";
import { getScope } from "@/lib/scope/server";
import { createClient } from "@/lib/supabase/server";
import { todayIn } from "@/lib/transactions/dates";
import { parseFilters } from "@/lib/transactions/filters";
import { groupByDay } from "@/lib/transactions/group";
import { getTransaction, listTransactions } from "@/lib/transactions/queries";

import { FilterBar } from "./filter-bar";
import { TransactionModal } from "./transaction-modal";
import { TransactionTable } from "./transaction-table";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function TransactionsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<TransactionsSkeleton />}>
      <TransactionsContent searchParams={searchParams} />
    </Suspense>
  );
}

/** Placeholder con la geometría de la pantalla mientras carga. */
function TransactionsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-10" />
      <Card className="px-6 py-8">
        <SkeletonList rows={6} />
      </Card>
    </div>
  );
}

async function TransactionsContent({ searchParams }: { searchParams: SearchParams }) {
  const [params, user, profile, scope, localeRaw, t] = await Promise.all([
    searchParams,
    requireUser(),
    getCurrentProfile(),
    getScope(),
    getLocale(),
    getTranslations("transactions"),
  ]);
  const locale = isLocale(localeRaw) ? localeRaw : DEFAULT_LOCALE;
  const today = todayIn(profile.timezone);
  const filters = parseFilters(params, today);
  const txParam = typeof params.tx === "string" ? params.tx : null;
  const editingId = txParam && z.uuid().safeParse(txParam).success ? txParam : null;

  const [page, accounts, members, editing] = await Promise.all([
    listTransactions(filters, scope, today),
    getAccounts(scope, { includeArchived: true }),
    scope.kind === "household" ? getMembers(scope.householdId) : Promise.resolve(null),
    editingId ? getTransaction(editingId) : Promise.resolve(null),
  ]);

  const monthLabel = formatDate(`${filters.month}-01`, locale, "monthYear");
  const subtitle =
    filters.range === "month"
      ? t("subtitleMonth", { count: page.total, month: monthLabel })
      : t("subtitle", { count: page.total });
  const filtered =
    filters.q !== "" ||
    filters.category !== "all" ||
    filters.account !== "all" ||
    filters.currency !== "all" ||
    filters.type !== "all";

  return (
    <div id="help-see-transactions" className="space-y-6">
      <TopbarSubtitle text={subtitle} />
      <FilterBar filters={filters} accounts={accounts} today={today} />
      <TransactionTable
        rows={page.rows}
        groups={groupByDay(page.rows, today, locale).map((g) => ({
          ...g,
          items: g.items.map((r) => r.id),
        }))}
        total={page.total}
        page={page.page}
        pageCount={page.pageCount}
        filtered={filtered}
      />
      <TransactionModal
        key={txParam ?? "closed"}
        open={txParam === "new" || Boolean(editing)}
        editing={editing}
        accounts={accounts.filter((a) => !a.archived_at || a.id === editing?.account?.id)}
        members={members}
        currentUserId={user.id}
        today={today}
      />
    </div>
  );
}

/** Miembros del hogar para "Pagó". */
async function getMembers(householdId: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_household_members", { hid: householdId });
  return (data ?? []).map((m) => ({ userId: m.user_id, displayName: m.display_name }));
}
