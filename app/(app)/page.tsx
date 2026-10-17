/**
 * Página principal provisional. Muestra el household del usuario y sus
 * miembros; el owner puede generar un link de invitación. Si el usuario no ha
 * hecho el onboarding, lo manda a /onboarding. El dashboard real llega en
 * fases posteriores.
 *
 * Los datos van dentro de <Suspense> para que la navegación sea instantánea
 * (cacheComponents): primero se ve el placeholder y luego el contenido.
 */
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { LoadingCard } from "@/components/provisional/loading-card";
import { ui } from "@/components/provisional/styles";
import { getCurrentProfile, requireUser } from "@/lib/auth/session";
import { getMaxHouseholdMembers, getMyHouseholds } from "@/lib/households/queries";

import { InviteLink } from "./invite-link";

export default function HomePage() {
  return (
    <div className="w-full max-w-xl space-y-6">
      <Suspense fallback={<LoadingCard />}>
        <HomeContent />
      </Suspense>
    </div>
  );
}

/** Parte dinámica: perfil, households y miembros. */
async function HomeContent() {
  const user = await requireUser();
  const profile = await getCurrentProfile();
  if (!profile.onboarded_at) redirect("/onboarding");

  const [households, maxMembers] = await Promise.all([
    getMyHouseholds(user.id),
    getMaxHouseholdMembers(),
  ]);

  return (
    <>
      <div>
        <h1 className={ui.title}>Hola, {profile.display_name ?? "de nuevo"}</h1>
        <p className={`${ui.body2} mt-1`}>
          {households.length === 0 ? "Estás usando Ember Cash solo." : "Este es tu household."}
        </p>
      </div>

      {households.map((household) => (
        <section key={household.id} className={`${ui.card} space-y-5`}>
          <div>
            <h2 className={ui.headline}>{household.name}</h2>
            <p className={ui.helper}>
              {household.members.length} de {maxMembers} miembros
            </p>
          </div>

          <ul className="divide-border divide-y">
            {household.members.map((member) => (
              <li key={member.userId} className="flex items-center justify-between gap-3 py-3">
                <span className="text-[0.875rem] font-medium">
                  {member.displayName ?? "Sin nombre"}
                  {member.userId === user.id && <span className={ui.helper}> (tú)</span>}
                </span>
                <span className={ui.helper}>{member.role === "owner" ? "Owner" : "Miembro"}</span>
              </li>
            ))}
          </ul>

          {household.myRole === "owner" && household.members.length < maxMembers && (
            <InviteLink householdId={household.id} />
          )}
        </section>
      ))}
    </>
  );
}
