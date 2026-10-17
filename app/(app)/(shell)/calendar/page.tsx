/**
 * Calendario: mes, día seleccionado y resumen. ?month elige el mes (el mismo
 * parámetro que la topbar), ?day el día y ?event=new abre "Agregar pago".
 */
import { Suspense } from "react";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getAccounts } from "@/lib/accounts/queries";
import { getCurrentProfile, requireUser } from "@/lib/auth/session";
import { listCalendar } from "@/lib/recurring/queries";
import { getScope } from "@/lib/scope/server";
import { monthBounds, MONTH_PATTERN, todayIn } from "@/lib/transactions/dates";

import { CalendarMonthFade, CalendarView } from "./calendar-view";
import { SubscriptionModal } from "../subscriptions/subscription-modal";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function CalendarPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<CalendarSkeleton />}>
      <CalendarContent searchParams={searchParams} />
    </Suspense>
  );
}

function CalendarSkeleton() {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]" role="status" aria-busy="true">
      <Card className="h-[640px]">
        <Skeleton className="h-8 w-40 rounded-full" />
      </Card>
      <div className="space-y-6">
        <Card className="h-64" />
        <Card className="h-64" />
      </div>
    </div>
  );
}

async function CalendarContent({ searchParams }: { searchParams: SearchParams }) {
  const [params, profile, scope, user] = await Promise.all([
    searchParams,
    getCurrentProfile(),
    getScope(),
    requireUser(),
  ]);
  const today = todayIn(profile.timezone);
  const monthParam = typeof params.month === "string" ? params.month : "";
  const month = MONTH_PATTERN.test(monthParam) ? monthParam : today.slice(0, 7);
  const { from, to } = monthBounds(month);
  const dayParam = typeof params.day === "string" ? params.day : "";
  const initialDay =
    dayParam >= from && dayParam <= to ? dayParam : today >= from && today <= to ? today : from;
  const [{ events, nextPayday }, accounts] = await Promise.all([
    listCalendar(scope, month, today, user.id),
    getAccounts(scope),
  ]);
  const creating = params.event === "new";

  return (
    <>
      <CalendarMonthFade month={month}>
        <CalendarView
          key={month}
          month={month}
          today={today}
          initialDay={initialDay}
          events={events}
          nextPayday={nextPayday}
          accounts={accounts}
        />
      </CalendarMonthFade>
      <SubscriptionModal
        key={creating ? "new-event" : "closed"}
        open={creating}
        editing={null}
        initialKind="bill"
        today={today}
        param="event"
      />
    </>
  );
}
