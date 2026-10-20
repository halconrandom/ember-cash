"use client";

/**
 * Modal para crear o editar un recurrente (suscripción, factura o día de
 * cobro). En Suscripciones el tipo queda fijo en suscripción. En el
 * calendario se puede elegir. "Una vez" guarda un mensual que termina el
 * mismo día, así el motor solo genera esa ocurrencia. Nada se registra
 * solo: cada vencimiento queda Por pagar hasta "Marcar como pagado", que es
 * donde se elige la cuenta y la fecha real.
 *
 * Fase E6 (spec de Ivern, docs/mockups/monedas/05_modal_suscripcion_*):
 * mismos campos y misma validación de siempre (sin agregar ninguno),
 * reorganizados en un modal más compacto (480 px). El selector de ícono y
 * el de categoría salen del cuerpo del modal y viven en un popover/sheet
 * (<PopoverSheet>, igual patrón que <CurrencyPicker>: popover en
 * escritorio, bottom sheet en móvil). Frecuencia es un segmented de
 * Mensual/Anual/Semanal más "Otra…", que despliega "Cada [n] [período]"
 * reusando frequency/interval de siempre (frequency="once" también entra
 * por "Otra…", ya existía como opción). "Más opciones" es un disclosure
 * cerrado por defecto (chevron abajo cerrado, arriba abierto,
 * aria-expanded) con el detalle y la fecha de fin.
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";

import { useRate } from "@/components/money/rate-provider";
import { Button } from "@/components/ui/button";
import { CurrencyAmountField } from "@/components/ui/currency-amount-field";
import { DateField } from "@/components/ui/date-field";
import { Field, Input } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import type { IconName } from "@/components/ui/icon-registry";
import { Modal } from "@/components/ui/modal";
import { PopoverSheet } from "@/components/ui/popover-sheet";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { CATEGORY_META, categoriesFor } from "@/lib/categories";
import type { CategoryKey } from "@/lib/db/types";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config";
import { useFormat } from "@/lib/i18n/use-format";
import { readLastCurrency } from "@/lib/money/last-currency";
import type { SubscriptionItem } from "@/lib/recurring/queries";
import {
  FORM_FREQUENCIES,
  FORM_KINDS,
  RECURRING_ICONS,
  validateRecurring,
  type FormFrequency,
  type FormKind,
  type RecurringErrorKey,
  type RecurringField,
} from "@/lib/recurring/schema";
import { withFilters } from "@/lib/transactions/filters";
import { cn } from "@/lib/utils";

import { saveRecurringItem, setRecurringStatus } from "./actions";

type Props = {
  open: boolean;
  editing: SubscriptionItem | null;
  /** En Suscripciones no se cambia el tipo. */
  lockedKind?: "subscription";
  initialKind?: FormKind;
  today: string;
  /** Qué parámetro de la URL cierra el modal. */
  param: "sub" | "event";
};

/** Las 3 frecuencias "simples" del segmented; el resto vive en "Otra…". */
const PRIMARY_FREQUENCIES = ["monthly", "yearly", "weekly"] as const;
type PrimaryFrequency = (typeof PRIMARY_FREQUENCIES)[number];
function isPrimary(f: FormFrequency): f is PrimaryFrequency {
  return (PRIMARY_FREQUENCIES as readonly string[]).includes(f);
}

