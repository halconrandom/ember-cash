"use client";

/**
 * Modal (DESIGN_SPEC §7): velo que se desvanece y superficie que escala de
 * 0.96 a 1 con opacidad en 220 ms, mismo camino al cerrar. Se cierra con Esc,
 * clic en el velo o el botón X. Sin arrastrar para cerrar en escritorio.
 * Base UI Dialog se encarga del foco atrapado y de devolverlo al cerrar.
 */
import { Dialog } from "@base-ui/react/dialog";

import { cn } from "@/lib/utils";

import { Icon } from "./icon";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  closeLabel: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
};

export function Modal({ open, onClose, title, closeLabel, children, footer, className }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 min-h-dvh bg-[var(--scrim)] transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup
          className={cn(
            "rounded-modal border-card-edge bg-surface text-ink shadow-pop fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[600px] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col border",
            "transition-[scale,opacity] duration-[220ms] ease-[var(--ease-out-ember)] data-ending-style:scale-[0.96] data-ending-style:opacity-0 data-starting-style:scale-[0.96] data-starting-style:opacity-0",
            "motion-reduce:transition-opacity motion-reduce:data-ending-style:scale-100 motion-reduce:data-starting-style:scale-100",
            className,
          )}
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
    </Dialog.Root>
  );
}
