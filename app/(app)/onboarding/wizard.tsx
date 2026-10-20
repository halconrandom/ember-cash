"use client";

/**
 * Wizard de /onboarding (pasos 0 a 3). El paso 4 vive en el panel. El avance
 * lo guarda el servidor en profiles.onboarding_step; esta vista solo pinta
 * el paso que le pasan. Omitir no abre un modal.
 */
import { motion, useReducedMotionConfig } from "motion/react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useId, useRef, useState } from "react";

import { FormError } from "@/components/onboarding/form-error";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { CurrencyCode } from "@/lib/db/types";
import { CURRENCY_CODES } from "@/lib/db/types";
import type { Rate } from "@/lib/money/convert";
import {
  formatRateText,
  rateForDisplayCurrency,
  stepMotion,
  SUBSCRIPTION_CHIPS,
  subscriptionChipLabels,
  WIZARD_ACCOUNT_TYPES,
  WIZARD_TOTAL,
  type WizardAccountType,
  type WizardStep,
} from "@/lib/onboarding/logic";
import { cn } from "@/lib/utils";

import {
  goBack,
  saveCurrency,
  saveFirstAccount,
  saveFocus,
  skipOnboarding,
  startOnboarding,
  type StepResult,
} from "./wizard-actions";

const INITIAL: StepResult = { formError: null, fields: {} };

/** 16 px en todos los anchos: el teléfono ya lo fuerza; el wizard lo pide siempre. */
const INPUT_16 = { fontSize: 16 } as const;

function choiceClass(selected: boolean) {
  return cn(
    "flex min-h-11 cursor-pointer items-center rounded-control border px-4 text-[16px] font-semibold",
    selected ? "border-ink bg-surface2 text-ink" : "border-border bg-surface text-ink-2",
  );
}

/** Traduce una clave que devuelve la acción. Vacío si no hay error. */
function useMessage() {
  const t = useTranslations();
  return (key: string | null | undefined) => (key ? t(key) : null);
}

function SkipForm({ step, label }: { step: WizardStep; label: string }) {
  const [state, action, pending] = useActionState(skipOnboarding, INITIAL);
  const message = useMessage();
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="step" value={step} />
      <button
        type="submit"
        disabled={pending}
        className="text-body text-ink-2 min-h-11 font-semibold"
      >
        {label}
      </button>
      <FormError message={message(state.formError)} />
    </form>
  );
}

function BackForm() {
  const t = useTranslations("onboarding.common");
  const [, action, pending] = useActionState(goBack, INITIAL);
  return (
    <form action={action}>
      <Button type="submit" variant="secondary" disabled={pending}>
        {t("back")}
      </Button>
    </form>
  );
}

/** Tasa del día para la moneda elegida, o el texto de "no disponible". */
function RateLine({ currency, rates }: { currency: CurrencyCode; rates: readonly Rate[] }) {
  const t = useTranslations("onboarding.currency");
  const rate = rateForDisplayCurrency(currency, rates);
  if (!rate) return <p className="text-body text-ink-2">{t("rateUnavailable")}</p>;
  return (
    <p className="text-body text-ink-2">
      {t("rate", {
        from: rate.base,
        rate: formatRateText(rate.rate),
        to: rate.quote,
        source: rate.source,
      })}
    </p>
  );
}

function Welcome() {
  const t = useTranslations("onboarding");
  const [state, action, pending] = useActionState(startOnboarding, INITIAL);
  const message = useMessage();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-title1 text-ink outline-none" tabIndex={-1} data-step-title>
          {t("welcome.title")}
        </h1>
        <p className="text-body text-ink-2 mt-2">{t("welcome.body")}</p>
      </div>
      <form action={action} className="space-y-3">
        <Button type="submit" disabled={pending}>
          {t("welcome.primary")}
        </Button>
        <FormError message={message(state.formError)} />
      </form>
      <form method="post" action="/auth/signout">
        <Button type="submit" variant="secondary">
          {t("welcome.login")}
        </Button>
      </form>
      <SkipForm step={0} label={t("common.skipAll")} />
    </div>
  );
}

function CurrencyStep({ currency, rates }: { currency: CurrencyCode; rates: readonly Rate[] }) {
  const t = useTranslations("onboarding");
  const [selected, setSelected] = useState(currency);
  const [state, action, pending] = useActionState(saveCurrency, INITIAL);
  const message = useMessage();
  const formId = useId();
  const options = CURRENCY_CODES.map((code) => ({
    value: code,
    label: t(`currency.${code.toLowerCase()}`),
  }));
  return (
    <div className="space-y-6">
      <form id={formId} action={action} className="space-y-6">
        <div>
          <h1 className="text-title1 text-ink outline-none" tabIndex={-1} data-step-title>
            {t("currency.title")}
          </h1>
          <p className="text-body text-ink-2 mt-2">{t("currency.help")}</p>
        </div>
        <input type="hidden" name="currency" value={selected} />
        <SegmentedControl
          label={t("currency.title")}
          options={options}
          value={selected}
          onChange={setSelected}
        />
        <RateLine currency={selected} rates={rates} />
        <FormError message={message(state.formError)} />
      </form>
      <div className="flex flex-wrap items-center gap-3">
        <BackForm />
        <Button type="submit" form={formId} disabled={pending}>
          {t("common.next")}
        </Button>
      </div>
      <SkipForm step={1} label={t("common.skip")} />
    </div>
  );
}