export function SubscriptionModal({
  open,
  editing,
  lockedKind,
  initialKind = "bill",
  today,
  param,
}: Props) {
  const t = useTranslations();
  const tm = useTranslations("subscriptions.modal");
  const localeRaw = useLocale();
  const locale = isLocale(localeRaw) ? localeRaw : DEFAULT_LOCALE;
  const f = useFormat();
  const { displayCurrency } = useRate();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [kind, setKind] = useState<FormKind>(lockedKind ?? initialKind);
  const [name, setName] = useState(editing?.name ?? "");
  const [subtitle, setSubtitle] = useState(editing?.subtitle ?? "");
  const [iconKey, setIconKey] = useState(editing?.iconKey ?? "refresh");
  const [currency, setCurrency] = useState(
    editing?.amount.currency ?? readLastCurrency("subscriptions") ?? displayCurrency,
  );
  const [amount, setAmount] = useState(editing ? f.amount(editing.amount) : "");
  const [categoryKey, setCategoryKey] = useState(editing?.categoryKey ?? "");
  const [frequency, setFrequency] = useState<FormFrequency>(
    editing ? (editing.endsOn === editing.anchorDate ? "once" : editing.frequency) : "monthly",
  );
  const [interval, setInterval] = useState(String(editing?.interval ?? 1));
  const [otherMode, setOtherMode] = useState(
    () => !isPrimary(frequency) || interval !== "1",
  );
  const [anchorDate, setAnchorDate] = useState(editing?.anchorDate ?? today);
  const [endsOn, setEndsOn] = useState(
    editing?.endsOn && editing.endsOn !== editing.anchorDate ? editing.endsOn : "",
  );
  const [moreOpen, setMoreOpen] = useState(Boolean(endsOn));
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<RecurringField, RecurringErrorKey>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);
  const fieldRefs: Partial<Record<RecurringField, React.RefObject<HTMLElement | null>>> = {
    name: nameRef,
  };

  const clear = (field: RecurringField) =>
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  const close = () =>
    router.replace(`${pathname}${withFilters(params, { [param]: null })}`, { scroll: false });
  const err = (field: RecurringField) =>
    errors[field] ? t(`subscriptions.errors.${errors[field]}`) : null;

  function currentInput() {
    return {
      id: editing?.id ?? null,
      kind: lockedKind ?? kind,
      name,
      subtitle,
      iconKey,
      amount,
      currency,
      categoryKey,
      frequency,
      interval: frequency === "once" ? "1" : interval,
      anchorDate,
      endsOn,
    };
  }

  /** Valida todo pero solo refleja el error de `field` (fase E6 §6: al salir del campo). */
  function validateOnBlur(field: RecurringField) {
    const check = validateRecurring(currentInput(), locale);
    setErrors((current) => ({ ...current, [field]: check.ok ? undefined : check.errors[field] }));
  }

  function changeKind(next: FormKind) {
    setKind(next);
    if (
      categoryKey &&
      !(categoriesFor(next === "income" ? "income" : "expense") as readonly string[]).includes(
        categoryKey,
      )
    ) {
      setCategoryKey("");
    }
    setErrors({});
  }

  function submit() {
    const input = currentInput();
    const check = validateRecurring(input, locale);
    if (!check.ok) {
      setErrors(check.errors);
      // Foco al primer error (fase E6 §6), en el orden en que aparecen en el formulario.
      const order: RecurringField[] = [
        "name",
        "amount",
        "categoryKey",
        "interval",
        "anchorDate",
        "endsOn",
        "iconKey",
        "subtitle",
      ];
      const firstField = order.find((field) => check.errors[field]);
      if (firstField) {
        if (firstField === "endsOn" || firstField === "iconKey") setMoreOpen(true);
        fieldRefs[firstField]?.current?.focus();
      }
      return;
    }
    setErrors({});
    setFormError(null);
    startTransition(async () => {
      const result = await saveRecurringItem(input);
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        setFormError(result.error === "rateLimited" ? t("rateLimit.write") : tm("errorFailed"));
        return;
      }
      setSaved(true);
      setTimeout(close, 450);
    });
  }

  function setStatus(status: "paused" | "active" | "cancelled") {
    if (!editing) return;
    startTransition(async () => {
      const result = await setRecurringStatus(editing.id, status);
      if (!result.ok) {
        setFormError(result.error === "rateLimited" ? t("rateLimit.write") : tm("errorFailed"));
        return;
      }
      close();
    });
  }

  const categoryKind = (lockedKind ?? kind) === "income" ? "income" : "expense";
  const categoryMeta = categoryKey ? CATEGORY_META[categoryKey as CategoryKey] : null;

  const footer = (
    <>
      <button type="button" onClick={close} className="text-body text-ink-2 font-semibold">
        {tm("cancel")}
      </button>
      <div className="ml-auto flex gap-3">
        {editing && (
          <Button
            variant="danger-outline"
            className="h-12"
            onClick={() => setStatus("cancelled")}
            disabled={pending || saved}
          >
            {tm("cancelItem")}
          </Button>
        )}
        <Button icon="check" className="h-12" onClick={submit} disabled={pending || saved}>
          {saved ? tm("saved") : pending ? tm("saving") : tm("save")}
        </Button>
      </div>
    </>
  );

  return (
    <Modal
      open={open}
      onClose={close}
      title={editing ? tm("editTitle") : tm("addTitle")}
      closeLabel={tm("close")}
      footer={footer}
      className="w-[480px] rounded-card"
    >
      <form
        className="space-y-5 pb-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {!lockedKind && (
          <SegmentedControl
            className="flex w-full [&>button]:flex-1"
            label={tm("kindLabel")}
            options={FORM_KINDS.map((value) => ({ value, label: tm(`kind.${value}`) }))}
            value={kind}
            onChange={changeKind}
          />
        )}

        {/* Nombre, con el botón de ícono a la izquierda en la misma fila. */}
        <div className="space-y-2">
          <label htmlFor="sub-name" className="text-callout text-ink-2 block font-semibold">
            {tm("name")}
          </label>
          <div className="flex items-start gap-3">
            <PopoverSheet
              open={iconPickerOpen}
              onOpenChange={setIconPickerOpen}
              title={tm("iconPickerTitle")}
              closeLabel={tm("close")}
              width={320}
              triggerLabel={tm("iconLabel", { icon: tm(`iconNames.${iconKey}`) })}
              triggerClassName="border-border bg-surface2 text-ember-text hover:bg-surface grid size-12 shrink-0 place-items-center rounded-control border transition-colors duration-100"
              trigger={<Icon name={iconKey as IconName} size={20} />}
            >
              <div className="grid grid-cols-5 gap-2 min-[600px]:grid-cols-6">
                {RECURRING_ICONS.map((icon) => {
                  const selected = iconKey === icon;
                  return (
                    <button
                      key={icon}
                      type="button"
                      aria-pressed={selected}
                      aria-label={tm(`iconNames.${icon}`)}
                      onClick={() => {
                        setIconKey(icon);
                        clear("iconKey");
                        setIconPickerOpen(false);
                      }}
                      className={cn(
                        "relative grid size-12 place-items-center rounded-control border-2 transition-colors duration-100",
                        selected
                          ? "border-focus-ring bg-ember-50 text-ember-text"
                          : "border-transparent bg-surface2 text-ink-2 hover:bg-surface",
                      )}
                    >
                      <Icon name={icon} size={20} />
                      {selected && (
                        <span className="bg-ember-fill absolute -top-1 -right-1 grid size-4 place-items-center rounded-full text-white">
                          <Icon name="check" size={10} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </PopoverSheet>
            <Input
              ref={nameRef}
              id="sub-name"
              value={name}
              maxLength={80}
              onChange={(event) => {
                setName(event.target.value);
                clear("name");
              }}
              onBlur={() => validateOnBlur("name")}
              className="h-12"
              invalid={Boolean(err("name"))}
              aria-describedby={err("name") ? "sub-name-error" : undefined}
            />
          </div>
          {err("iconKey") && <p className="text-callout text-negative-text">{err("iconKey")}</p>}
          {err("name") && (
            <p id="sub-name-error" role="alert" className="text-callout text-negative-text">
              {err("name")}
            </p>
          )}
        </div>

        <CurrencyAmountField
          label={tm("amount")}
          value={amount}
          onValueChange={(v) => {
            setAmount(v);
            clear("amount");
          }}
          currency={currency}
          onCurrencyChange={setCurrency}
          formKey="subscriptions"
          error={err("amount")}
        />

        {/* Frecuencia: Mensual/Anual/Semanal, u "Otra…" con "Cada [n] [período]". */}
        <div className="space-y-2">
          <span className="text-callout text-ink-2 block font-semibold">{tm("frequency")}</span>
          <SegmentedControl<PrimaryFrequency | "other">
            className="flex w-full [&>button]:flex-1 [&>button]:h-10"
            label={tm("frequency")}
            options={[
              ...PRIMARY_FREQUENCIES.map((value) => ({ value, label: tm(`freq.${value}`) })),
              { value: "other" as const, label: tm("other") },
            ]}
            value={otherMode ? "other" : (frequency as PrimaryFrequency)}
            onChange={(value) => {
              if (value === "other") {
                setOtherMode(true);
                return;
              }
              setFrequency(value);
              setInterval("1");
              setOtherMode(false);
              clear("interval");
            }}
          />
          {otherMode && (
            <div className="flex items-start gap-3 pt-1">
              <span className="text-body text-ink-2 flex h-12 shrink-0 items-center font-medium">
                {tm("every")}
              </span>
              {frequency !== "once" && (
                <div className="w-20 shrink-0">
                  <Input
                    aria-label={tm("interval")}
                    inputMode="numeric"
                    value={interval}
                    onChange={(event) => {
                      setInterval(event.target.value);
                      clear("interval");
                    }}
                    onBlur={() => validateOnBlur("interval")}
                    invalid={Boolean(err("interval"))}
                    className="h-12"
                  />
                  {err("interval") && (
                    <p role="alert" className="text-callout text-negative-text mt-2">
                      {err("interval")}
                    </p>
                  )}
                </div>
              )}
              <SegmentedControl<FormFrequency>
                label={tm("frequency")}
                options={FORM_FREQUENCIES.map((value) => ({ value, label: tm(`freq.${value}`) }))}
                value={frequency}
                onChange={setFrequency}
              />
            </div>
          )}
        </div>

        {/* Próximo cobro. */}
        <DateField
          label={tm("nextCharge")}
          value={anchorDate}
          onChange={(value) => {
            setAnchorDate(value);
            clear("anchorDate");
          }}
          error={err("anchorDate")}
        />
        <p className="text-footnote text-ink-3 -mt-3">{tm("nextChargeHint")}</p>

        {/* Categoría: botón de 48 px que abre el popover/sheet con la cuadrícula. */}
        <div className="space-y-2">
          <span className="text-callout text-ink-2 block font-semibold">{tm("category")}</span>
          <PopoverSheet
            open={categoryPickerOpen}
            onOpenChange={setCategoryPickerOpen}
            title={tm("categoryPickerTitle")}
            closeLabel={tm("close")}
            width={320}
            triggerLabel={tm("category")}
            triggerClassName={cn(
              "rounded-control bg-surface2 text-body text-ink flex h-12 w-full items-center gap-3 border px-4",
              err("categoryKey") ? "border-negative border-[1.5px]" : "border-transparent",
            )}
            trigger={
              categoryMeta ? (
                <>
                  <Icon name={categoryMeta.icon} size={18} className="text-ink-2 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-left">
                    {t(`categories.${categoryKey}`)}
                  </span>
                </>
              ) : (
                <span className="text-ink-3 min-w-0 flex-1 text-left">{tm("category")}</span>
              )
            }
          >
            <div className="flex flex-wrap gap-2">
              {categoriesFor(categoryKind).map((key) => {
                const selected = categoryKey === key;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setCategoryKey(key);
                      clear("categoryKey");
                      setCategoryPickerOpen(false);
                    }}
                    className={cn(
                      "text-body inline-flex h-10 items-center gap-2 rounded-full border px-3",
                      selected
                        ? "border-violet bg-violet-tint text-ink font-semibold"
                        : "bg-surface2 text-ink border-transparent",
                    )}
                  >
                    <Icon name={CATEGORY_META[key as CategoryKey].icon} size={16} />
                    {t(`categories.${key}`)}
                  </button>
                );
              })}
            </div>
          </PopoverSheet>
          {err("categoryKey") && (
            <p className="text-callout text-negative-text">{err("categoryKey")}</p>
          )}
        </div>

        {/* Más opciones: disclosure cerrado por defecto (detalle, fecha de fin). */}
        <div className="border-divider border-t pt-1">
          <button
            type="button"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((v) => !v)}
            className="text-body text-ink flex min-h-11 w-full items-center justify-between gap-2 py-2 font-semibold"
          >
            {tm("moreOptions")}
            <Icon
              name="angle-small-down"
              size={18}
              className={cn(
                "text-ink-2 motion-safe:transition-transform motion-safe:duration-150",
                moreOpen && "rotate-180",
              )}
            />
          </button>
          {moreOpen && (
            <div className="space-y-5 pt-2">
              <Field
                label={tm("subtitle")}
                value={subtitle}
                maxLength={120}
                onChange={(event) => {
                  setSubtitle(event.target.value);
                  clear("subtitle");
                }}
                onBlur={() => validateOnBlur("subtitle")}
                error={err("subtitle")}
                className="[&_input]:h-12"
              />
              {frequency !== "once" && (
                <DateField
                  label={tm("ends")}
                  value={endsOn}
                  onChange={(value) => {
                    setEndsOn(value);
                    clear("endsOn");
                  }}
                  error={err("endsOn")}
                  placeholder={tm("endsNever")}
                />
              )}
            </div>
          )}
        </div>

        <p className="text-callout text-ink-2">{tm("confirmHint")}</p>

        {editing && (
          <Button
            variant="secondary"
            className="h-12"
            onClick={() => setStatus(editing.status === "paused" ? "active" : "paused")}
            disabled={pending}
          >
            {editing.status === "paused" ? tm("resume") : tm("pause")}
          </Button>
        )}

        {formError && (
          <p role="alert" className="text-callout text-negative-text">
            {formError}
          </p>
        )}
      </form>
    </Modal>
  );
}
