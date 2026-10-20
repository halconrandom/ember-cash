"use client";

/**
 * Panel de ayuda (fase F2): lateral de 360 px y no modal en escritorio (el
 * resto de la página sigue interactiva, sin velo); bottom sheet modal bajo
 * 600 px, con foco atrapado y Escape para cerrar (Base UI Dialog, el mismo
 * componente que <Modal>, con `modal` según el ancho).
 *
 * Estructura (docs/onboarding/spec.md): propósito; "Qué ves aquí" con
 * "Mostrar" (resalta la sección de la página, sin tapar nada); "Qué puedes
 * hacer"; preguntas frecuentes (acordeón nativo <details>); pie con
 * "Repetir la introducción" (fase F3: abre /onboarding?replay=1, con los
 * valores actuales precargados; no borra ni duplica nada).
 */
import { Dialog } from "@base-ui/react/dialog";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config";
import { loadHelpContent, type HelpContent, type HelpPageReady } from "@/lib/help/content";

const PANEL_TRANSITION = { duration: 0.22, ease: [0.23, 1, 0.32, 1] } as const;

/** Desplaza y resalta la sección de la página, sin tapar nada (sin velo). */
function showSection(id: string, reduce: boolean | null) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  el.classList.add("help-highlight");
  window.setTimeout(() => el.classList.remove("help-highlight"), 1600);
}

type Props = {
  page: HelpPageReady;
  open: boolean;
  onClose: () => void;
};

export function HelpPanel({ page, open, onClose }: Props) {
  const t = useTranslations("help.common");
  const localeRaw = useLocale();
  const locale = isLocale(localeRaw) ? localeRaw : DEFAULT_LOCALE;
  const reduce = useReducedMotion();
  // Lee matchMedia una vez (false en el servidor, donde no hay window; el
  // panel no se ve en SSR porque solo se monta de verdad cuando open=true).
  const [isMobile, setIsMobile] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia("(max-width: 599px)").matches,
  );
  const [content, setContent] = useState<HelpContent | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 599px)");
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    loadHelpContent(page, locale).then((c) => {
      if (!cancelled) setContent(c);
    });
    return () => {
      cancelled = true;
    };
  }, [open, page, locale]);

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()} modal={isMobile}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal keepMounted>
            {isMobile && (
              <Dialog.Backdrop
                className="fixed inset-0 z-50 min-h-dvh bg-[var(--scrim)]"
                render={
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={PANEL_TRANSITION}
                  />
                }
              />
            )}
            <Dialog.Popup
              className="help-panel rounded-modal border-card-edge bg-surface text-ink shadow-pop fixed z-50 flex flex-col border"
              render={
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={PANEL_TRANSITION}
                />
              }
            >
              <div
                aria-hidden
                className="bg-border mx-auto mt-2 h-[5px] w-9 rounded-full max-[599px]:block min-[600px]:hidden"
              />
              <div className="border-divider flex items-center justify-between gap-4 border-b px-5 py-4">
                <Dialog.Title className="text-title2 text-ink">{t("button")}</Dialog.Title>
                <Dialog.Close
                  aria-label={t("close")}
                  className="bg-surface2 text-ink-2 hover:text-ink grid size-11 shrink-0 place-items-center rounded-full transition-colors duration-100"
                >
                  <Icon name="cross-small" />
                </Dialog.Close>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                {!content ? (
                  <div className="space-y-3">
                    <div className="bg-surface2 h-4 w-3/4 animate-pulse rounded-full" />
                    <div className="bg-surface2 h-4 w-full animate-pulse rounded-full" />
                    <div className="bg-surface2 h-4 w-5/6 animate-pulse rounded-full" />
                  </div>
                ) : (
                  <div className="space-y-6">
                    <p className="text-body text-ink">{content.purpose}</p>

                    <section className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <h2 className="text-callout text-ink-2 font-semibold">
                          {t("whatYouSee")}
                        </h2>
                        <button
                          type="button"
                          onClick={() => showSection(`help-see-${page}`, reduce)}
                          className="text-callout text-ember-text press-scale font-semibold"
                        >
                          {t("show")}
                        </button>
                      </div>
                      <p className="text-body text-ink-2">{content.see}</p>
                    </section>

                    <section className="space-y-2">
                      <h2 className="text-callout text-ink-2 font-semibold">
                        {t("whatYouCanDo")}
                      </h2>
                      <p className="text-body text-ink-2">{content.do}</p>
                    </section>

                    <section className="space-y-2">
                      <h2 className="text-callout text-ink-2 font-semibold">{t("faq")}</h2>
                      <div className="divide-divider divide-y">
                        {content.faq.map((item, i) => (
                          <details key={i} className="group py-2">
                            <summary className="text-body text-ink marker:text-ink-3 cursor-pointer font-medium">
                              {item.q}
                            </summary>
                            <p className="text-body text-ink-2 mt-2">{item.a}</p>
                          </details>
                        ))}
                      </div>
                    </section>
                  </div>
                )}
              </div>

              <div className="border-divider border-t px-5 py-4">
                <a
                  href="/onboarding?replay=1&step=0"
                  className="text-callout text-ember-text inline-flex min-h-11 items-center font-semibold"
                >
                  {t("replay")}
                </a>
              </div>
            </Dialog.Popup>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
