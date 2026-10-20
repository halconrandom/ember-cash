"use client";

/**
 * Selector de moneda (fase E5, spec de Ivern): un popover de 280 px en
 * escritorio (role="listbox") y un bottom sheet de altura media en móvil
 * (mismo patrón que <HelpPanel>: Base UI Popover, con `modal` según el
 * ancho; la hoja queda fija abajo con clases responsivas, pisando el
 * posicionamiento flotante de Popover.Positioner bajo 600 px).
 *
 * Orden: primero las monedas usadas recientemente (lib/money/last-currency),
 * después el resto alfabético. Solo se listan `options` (normalmente
 * profiles.enabled_currencies).
 *
 * Teclado: el disparador abre con clic, Enter, Espacio (ya los da un
 * <button>) o Alt+↓. Dentro de la lista, ↑/↓ mueven el resaltado, Enter
 * elige, Escape cierra y devuelve el foco al disparador (lo hace Popover
 * por su cuenta), y escribir una letra salta a la primera moneda cuyo
 * código o nombre empiece por ella.
 */
import { Popover } from "@base-ui/react/popover";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";

import { useRate } from "@/components/money/rate-provider";
import type { CurrencyCode } from "@/lib/db/types";
import {
  orderCurrencyOptions,
  readRecentCurrencies,
  recordRecentCurrency,
} from "@/lib/money/last-currency";
import { cn } from "@/lib/utils";

import { Icon } from "./icon";

type Props = {
  value: CurrencyCode;
  onChange: (next: CurrencyCode) => void;
  /** Monedas que se listan; por defecto, profiles.enabled_currencies. */
  options?: readonly CurrencyCode[];
  /** Título del panel/sheet (p. ej. "Ver montos en"). */
  title?: string;
  /** Contenido visual del disparador (el botón lo pone este componente). */
  children: React.ReactNode;
  /** Clases del botón disparador. */
  triggerClassName?: string;
  /** Nombre accesible del disparador si el contenido visual no basta. */
  triggerLabel?: string;
};

/** ¿Bajo 600 px? (bottom sheet en vez de popover; mismo punto de corte que Modal/HelpPanel). */
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

export function CurrencyPicker({
  value,
  onChange,
  options,
  title,
  children,
  triggerClassName,
  triggerLabel,
}: Props) {
  const t = useTranslations("currency");
  const { enabledCurrencies } = useRate();
  const resolvedOptions = options ?? enabledCurrencies;
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(value);
  const itemRefs = useRef(new Map<CurrencyCode, HTMLElement>());
  const typeaheadChars = useRef("");
  const typeaheadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ordered = useMemo(
    () => orderCurrencyOptions(resolvedOptions, readRecentCurrencies()),
    // Solo se vuelve a calcular el orden al abrir: así no salta de lugar
    // una fila mientras la lista está abierta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resolvedOptions, open],
  );

  // Al abrir, el resaltado arranca en la moneda elegida (patrón de estado
  // derivado durante el render, no en un efecto: evita el cascading render).
  const [trackedOpen, setTrackedOpen] = useState(open);
  if (open !== trackedOpen) {
    setTrackedOpen(open);
    if (open) setHighlighted(value);
  }

  function choose(code: CurrencyCode) {
    onChange(code);
    recordRecentCurrency(code);
    setOpen(false);
  }

  function moveHighlight(delta: 1 | -1) {
    const index = ordered.indexOf(highlighted);
    const next = ordered[(index + delta + ordered.length) % ordered.length];
    setHighlighted(next);
    itemRefs.current.get(next)?.scrollIntoView({ block: "nearest" });
  }

  function onListKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveHighlight(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveHighlight(-1);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(highlighted);
      return;
    }
    if (event.key.length === 1 && /[a-z0-9]/i.test(event.key)) {
      if (typeaheadTimer.current) clearTimeout(typeaheadTimer.current);
      typeaheadChars.current += event.key;
      typeaheadTimer.current = setTimeout(() => {
        typeaheadChars.current = "";
      }, 600);
      const needle = typeaheadChars.current.toLowerCase();
      const match = ordered.find(
        (code) =>
          code.toLowerCase().startsWith(needle) ||
          t(`names.${code}`).toLowerCase().startsWith(needle),
      );
      if (match) setHighlighted(match);
    }
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen} modal={isMobile ? "trap-focus" : false}>
      <Popover.Trigger
        className={cn(
          "data-[popup-open]:outline-focus-ring data-[popup-open]:outline-2 data-[popup-open]:outline-offset-2 data-[popup-open]:outline-solid",
          triggerClassName,
        )}
        aria-haspopup="listbox"
        aria-label={triggerLabel}
        onKeyDown={(event) => {
          if (event.altKey && event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {children}
      </Popover.Trigger>
      <Popover.Portal>
        {isMobile && <Popover.Backdrop className="fixed inset-0 z-50 min-h-dvh bg-[var(--scrim)]" />}
        <Popover.Positioner
          className="z-50 outline-none max-[599px]:!fixed max-[599px]:!inset-x-0 max-[599px]:!bottom-0 max-[599px]:!top-auto max-[599px]:!left-0 max-[599px]:!w-full max-[599px]:!transform-none"
          sideOffset={8}
          align="start"
        >
          <Popover.Popup
            className={cn(
              "rounded-modal border-card-edge bg-surface shadow-pop flex flex-col border",
              "min-[600px]:w-[280px] min-[600px]:rounded-card",
              "max-[599px]:w-full max-[599px]:rounded-b-none max-[599px]:rounded-t-[28px] max-[599px]:pb-[env(safe-area-inset-bottom)]",
            )}
          >
            <div
              aria-hidden
              className="bg-border mx-auto mt-2 h-[5px] w-9 rounded-full max-[599px]:block min-[600px]:hidden"
            />
            {title && (
              <div className="border-divider flex items-center justify-between gap-3 border-b px-4 py-3 min-[600px]:border-0 min-[600px]:pb-1">
                <Popover.Title className="text-callout text-ink-2 font-semibold">
                  {title}
                </Popover.Title>
                <Popover.Close
                  aria-label={t("pickerClose")}
                  className="bg-surface2 text-ink-2 hover:text-ink grid size-9 shrink-0 place-items-center rounded-full transition-colors duration-100 min-[600px]:hidden"
                >
                  <Icon name="cross-small" size={16} />
                </Popover.Close>
              </div>
            )}
            <div
              role="listbox"
              aria-label={title ?? t("pickerTitle")}
              tabIndex={0}
              onKeyDown={onListKeyDown}
              className="max-h-[70dvh] overflow-y-auto py-1 outline-none min-[600px]:max-h-80"
            >
              {ordered.map((code) => (
                <button
                  key={code}
                  ref={(el) => {
                    if (el) itemRefs.current.set(code, el);
                    else itemRefs.current.delete(code);
                  }}
                  type="button"
                  role="option"
                  aria-selected={code === value}
                  onClick={() => choose(code)}
                  onMouseEnter={() => setHighlighted(code)}
                  className={cn(
                    "flex min-h-[52px] w-full items-center gap-3 px-4 text-left transition-colors duration-100",
                    code === highlighted ? "bg-surface2" : "hover:bg-surface2",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="text-body text-ink block font-semibold">{code}</span>
                    <span className="text-callout text-ink-2 block truncate">
                      {t(`names.${code}`)}
                    </span>
                  </span>
                  {code === value && (
                    <Icon name="check" size={18} className="text-ember-text shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
