/**
 * Shell de la app. Tres anchos, según docs/Phone/ember-cash-mobile-1-frames/
 * y docs/Phone/full/:
 * - <600 px: barra inferior y contenido a todo el ancho.
 * - 600–1023 px: rail de 96 px.
 * - ≥1024 px: sidebar de 248 px y contenido de hasta 1128 px.
 * El interruptor Personal / Compartido del shell solo se ve en escritorio.
 * En el teléfono y la tablet vive dentro de Hogar.
 */
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { ScopeRow, ScopeRowFallback } from "@/components/shell/scope-row";
import { Sidebar } from "@/components/shell/sidebar";
import { TabBar } from "@/components/shell/tab-bar";
import { Topbar } from "@/components/shell/topbar";
import { TopbarProvider } from "@/components/shell/topbar-context";
import { UserCard, UserCardSkeleton } from "@/components/shell/user-card";
import { getCurrentProfile, requireUser } from "@/lib/auth/session";
import { getMyHouseholds } from "@/lib/households/queries";
import { getScope } from "@/lib/scope/server";

export default function ShellLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col min-[600px]:grid min-[600px]:grid-cols-[96px_minmax(0,1fr)] lg:grid-cols-[248px_minmax(0,1fr)]">
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
          <main className="flex-1 px-4 pt-4 pb-[calc(4.25rem+env(safe-area-inset-bottom))] min-[600px]:pb-8 lg:px-8">
            <div className="lg:mx-auto lg:max-w-[1128px]">
              <Suspense fallback={<ScopeRowFallback />}>
                <CurrentScopeRow />
              </Suspense>
              {children}
            </div>
          </main>
          {/* Fija: no ocupa una celda del grid. */}
          <TabBar />
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
