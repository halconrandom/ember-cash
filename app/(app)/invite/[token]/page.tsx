/**
 * /invite/[token]: aceptar una invitación a un household.
 * No se acepta al abrir la página (un prefetch o un antivirus que abra el link
 * gastaría el token); hay que pulsar el botón.
 *
 * El texto es estático; el token (dato de la URL) se lee dentro de <Suspense>.
 */
import { Suspense } from "react";

import { Card } from "@/components/ui/card";
import { CenteredPage } from "@/components/ui/centered-page";

import { AcceptInvite } from "./accept-invite";

type Params = Promise<{ token: string }>;

export default function InvitePage({ params }: { params: Params }) {
  return (
    <CenteredPage>
      <Card className="space-y-4">
        <h1 className="text-title2 text-ink">Invitación</h1>
        <p className="text-body text-ink-2">
          Te invitaron a un household de Ember Cash. Al aceptar, compartirás con esa persona los
          datos del household.
        </p>
        <Suspense fallback={null}>
          <AcceptInviteFromParams params={params} />
        </Suspense>
      </Card>
    </CenteredPage>
  );
}

/** Lee el token de la URL y muestra el botón para aceptar. */
async function AcceptInviteFromParams({ params }: { params: Params }) {
  const { token } = await params;
  return <AcceptInvite token={token} />;
}
