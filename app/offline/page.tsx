/**
 * Misma pantalla que public/offline.html, pero con los textos de
 * messages/*.json. El service worker no usa esta ruta: cuando no hay red
 * responde con el HTML estático, que no depende de la app.
 */
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";

export default async function OfflinePage() {
  const t = await getTranslations("offline");
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6">
      <h1 className="text-title1 text-ink">{t("title")}</h1>
      <p className="text-body text-ink-2 mt-2">{t("body")}</p>
      <form action="/" className="mt-6">
        <Button type="submit">{t("retry")}</Button>
      </form>
    </main>
  );
}
