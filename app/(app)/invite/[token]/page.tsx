/**
 * /invite/[token]: aceptar una invitación a un household.
 * No se acepta al abrir la página (un prefetch o un antivirus que abra el link
 * gastaría el token); hay que pulsar el botón.
 *
 * El texto es estático; el token (dato de la URL) se lee dentro de <Suspense>.
 */
import { Suspense } from "react";

import { ui } from "@/components/provisional/styles";

import { AcceptInvite } from "./accept-invite";

type Params = Promise<{ token: string }>;

export default function InvitePage({ params }: { params: Params }) {
  return (
    <div className={`${ui.card} w-full max-w-md space-y-4 self-start`}>
      <h1 className={ui.title}>Invitación</h1>
      <p className={ui.body2}>
        Te invitaron a un household de Ember Cash. Al aceptar, compartirás con esa persona los datos
        del household.
      </p>
      <Suspense fallback={null}>
        <AcceptInviteFromParams params={params} />
      </Suspense>
    </div>
  );
}

/** Lee el token de la URL y muestra el botón para aceptar. */
async function AcceptInviteFromParams({ params }: { params: Params }) {
  const { token } = await params;
  return <AcceptInvite token={token} />;
}
