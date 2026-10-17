/**
 * Shell de la app (01-dashboard.png): sidebar de 248 px, topbar de 72 px y
 * contenido con padding de 32 px. El sidebar y el topbar persisten entre
 * rutas; solo cambia el contenido, sin transición de página.
 */
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { UserCard, UserCardSkeleton } from "@/components/shell/user-card";
import { getCurrentProfile, requireUser } from "@/lib/auth/session";
import { getMyHouseholds } from "@/lib/households/queries";

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
      <div className="flex min-w-0 flex-col">
        <Topbar />
        <main className="flex-1 px-4 pt-4 pb-8 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

/** Tarjeta del usuario con su nombre y su espacio (hogar o personal). */
async function CurrentUserCard() {
  const user = await requireUser();
  const [profile, households, t] = await Promise.all([
    getCurrentProfile(),
    getMyHouseholds(user.id),
    getTranslations("userCard"),
  ]);
  return (
    <UserCard
      name={profile.display_name ?? user.email ?? t("fallbackName")}
      space={households[0]?.name ?? t("personalSpace")}
      settingsLabel={t("settings")}
    />
  );
}
