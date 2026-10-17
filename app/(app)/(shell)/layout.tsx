/**
 * Shell de la app (01-dashboard.png): sidebar de 248 px, topbar de 72 px y
 * contenido con padding de 32 px. El sidebar y el topbar persisten entre
 * rutas; solo cambia el contenido, sin transición de página. Sobre el
 * contenido, en las rutas que dependen del scope, va el interruptor
 * Personal / Compartido.
 */
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { Sidebar } from "@/components/shell/sidebar";
import { ScopeRow, ScopeRowFallback } from "@/components/shell/scope-row";
import { Topbar } from "@/components/shell/topbar";
import { TopbarProvider } from "@/components/shell/topbar-context";
import { UserCard, UserCardSkeleton } from "@/components/shell/user-card";
import { getCurrentProfile, requireUser } from "@/lib/auth/session";
import { getMyHouseholds } from "@/lib/households/queries";
import { getScope } from "@/lib/scope/server";

export default function ShellLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <Sidebar
        userCard={
          <Suspense fallback={<UserCardSkeleton />}>
            <CurrentUserCard />
          </Suspense>
        }
      />
      <TopbarProvider>
        <div className="flex min-w-0 flex-col">
          <Topbar />
          <main className="flex-1 px-4 pt-4 pb-8 lg:px-8">
            <Suspense fallback={<ScopeRowFallback />}>
              <CurrentScopeRow />
            </Suspense>
            {children}
          </main>
        </div>
      </TopbarProvider>
    </div>
  );
}

/** Interruptor con el scope actual y el hogar del usuario. */
async function CurrentScopeRow() {
  const user = await requireUser();
  const [scope, households] = await Promise.all([getScope(), getMyHouseholds(user.id)]);
  return (
    <ScopeRow
      scope={scope.kind === "household" ? "shared" : "personal"}
      householdId={scope.kind === "household" ? scope.householdId : (households[0]?.id ?? null)}
    />
  );
}

/** Tarjeta del usuario con su nombre y su espacio (el hogar en scope Compartido). */
async function CurrentUserCard() {
  const user = await requireUser();
  const [profile, households, scope, t] = await Promise.all([
    getCurrentProfile(),
    getMyHouseholds(user.id),
    getScope(),
    getTranslations("userCard"),
  ]);
  const shared =
    scope.kind === "household" ? households.find((h) => h.id === scope.householdId) : undefined;
  return (
    <UserCard
      name={profile.display_name ?? user.email ?? t("fallbackName")}
      space={shared?.name ?? t("personalSpace")}
      settingsLabel={t("settings")}
    />
  );
}
