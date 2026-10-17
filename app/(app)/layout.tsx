/**
 * Layout del grupo protegido (app). Todo lo que está aquí requiere sesión:
 * proxy.ts ya redirige a /login, y requireUser() lo vuelve a comprobar en el
 * servidor por si el proxy no corrió.
 *
 * La comprobación lee cookies, así que va dentro de <Suspense> (cacheComponents).
 */
import { Suspense } from "react";

import { ui } from "@/components/provisional/styles";
import { requireUser } from "@/lib/auth/session";

export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <Suspense fallback={null}>
      <AuthGate>{children}</AuthGate>
    </Suspense>
  );
}

/** Verifica la sesión y dibuja una barra superior provisional. */
async function AuthGate({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-border bg-card flex items-center justify-between gap-4 border-b px-4 py-3 sm:px-8">
        <span className={ui.headline}>Ember Cash</span>
        <div className="flex min-w-0 items-center gap-3">
          <span className={`${ui.helper} truncate`}>{user.email}</span>
          <form action="/auth/signout" method="post">
            <button type="submit" className={ui.link}>
              Cerrar sesión
            </button>
          </form>
        </div>
      </header>
      <main className="flex flex-1 justify-center px-4 py-10 sm:px-8">{children}</main>
    </div>
  );
}
