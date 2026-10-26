"use client";

/**
 * Campo de monto + moneda en un control (fase E5, spec de Ivern): reemplaza
 * la píldora segmentada COP/USD/EUR + <Field> de al lado en los formularios
 * de deudas, metas, suscripciones, presupuestos y cuentas. Un solo campo de
 * 48 px: a la izquierda un botón con el código y un chevron (abre
 * <CurrencyPicker>), un divisor de 1 px y el input.
 *
 * Cambiar de moneda nunca convierte el número escrito: solo cambia la
 * unidad (DESIGN_SPEC §4.9). La línea de ayuda de abajo se recalcula en
 * cada tecla (sin debounce), pero el `aria-live` del grupo solo queda en
 * "polite" justo al perder el foco o al cambiar de moneda: mientras se
 * sigue escribiendo vuelve a "off", para no anunciar cada tecla.
 */
import { useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { useRate } from "@/components/money/rate-provider";
import type { CurrencyCode } from "@/lib/db/types";
import { useFormat } from "@/lib/i18n/use-format";
import { writeLastCurrency } from "@/lib/money/last-currency";
import { money } from "@/lib/money/money";
import { parseMoney } from "@/lib/money/parse";
import { resolveConversionLine, type ConversionLine } from "@/lib/transactions/conversion-line";
import { cn } from "@/lib/utils";

import { CurrencyPicker } from "./currency-picker";
import { Icon } from "./icon";

type Props = {
  label: string;
  value: string;
  onValueChange: (text: string) => void;
  currency: CurrencyCode;
  onCurrencyChange: (next: CurrencyCode) => void;
  /** Monedas que se listan en el selector; por defecto, todas. */
  options?: readonly CurrencyCode[];
  /** Si se da, cada cambio de moneda se recuerda para este formulario. */
  formKey?: string;
  error?: string | null;
  placeholder?: string;
  disabled?: boolean;
  /** Con disabled, deja igual editable el monto (solo se bloquea la moneda). */
  amountEditable?: boolean;
  autoFocus?: boolean;
  className?: string;
};

export function CurrencyAmountField({
  label,
  value,
  onValueChange,
  currency,
  onCurrencyChange,
  options,
  formKey,
  error,
  placeholder = "0",
  disabled,
  amountEditable,
  autoFocus,
  className,
}: Props) {
  const t = useTranslations("currencyField");
  const f = useFormat();
  const { rates, status, displayCurrency } = useRate();
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const labelId = `${id}-label`;
  // "off" mientras se escribe; "polite" justo al perder el foco o cambiar
  // de moneda, para que el lector lo anuncie una vez, no en cada tecla.
  const [live, setLive] = useState<"off" | "polite">("off");

  function lineFor(curr: CurrencyCode): ConversionLine | { kind: "unavailable" } {
    if (status === "error") return { kind: "unavailable" };
    const parsed = parseMoney(value, curr, f.locale, { allowZero: true, allowNegative: true });
    return resolveConversionLine({
      amountEmpty: value.trim() === "",
      amount: parsed.ok ? parsed.value : money(0n, curr),
      currency: curr,
      displayCurrency,
      rates,
    });
  }

  const line = lineFor(currency);
  const rateText = (rate: { base: string; rate: string; quote: string }) =>
    t("rate", { base: rate.base, value: f.number(Number(rate.rate), 2), quote: rate.quote });

  function changeCurrency(next: CurrencyCode) {
    onCurrencyChange(next);
    if (formKey) writeLastCurrency(formKey, next);
    setLive("polite");
  }

  return (
    <div className={cn("space-y-2", className)}>
      <label id={labelId} htmlFor={id} className="text-callout text-ink-2 block font-semibold">
        {label}
      </label>
      <div
        role="group"
        aria-labelledby={labelId}
        className={cn(
          "rounded-control bg-surface2 has-[input:focus-visible]:outline-focus-ring flex h-12 items-stretch border has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-solid",
          error ? "border-negative border-[1.5px]" : "border-transparent",
          disabled && !amountEditable && "opacity-60",
        )}
      >
        <CurrencyPicker
          value={currency}
          onChange={changeCurrency}
          options={options}
          title={t("pickerTitle")}
          triggerLabel={t("triggerLabel", { currency })}
          triggerClassName="text-body text-ink flex w-[72px] shrink-0 items-center justify-center gap-1 font-semibold disabled:pointer-events-none"
        >
          {currency}
          <Icon name="angle-small-down" size={16} className="text-ink-2" />
        </CurrencyPicker>
        <span aria-hidden className="bg-border my-2 w-px shrink-0" />
        <input
          ref={inputRef}
          id={id}
          inputMode={currency === "COP" ? "numeric" : "decimal"}
          autoComplete="off"
          placeholder={placeholder}
          autoFocus={autoFocus}
          value={value}
          disabled={disabled && !amountEditable}
          onChange={(e) => {
            onValueChange(e.target.value);
            setLive("off");
          }}
          onBlur={() => setLive("polite")}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="text-headline text-ink placeholder:text-ink-3 min-w-0 flex-1 bg-transparent px-4 tabular-nums outline-none"
        />
      </div>
      <div aria-live={live} className="text-callout text-ink-2 min-h-[1.1rem] tabular-nums">
        {line.kind === "same" || line.kind === undefined ? null : line.kind === "unavailable" ? (
          t("noRate", { currency })
        ) : line.kind === "rateOnly" ? (
          rateText(line.rate)
        ) : (
          <>
            <span aria-hidden="true">≈</span>
            <span className="sr-only">{t("approximately")}</span>
            {` ${f.money(line.value)} · ${rateText(line.rate)}`}
          </>
        )}
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-callout text-negative-text">
          {error}
        </p>
      )}
    </div>
  );
}
