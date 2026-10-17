"use client";

/**
 * Modal (DESIGN_SPEC §7): el Dialog de Animate UI sobre Base UI
 * (animate-ui.com, primitives/base/dialog), con la duración de la spec. El
 * velo se desvanece y la superficie escala de 0.96 a 1 con opacidad en
 * 220 ms (ease-out), mismo camino al cerrar (AnimatePresence + keepMounted,
 * como el original). Sin el giro ni el desenfoque del original: la spec pide
 * solo escala y opacidad.
 *
 * Se cierra con Esc, clic en el velo o el botón X; sin arrastrar para cerrar
 * en escritorio. Base UI se encarga del foco atrapado y de devolverlo al
 * cerrar. Con movimiento reducido (MotionConfig "user") la escala se omite y
 * queda solo la opacidad.
 */
import { Dialog } from "@base-ui/react/dialog";
import { AnimatePresence, motion } from "motion/react";

import { cn } from "@/lib/utils";

import { Icon } from "./icon";

/** 200-250 ms para una acción frecuente (spec §7). */
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
                "rounded-modal border-card-edge bg-surface text-ink shadow-pop fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[600px] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col border",
                className,
              )}
              render={
                <motion.div
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={MODAL_TRANSITION}
                />
              }
            >
              <div className="flex items-center justify-between gap-4 px-7 pt-7 pb-5">
                <Dialog.Title className="text-title2 text-ink">{title}</Dialog.Title>
                <Dialog.Close
                  aria-label={closeLabel}
                  className="bg-surface2 text-ink-2 hover:text-ink grid size-10 shrink-0 place-items-center rounded-full transition-colors duration-100"
                >
                  <Icon name="cross-small" />
                </Dialog.Close>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-7 pb-2">{children}</div>
              {footer && (
                <div className="flex flex-wrap items-center gap-3 px-7 pt-5 pb-7">{footer}</div>
              )}
            </Dialog.Popup>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
