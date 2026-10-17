/**
 * /invite/[token]: aceptar una invitación a un hogar.
 * No se acepta al abrir la página (un prefetch o un antivirus que abra el
 * enlace gastaría el token); hay que pulsar el botón.
 *
 * El texto es estático; el token (dato de la URL) se lee dentro de <Suspense>.
 */
import { useTranslations } from "next-intl";
import { Suspense } from "react";

import { Card } from "@/components/ui/card";
import { CenteredPage } from "@/components/ui/centered-page";

import { AcceptInvite } from "./accept-invite";

type Params = Promise<{ token: string }>;

export default function InvitePage({ params }: { params: Params }) {
  const t = useTranslations("invite");
  return (
    <CenteredPage>
      <Card className="space-y-4">
        <h1 className="text-title2 text-ink">{t("title")}</h1>
        <p className="text-body text-ink-2">{t("description")}</p>
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
