"use client";

/**
 * Modal para crear o editar una meta: nombre, ícono, objetivo y moneda,
 * fecha objetivo (opcional) y aporte mensual (opcional). Al editar se puede
 * archivar, con toast de 6 s y Deshacer. La moneda no cambia si la meta ya
 * tiene aportes (se guardan en su moneda).
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { useRate } from "@/components/money/rate-provider";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { Field } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useToast } from "@/components/ui/toast";
import type { CurrencyCode } from "@/lib/db/types";
import type { GoalSummary } from "@/lib/goals/queries";
import {
  GOAL_ICONS,
  validateGoal,
  type GoalErrorKey,
  type GoalField,
  type GoalIcon,
} from "@/lib/goals/schema";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config";
import { useFormat } from "@/lib/i18n/use-format";
import { withFilters } from "@/lib/transactions/filters";
import { cn } from "@/lib/utils";

import { saveGoal, setGoalArchived } from "./actions";

type Props = { open: boolean; editing: GoalSummary | null; today: string };

export function GoalModal({ open, editing, today }: Props) {
  const t = useTranslations("savings");
  const localeRaw = useLocale();
  const locale = isLocale(localeRaw) ? localeRaw : DEFAULT_LOCALE;
  const f = useFormat();
  const toast = useToast();
  const { displayCurrency } = useRate();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState(editing?.name ?? "");
  const [iconKey, setIconKey] = useState<GoalIcon>(editing?.iconKey ?? "piggy-bank");
  const [currency, setCurrency] = useState<CurrencyCode>(
    editing?.target.currency ?? displayCurrency,
  );
  const [target, setTarget] = useState(editing ? f.amount(editing.target) : "");
  const [targetDate, setTargetDate] = useState(editing?.targetDate ?? "");
  const [monthly, setMonthly] = useState(editing?.monthly ? f.amount(editing.monthly) : "");
  const [errors, setErrors] = useState<Partial<Record<GoalField, GoalErrorKey>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Con aportes, la moneda queda fija.
  const currencyLocked = Boolean(editing && editing.saved.amountMinor > 0n);
  const close = () =>
    router.replace(`${pathname}${withFilters(params, { goal: null })}`, { scroll: false });
  const err = (k: GoalField) => (errors[k] ? t(`errors.${errors[k]}`) : null);
  const clear = (k: GoalField) => setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));

  function submit() {
    const input = { id: editing?.id ?? null, name, iconKey, target, currency, targetDate, monthly };
    const check = validateGoal(input, locale, today);
    if (!check.ok) {
      setErrors(check.errors);
      return;
    }
    setErrors({});
    startTransition(async () => {
      const result = await saveGoal(input);
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        if (result.error) setFormError(t("errors.failed"));
        return;
      }
      setSaved(true);
      setTimeout(close, 450);
    });
  }

  function archive() {
    if (!editing) return;
    const id = editing.id;
    startTransition(async () => {
      const result = await setGoalArchived(id, true);
      if (!result.ok) {
        toast.show({ message: t("archiveFailed") });
        return;
      }
      close();
      toast.show({
        message: t("archived"),
        onUndo: async () => {
          await setGoalArchived(id, false);
          router.refresh();
          toast.show({ message: t("restored") });
        },
      });
    });
  }

  const footer = (
    <>
      {editing && (
        <Button
          variant="secondary"
          size="lg"
          icon="layers"
          onClick={archive}
          disabled={pending || saved}
        >
          {t("modal.archive")}
        </Button>
      )}
      <div className="ml-auto flex gap-3">
        <Button variant="secondary" size="lg" onClick={close}>
          {t("modal.cancel")}
        </Button>
        <Button size="lg" icon="check" onClick={submit} disabled={pending || saved}>
          {saved ? t("modal.saved") : pending ? t("modal.saving") : t("modal.save")}
        </Button>
      </div>
    </>
  );

  return (
    <Modal
      open={open}
      onClose={close}
      title={editing ? t("modal.editTitle") : t("modal.newTitle")}
      closeLabel={t("modal.close")}
      footer={footer}
    >
      <form
        className="space-y-6 pb-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field
          label={t("modal.name")}
          placeholder={t("modal.namePlaceholder")}
          value={name}
          maxLength={80}
          onChange={(e) => {
            setName(e.target.value);
            clear("name");
          }}
          error={err("name")}
        />

        <fieldset>
          <legend className="text-callout text-ink-2 mb-2 font-semibold">{t("modal.icon")}</legend>
          <div className="flex flex-wrap gap-2">
            {GOAL_ICONS.map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={iconKey === key}
                aria-label={t(`icons.${key}`)}
                title={t(`icons.${key}`)}
                onClick={() => {
                  setIconKey(key);
                  clear("iconKey");
                }}
                className={cn(
                  "rounded-control grid size-11 place-items-center border-[1.5px] transition-colors duration-100",
                  iconKey === key
                    ? "border-ember-text bg-ember-50 text-ember-text"
                    : "bg-surface2 text-ink-2 hover:text-ink border-transparent",
                )}
              >
                <Icon name={key} />
              </button>
            ))}
          </div>
          {errors.iconKey && (
            <p role="alert" className="text-callout text-negative-text mt-2">
              {err("iconKey")}
            </p>
          )}
        </fieldset>

        <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <Field
            label={t("modal.target")}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={target}
            onChange={(e) => {
              setTarget(e.target.value);
              clear("target");
            }}
            error={err("target")}
          />
          <div className="space-y-2">
            <span className="text-callout text-ink-2 block font-semibold">
              {t("modal.currency")}
            </span>
            <div
              className={cn(currencyLocked && "pointer-events-none opacity-60")}
              aria-disabled={currencyLocked || undefined}
            >
              <SegmentedControl
                label={t("modal.currency")}
                options={[
                  { value: "COP", label: "COP" },
                  { value: "USD", label: "USD" },
                ]}
                value={currency}
                onChange={setCurrency}
              />
            </div>
          </div>
        </div>
        {currencyLocked && (
          <p className="text-footnote text-ink-3 -mt-3">{t("modal.currencyLocked")}</p>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <DateField
              label={t("modal.targetDate")}
              value={targetDate}
              min={editing ? undefined : today}
              placeholder={t("modal.targetDatePlaceholder")}
              onChange={(v) => {
                setTargetDate(v);
                clear("targetDate");
              }}
              error={err("targetDate")}
            />
            {targetDate && (
              <button
                type="button"
                className="text-callout text-ember-text font-medium underline-offset-4 hover:underline"
                onClick={() => setTargetDate("")}
              >
                {t("modal.clearDate")}
              </button>
            )}
          </div>
          <Field
            label={t("modal.monthly")}
            inputMode="decimal"
            autoComplete="off"
            placeholder={t("modal.monthlyPlaceholder")}
            value={monthly}
            onChange={(e) => {
              setMonthly(e.target.value);
              clear("monthly");
            }}
            error={err("monthly")}
          />
        </div>

        {formError && (
          <p role="alert" className="text-callout text-negative-text">
            {formError}
          </p>
        )}
      </form>
    </Modal>
  );
}
