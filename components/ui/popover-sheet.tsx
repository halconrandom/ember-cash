"use client";

/**
 * Popover en escritorio / bottom sheet en móvil (mismo patrón que
 * <CurrencyPicker> y <HelpPanel>: Base UI Popover, `modal` según el ancho,
 * la hoja fija abajo por CSS bajo 600 px). Genérico: quien lo usa pone el
 * contenido (aquí lo usan el selector de ícono y el de categoría del modal
 * de suscripción, fase E6).
 */
import { Popover } from "@base-ui/react/popover";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

import { Icon } from "./icon";

/** ¿Bajo 600 px? Mismo punto de corte que Modal/CurrencyPicker. */
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia("(max-width: 599px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 599px)");
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isMobile;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  closeLabel: string;
  /** Contenido visual del disparador (el botón lo pone este componente). */
  trigger: React.ReactNode;
  triggerClassName?: string;
  triggerLabel?: string;
  /** Ancho del popover en escritorio. */
  width?: number;
  children: React.ReactNode;
};

export function PopoverSheet({
  open,
  onOpenChange,
  title,
  closeLabel,
  trigger,
  triggerClassName,
  triggerLabel,
  width = 320,
  children,
}: Props) {
  const isMobile = useIsMobile();

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange} modal={isMobile ? "trap-focus" : false}>
      <Popover.Trigger
        className={cn(
          "data-[popup-open]:outline-focus-ring data-[popup-open]:outline-2 data-[popup-open]:outline-offset-2 data-[popup-open]:outline-solid",
          triggerClassName,
        )}
        aria-label={triggerLabel}
      >
        {trigger}
      </Popover.Trigger>
      <Popover.Portal>
        {isMobile && <Popover.Backdrop className="fixed inset-0 z-50 min-h-dvh bg-[var(--scrim)]" />}
        <Popover.Positioner
          className="z-50 outline-none max-[599px]:!fixed max-[599px]:!inset-x-0 max-[599px]:!bottom-0 max-[599px]:!top-auto max-[599px]:!left-0 max-[599px]:!w-full max-[599px]:!transform-none"
          sideOffset={8}
          align="start"
        >
          <Popover.Popup
            style={!isMobile ? { width } : undefined}
            className={cn(
              "rounded-modal border-card-edge bg-surface shadow-pop flex max-h-[70dvh] flex-col border",
              "max-[599px]:w-full max-[599px]:rounded-b-none max-[599px]:rounded-t-[28px] max-[599px]:pb-[env(safe-area-inset-bottom)] min-[600px]:rounded-card",
            )}
          >
            <div
              aria-hidden
              className="bg-border mx-auto mt-2 h-[5px] w-9 shrink-0 rounded-full max-[599px]:block min-[600px]:hidden"
            />
            <div className="flex shrink-0 items-center justify-between gap-3 px-4 pt-3 pb-2">
              <Popover.Title className="text-callout text-ink-2 font-semibold">
                {title}
              </Popover.Title>
              <Popover.Close
                aria-label={closeLabel}
                className="bg-surface2 text-ink-2 hover:text-ink grid size-9 shrink-0 place-items-center rounded-full transition-colors duration-100"
              >
                <Icon name="cross-small" size={16} />
              </Popover.Close>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
