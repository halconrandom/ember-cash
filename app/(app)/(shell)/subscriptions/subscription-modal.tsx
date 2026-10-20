"use client";

/**
 * Modal para crear o editar un recurrente (suscripción, factura o día de
 * cobro). En Suscripciones el tipo queda fijo en suscripción. En el
 * calendario se puede elegir. "Una vez" guarda un mensual que termina el
 * mismo día, así el motor solo genera esa ocurrencia. Nada se registra
 * solo: cada vencimiento queda Por pagar hasta "Marcar como pagado", que es
 * donde se elige la cuenta y la fecha real.
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { useRate } from "@/components/money/rate-provider";
import { Button } from "@/components/ui/button";
import { CurrencyAmountField } from "@/components/ui/currency-amount-field";
import { DateField } from "@/components/ui/date-field";
import { Field } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
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
  const [anchorDate, setAnchorDate] = useState(editing?.anchorDate ?? today);
  const [endsOn, setEndsOn] = useState(
    editing?.endsOn && editing.endsOn !== editing.anchorDate ? editing.endsOn : "",
  );
  const [errors, setErrors] = useState<Partial<Record<RecurringField, RecurringErrorKey>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const clear = (field: RecurringField) =>
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  const close = () =>
    router.replace(`${pathname}${withFilters(params, { [param]: null })}`, { scroll: false });
  const err = (field: RecurringField) =>
    errors[field] ? t(`subscriptions.errors.${errors[field]}`) : null;

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
    const input = {
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
    const check = validateRecurring(input, locale);
    if (!check.ok) {
      setErrors(check.errors);
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

  const footer = (
    <>
      {editing && (
        <Button
          variant="danger-outline"
          size="lg"
          onClick={() => setStatus("cancelled")}
          disabled={pending || saved}
        >
          {tm("cancelItem")}
        </Button>
      )}
      <div className="ml-auto flex gap-3">
        <Button variant="secondary" size="lg" onClick={close}>
          {tm("cancel")}
        </Button>
        <Button size="lg" icon="check" onClick={submit} disabled={pending || saved}>
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
    >
      <form
        className="space-y-6 pb-4"
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

        <Field
          label={tm("name")}
          value={name}
          maxLength={80}
          onChange={(event) => {
            setName(event.target.value);
            clear("name");
          }}
          error={err("name")}
        />
        <Field
          label={tm("subtitle")}
          value={subtitle}
          maxLength={120}
          onChange={(event) => {
            setSubtitle(event.target.value);
            clear("subtitle");
          }}
          error={err("subtitle")}
        />

        <fieldset className="space-y-2">
          <legend className="text-callout text-ink-2 font-semibold">{tm("icon")}</legend>
          <div className="flex flex-wrap gap-2">
            {RECURRING_ICONS.map((icon) => (
              <button
                key={icon}
                type="button"
                aria-pressed={iconKey === icon}
                aria-label={icon}
                onClick={() => {
                  setIconKey(icon);
                  clear("iconKey");
                }}
                className={cn(
                  "grid size-11 place-items-center rounded-full border",
                  iconKey === icon
                    ? "border-violet bg-violet-tint text-violet"
                    : "bg-surface2 text-ink-2 border-transparent",
                )}
              >
                <Icon name={icon} size={18} />
              </button>
            ))}
          </div>
          {err("iconKey") && <p className="text-callout text-negative-text">{err("iconKey")}</p>}
        </fieldset>

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

        <fieldset className="space-y-2">
          <legend className="text-callout text-ink-2 font-semibold">{tm("category")}</legend>
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
          {err("categoryKey") && (
            <p className="text-callout text-negative-text">{err("categoryKey")}</p>
          )}
        </fieldset>

        <SegmentedControl
          className="flex w-full [&>button]:flex-1"
          label={tm("frequency")}
          options={FORM_FREQUENCIES.map((value) => ({ value, label: tm(`freq.${value}`) }))}
          value={frequency}
          onChange={setFrequency}
        />

        {frequency !== "once" && (
          <Field
            label={tm("interval")}
            inputMode="numeric"
            value={interval}
            onChange={(event) => {
              setInterval(event.target.value);
              clear("interval");
            }}
            error={err("interval")}
          />
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <DateField
            label={tm("starts")}
            value={anchorDate}
            onChange={(value) => {
              setAnchorDate(value);
              clear("anchorDate");
            }}
            error={err("anchorDate")}
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

        <p className="text-callout text-ink-2">{tm("confirmHint")}</p>

        {editing && (
          <Button
            variant="secondary"
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
