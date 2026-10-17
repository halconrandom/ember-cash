/**
 * /dev/design-system: hoja del sistema de diseño para comparar con
 * docs/design/10-design-system.png, 19-states.png y 20-states-dark.png.
 * Se dibuja dos veces, en claro y en oscuro. Solo existe en desarrollo.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { DesignSystemSheet } from "./sheet";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("designSystem");
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

export default async function DesignSystemPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const t = await getTranslations("designSystem");

  return (
    <div className="flex flex-col">
      {(["light", "dark"] as const).map((theme) => (
        // Cada mitad fuerza su tema con la clase: los tokens se recalculan dentro.
        <section
          key={theme}
          className={`${theme} bg-canvas`}
          aria-label={t("sectionLabel", {
            theme: t(theme === "light" ? "themeLight" : "themeDark"),
          })}
        >
          <DesignSystemSheet theme={theme} />
        </section>
      ))}
    </div>
  );
}
