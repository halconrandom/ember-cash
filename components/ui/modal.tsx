"use client";

/**
 * Modal (DESIGN_SPEC §7) y, bajo 600 px, bottom sheet
 * (docs/Phone/ember-cash-mobile-1-frames/m04).
 *
 * Escritorio: velo que se desvanece y superficie que escala de 0.96 a 1 en
 * 220 ms. Se cierra con Esc, el velo o la X. Sin arrastre.
 * Teléfono: grabber, esquinas superiores de 28 px y deslizamiento de 0.4 s.
 * El arrastre cierra si baja más de 96 px; más allá de 160 px el dedo
 * estira con goma (×0.3). Con movimiento reducido no hay gesto ni
 * desplazamiento. motion solo anima la opacidad: translate y scale viven en
 * CSS para no pelearse con el gesto.
 *
 * Base UI atrapa el foco y lo devuelve al cerrar.
 */
import { Dialog } from "@base-ui/react/dialog";
import { AnimatePresence, motion } from "motion/react";
import { useRef } from "react";

import { cn } from "@/lib/utils";

import { Icon } from "./icon";

/** 200-250 ms para una acción frecuente (spec §7). El sheet usa 0.4 s en CSS. */
const MODAL_TRANSITION = { duration: 0.22, ease: [0.23, 1, 0.32, 1] } as const;

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  closeLabel: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
};

export function Modal({ open, onClose, title, closeLabel, children, footer, className }: Props) {
  const drag = useRef<{ y: number; pointer: number } | null>(null);

  function popupOf(target: EventTarget | null): HTMLElement | null {
    return target instanceof Element ? target.closest("[role='dialog']") : null;
  }

  function onPointerDown(event: React.PointerEvent<HTMLElement>) {
    if (event.button !== 0) return;
    if ((event.target as Element).closest("button")) return;
    if (!window.matchMedia("(max-width: 599px)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const popup = popupOf(event.currentTarget);
    if (!popup) return;
    drag.current = { y: event.clientY, pointer: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
    popup.style.transition = "none";
  }

  function onPointerMove(event: React.PointerEvent<HTMLElement>) {
    const start = drag.current;
    if (!start || start.pointer !== event.pointerId) return;
    const popup = popupOf(event.currentTarget);
    if (!popup) return;
    const dy = event.clientY - start.y;
    // Hacia arriba casi no se mueve. Hacia abajo, goma a partir de 160 px.
    const shown = dy < 0 ? dy * 0.3 : dy > 160 ? 160 + (dy - 160) * 0.3 : dy;
    popup.style.translate = `0 ${shown}px`;
  }

  function onPointerUp(event: React.PointerEvent<HTMLElement>) {
    const start = drag.current;
    if (!start || start.pointer !== event.pointerId) return;
    drag.current = null;
    const popup = popupOf(event.currentTarget);
    const dy = event.clientY - start.y;
    if (popup) {
      popup.style.transition = "";
      popup.style.translate = "";
    }
    if (dy > 96) onClose();
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal keepMounted>
            <Dialog.Backdrop
              className="fixed inset-0 z-50 min-h-dvh bg-[var(--scrim)]"
              render={
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={MODAL_TRANSITION}
                />
              }
            />
            <Dialog.Popup
              className={cn(
                "modal-popup rounded-modal border-card-edge bg-surface text-ink shadow-pop fixed z-50 flex w-[600px] max-w-[calc(100vw-2rem)] flex-col border",
                className,
              )}
              render={
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={MODAL_TRANSITION}
                />
              }
            >
              <div
                className="shrink-0 max-[599px]:touch-none"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                <div
                  aria-hidden
                  className="bg-border mx-auto mt-2 h-[5px] w-9 rounded-full min-[600px]:hidden"
                />
                <div className="flex items-center justify-between gap-4 px-5 pt-3 pb-4 min-[600px]:px-7 min-[600px]:pt-7 min-[600px]:pb-5">
                  <Dialog.Title className="text-title2 text-ink">{title}</Dialog.Title>
                  <Dialog.Close
                    aria-label={closeLabel}
                    className="bg-surface2 text-ink-2 hover:text-ink grid size-11 shrink-0 place-items-center rounded-full transition-colors duration-100"
                  >
                    <Icon name="cross-small" />
                  </Dialog.Close>
                </div>
              </div>
              <div className="modal-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-2 min-[600px]:px-7">
                {children}
              </div>
              {footer && (
                <div className="modal-footer bg-surface flex flex-wrap items-center gap-3 px-5 pt-4 pb-5 min-[600px]:px-7 min-[600px]:pt-5 min-[600px]:pb-7">
                  {footer}
                </div>
              )}
            </Dialog.Popup>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