function AccountStep({ currency }: { currency: CurrencyCode }) {
  const t = useTranslations("onboarding");
  const [type, setType] = useState<WizardAccountType>("savings");
  const [money, setMoney] = useState(currency);
  const [state, action, pending] = useActionState(saveFirstAccount, INITIAL);
  const message = useMessage();
  const typeLegend = useId();
  const formId = useId();
  return (
    <div className="space-y-6">
      <form id={formId} action={action} className="space-y-6">
        <div>
          <h1 className="text-title1 text-ink outline-none" tabIndex={-1} data-step-title>
            {t("account.title")}
          </h1>
          <p className="text-body text-ink-2 mt-2">{t("account.help")}</p>
        </div>
        <fieldset aria-labelledby={typeLegend} className="space-y-2">
          <legend id={typeLegend} className="text-callout text-ink-2 font-semibold">
            {t("account.typeLabel")}
          </legend>
          <div className="grid gap-2">
            {WIZARD_ACCOUNT_TYPES.map((item) => (
              <label key={item.key} className={choiceClass(type === item.key)}>
                <input
                  type="radio"
                  name="type"
                  value={item.key}
                  checked={type === item.key}
                  onChange={() => setType(item.key)}
                  className="sr-only"
                />
                {t(`account.types.${item.key}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <Field
          label={t("account.nameLabel")}
          name="name"
          placeholder={t("account.namePlaceholder")}
          error={message(state.fields.name)}
          style={INPUT_16}
          autoComplete="off"
        />
        <div className="space-y-2">
          <p className="text-callout text-ink-2 font-semibold">{t("account.currencyLabel")}</p>
          <input type="hidden" name="currency" value={money} />
          <SegmentedControl
            label={t("account.currencyLabel")}
            options={CURRENCY_CODES.map((code) => ({ value: code, label: code }))}
            value={money}
            onChange={setMoney}
          />
        </div>
        <Field
          label={t("account.balanceLabel")}
          name="balance"
          inputMode="decimal"
          placeholder={t("account.balancePlaceholder")}
          error={message(state.fields.balance)}
          style={INPUT_16}
        />
        {type === "credit" && (
          <>
            <Field
              label={t("account.limitLabel")}
              name="limit"
              inputMode="decimal"
              placeholder={t("account.limitPlaceholder")}
              error={message(state.fields.limit)}
              style={INPUT_16}
            />
            <Field
              label={t("account.payDayLabel")}
              name="payDay"
              inputMode="numeric"
              placeholder={t("account.payDayPlaceholder")}
              hint={t("account.payDayHelp")}
              error={message(state.fields.payDay)}
              style={INPUT_16}
            />
          </>
        )}
        <FormError message={message(state.formError)} />
      </form>
      <div className="flex flex-wrap items-center gap-3">
        <BackForm />
        <Button type="submit" form={formId} disabled={pending}>
          {t("common.next")}
        </Button>
      </div>
      <SkipForm step={2} label={t("common.skip")} />
    </div>
  );
}

function FocusStep() {
  const t = useTranslations("onboarding");
  const labels = subscriptionChipLabels(t("focus.sub.chips"));
  const [choice, setChoice] = useState("");
  const [chip, setChip] = useState("");
  const [name, setName] = useState("");
  const [state, action, pending] = useActionState(saveFocus, INITIAL);
  const message = useMessage();
  const legend = useId();
  const formId = useId();

  function pickChip(index: number) {
    const label = labels[index] ?? "";
    setChip(SUBSCRIPTION_CHIPS[index]?.key ?? "");
    setName(label);
  }

  return (
    <div className="space-y-6">
      <form id={formId} action={action} className="space-y-6">
        <div>
          <h1 className="text-title1 text-ink outline-none" tabIndex={-1} data-step-title>
            {t("focus.title")}
          </h1>
          <p className="text-body text-ink-2 mt-2">{t("focus.help")}</p>
        </div>
        <fieldset aria-labelledby={legend} className="space-y-2">
          <legend id={legend} className="sr-only">
            {t("focus.title")}
          </legend>
          {(
            [
              ["savings", "focus.savings", "focus.savingsHelp"],
              ["debt", "focus.debts", "focus.debtsHelp"],
              ["subscription", "focus.subscriptions", "focus.subscriptionsHelp"],
            ] as const
          ).map(([value, labelKey, helpKey]) => (
            <label
              key={value}
              className={cn(choiceClass(choice === value), "flex-col items-start py-3")}
            >
              <input
                type="radio"
                name="choice"
                value={value}
                checked={choice === value}
                onChange={() => {
                  setChoice(value);
                  setName("");
                  setChip("");
                }}
                className="sr-only"
              />
              <span>{t(labelKey)}</span>
              <span className="text-body text-ink-2 mt-1 font-normal">{t(helpKey)}</span>
            </label>
          ))}
        </fieldset>

        {choice === "savings" && (
          <div className="space-y-4">
            <Field
              label={t("focus.goal.nameLabel")}
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("focus.goal.namePlaceholder")}
              error={message(state.fields.name)}
              style={INPUT_16}
            />
            <Field
              label={t("focus.goal.targetLabel")}
              name="target"
              inputMode="decimal"
              error={message(state.fields.target)}
              style={INPUT_16}
            />
            <Field
              label={t("focus.goal.currentLabel")}
              name="current"
              inputMode="decimal"
              error={message(state.fields.current)}
              style={INPUT_16}
            />
            <Field
              label={t("focus.goal.dateLabel")}
              name="date"
              type="date"
              error={message(state.fields.date)}
              style={INPUT_16}
            />
          </div>
        )}

        {choice === "debt" && (
          <div className="space-y-4">
            <Field
              label={t("focus.debt.nameLabel")}
              name="name"
              placeholder={t("focus.debt.namePlaceholder")}
              error={message(state.fields.name)}
              style={INPUT_16}
            />
            <Field
              label={t("focus.debt.balanceLabel")}
              name="balance"
              inputMode="decimal"
              error={message(state.fields.balance)}
              style={INPUT_16}
            />
            <Field
              label={t("focus.debt.rateLabel")}
              name="rate"
              inputMode="decimal"
              error={message(state.fields.rate)}
              style={INPUT_16}
            />
            <Field
              label={t("focus.debt.paymentLabel")}
              name="payment"
              inputMode="decimal"
              error={message(state.fields.payment)}
              style={INPUT_16}
            />
            <Field
              label={t("focus.debt.dueDayLabel")}
              name="dueDay"
              inputMode="numeric"
              error={message(state.fields.dueDay)}
              style={INPUT_16}
            />
          </div>
        )}

        {choice === "subscription" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-callout text-ink-2 font-semibold">{t("focus.sub.chipsLabel")}</p>
              <div className="flex flex-wrap gap-2">
                {SUBSCRIPTION_CHIPS.map((item, index) => (
                  <button
                    key={item.key}
                    type="button"
                    aria-pressed={chip === item.key}
                    onClick={() => pickChip(index)}
                    className={choiceClass(chip === item.key)}
                  >
                    {labels[index]}
                  </button>
                ))}
              </div>
            </div>
            <input type="hidden" name="chip" value={chip} />
            <Field
              label={t("focus.sub.nameLabel")}
              name="name"
              value={name}
              placeholder={t("focus.sub.namePlaceholder")}
              onChange={(event) => {
                const value = event.target.value;
                setName(value);
                const index = labels.indexOf(value);
                setChip(index >= 0 ? (SUBSCRIPTION_CHIPS[index]?.key ?? "") : "");
              }}
              error={message(state.fields.name)}
              style={INPUT_16}
            />
            <Field
              label={t("focus.sub.amountLabel")}
              name="amount"
              inputMode="decimal"
              error={message(state.fields.amount)}
              style={INPUT_16}
            />
            <Field
              label={t("focus.sub.dayLabel")}
              name="day"
              inputMode="numeric"
              error={message(state.fields.day)}
              style={INPUT_16}
            />
          </div>
        )}

        <FormError message={message(state.formError)} />
      </form>
      <div className="flex flex-wrap items-center gap-3">
        <BackForm />
        <Button type="submit" form={formId} disabled={pending}>
          {t("focus.create")}
        </Button>
      </div>
      <SkipForm step={3} label={t("common.skip")} />
    </div>
  );
}

/**
 * Un paso a la vez. Al entrar, el foco va al título y la región en vivo
 * dice el número de paso (y que el avance quedó guardado, si no es la
 * bienvenida).
 */
export function Wizard({
  step,
  currency,
  rates,
}: {
  step: WizardStep;
  currency: CurrencyCode;
  rates: readonly Rate[];
}) {
  const t = useTranslations("onboarding.common");
  // "always" en tests y prefers-reduced-motion en la app: solo el fundido.
  const reduced = useReducedMotionConfig() === true;
  const motionProps = stepMotion(reduced);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    rootRef.current?.querySelector<HTMLElement>("[data-step-title]")?.focus();
  }, [step]);

  return (
    <motion.div
      ref={rootRef}
      data-testid="onboarding-step"
      initial={motionProps.initial}
      animate={motionProps.animate}
      transition={motionProps.transition}
      className="space-y-4"
    >
      <div aria-live="polite">
        {step > 0 && (
          <>
            <p className="text-callout text-ink-3">
              {t("progress", { step, total: WIZARD_TOTAL })}
            </p>
            <p className="sr-only">{t("saved")}</p>
          </>
        )}
      </div>
      {step === 0 && <Welcome />}
      {step === 1 && <CurrencyStep currency={currency} rates={rates} />}
      {step === 2 && <AccountStep currency={currency} />}
      {step === 3 && <FocusStep />}
    </motion.div>
  );
}
