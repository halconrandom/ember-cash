"use client";

/**
 * Modal para crear o editar una deuda: nombre, detalle, ícono, moneda,
 * principal original, tasa anual y su tipo (EA o nominal), pago mínimo y día
 * de pago. Al editar se puede borrar: es irreversible, así que usa "mantener
 * 2 s" (puntero o Enter/Espacio) o, como alternativa, la confirmación en dos
 * pasos; después hay 6 s para deshacer (deleted_at) antes del borrado final.
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { useRate } from "@/components/money/rate-provider";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { HoldToDeleteButton, TwoStepDeleteButton } from "@/components/ui/hold-to-delete";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useToast } from "@/components/ui/toast";
import type { CurrencyCode } from "@/lib/db/types";
import type { AprKind } from "@/lib/debts/payoff";
import type { DebtSummary } from "@/lib/debts/queries";
import {
  DEBT_ICONS,
  validateDebt,
  type DebtErrorKey,
  type DebtField,
  type DebtIcon,
} from "@/lib/debts/schema";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config";
import { useFormat } from "@/lib/i18n/use-format";
import { withFilters } from "@/lib/transactions/filters";
import { cn } from "@/lib/utils";

import { deleteDebt, purgeDebt, restoreDebt, saveDebt } from "./actions";

export function DebtModal({ open, editing }: { open: boolean; editing: DebtSummary | null }) {
  const t = useTranslations("debts");
  const rate = useTranslations("rateLimit");
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
  const [subtitle, setSubtitle] = useState(editing?.subtitle ?? "");
  const [iconKey, setIconKey] = useState<DebtIcon>(editing?.iconKey ?? "credit-card");
  // Las deudas siguen binarias (COP/USD): EUR aún no tiene su propio selector aquí.
  const [currency, setCurrency] = useState<CurrencyCode>(
    editing?.original.currency ?? (displayCurrency === "EUR" ? "USD" : displayCurrency),
  );
  const [principal, setPrincipal] = useState(editing ? f.amount(editing.original) : "");
  const [apr, setApr] = useState(
    editing ? f.number(editing.aprBps / 100, editing.aprBps % 100 === 0 ? 0 : 2) : "",
  );
  const [aprKind, setAprKind] = useState<AprKind>(editing?.aprKind ?? "EA");
  const [minPayment, setMinPayment] = useState(editing ? f.amount(editing.minPayment) : "");
  const [dueDay, setDueDay] = useState(editing?.dueDay ? String(editing.dueDay) : "");
  const [errors, setErrors] = useState<Partial<Record<DebtField, DebtErrorKey>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [twoStep, setTwoStep] = useState(false);

  // Con pagos registrados, la moneda queda fija.
  const currencyLocked = Boolean(editing && editing.paid.amountMinor > 0n);
  const close = () =>
    router.replace(`${pathname}${withFilters(params, { debt: null })}`, { scroll: false });
  const err = (k: DebtField) => (errors[k] ? t(`errors.${errors[k]}`) : null);
  const clear = (k: DebtField) => setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));

  function submit() {
    const input = {
      id: editing?.id ?? null,
      name,
      subtitle,
      iconKey,
      currency,
      principal,
      apr,
      aprKind,
      minPayment,
      dueDay,
    };
    const check = validateDebt(input, locale);
    if (!check.ok) {
      setErrors(check.errors);
      return;
    }
    setErrors({});
    startTransition(async () => {
      const result = await saveDebt(input);
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        if (result.error) {
          setFormError(result.error === "rateLimited" ? rate("write") : t("errors.failed"));
        }
        return;
      }
      setSaved(true);
      setTimeout(close, 450);
    });
  }

  async function remove() {
    if (!editing) return;
    const id = editing.id;
    const result = await deleteDebt(id);
    if (!result.ok) {
      toast.show({ message: t("deleteFailed") });
      return;
    }
    close();
    toast.show({
      message: t("deleted"),
      onUndo: async () => {
        await restoreDebt(id);
        router.refresh();
        toast.show({ message: t("restored") });
      },
      // Sin Deshacer en 6 s, se borra de forma definitiva.
      onExpire: () => void purgeDebt(id),
    });
  }

  const footer = (
    <div className="ml-auto flex gap-3">
      <Button variant="secondary" size="lg" onClick={close}>
        {t("modal.cancel")}
      </Button>
      <Button size="lg" icon="check" onClick={submit} disabled={pending || saved}>
        {saved ? t("modal.saved") : pending ? t("modal.saving") : t("modal.save")}
      </Button>
    </div>
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
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label={t("modal.name")}
            placeholder={t("modal.namePlaceholder")}
            value={name}
            maxLength={80}
            onChange={(e) => (setName(e.target.value), clear("name"))}
            error={err("name")}
          />
          <Field
            label={t("modal.subtitle")}
            placeholder={t("modal.subtitlePlaceholder")}
            value={subtitle}
            maxLength={120}
            onChange={(e) => (setSubtitle(e.target.value), clear("subtitle"))}
            error={err("subtitle")}
          />
        </div>

        <fieldset>
          <legend className="text-callout text-ink-2 mb-2 font-semibold">{t("modal.icon")}</legend>
          <div className="flex flex-wrap gap-2">
            {DEBT_ICONS.map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={iconKey === key}
                aria-label={t(`icons.${key}`)}
                title={t(`icons.${key}`)}
                onClick={() => (setIconKey(key), clear("iconKey"))}
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
        </fieldset>

        <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <Field
            label={t("modal.principal")}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={principal}
            onChange={(e) => (setPrincipal(e.target.value), clear("principal"))}
            error={err("principal")}
          />
          <div className="space-y-2">
            <span className="text-callout text-ink-2 block font-semibold">
              {t("modal.currency")}
            </span>
            <div
              className={cn(currencyLocked && "pointer-events-none opacity-60")}
              aria-disabled={currencyLocked || undefined}
            >
              <SegmentedControl<CurrencyCode>
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

        <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <Field
            label={t("modal.apr")}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={apr}
            onChange={(e) => (setApr(e.target.value), clear("apr"))}
            error={err("apr")}
          />
          <div className="space-y-2">
            <span className="text-callout text-ink-2 block font-semibold">
              {t("modal.aprKind")}
            </span>
            <SegmentedControl<AprKind>
              label={t("modal.aprKind")}
              options={[
                { value: "EA", label: t("modal.aprKindEA") },
                { value: "nominal", label: t("modal.aprKindNominal") },
              ]}
              value={aprKind}
              onChange={setAprKind}
            />
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label={t("modal.minPayment")}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={minPayment}
            onChange={(e) => (setMinPayment(e.target.value), clear("minPayment"))}
            error={err("minPayment")}
          />
          <Field
            label={t("modal.dueDay")}
            inputMode="numeric"
            placeholder={t("modal.dueDayPlaceholder")}
            value={dueDay}
            maxLength={2}
            onChange={(e) => (setDueDay(e.target.value), clear("dueDay"))}
            error={err("dueDay")}
          />
        </div>

        {formError && (
          <p role="alert" className="text-callout text-negative-text">
            {formError}
          </p>
        )}

        {editing && (
          <section className="rounded-row border-negative/40 space-y-3 border p-4">
            <h3 className="text-headline text-ink">{t("modal.deleteTitle")}</h3>
            <p className="text-callout text-ink-2">{t("modal.deleteHint")}</p>
            {twoStep ? (
              <TwoStepDeleteButton label={t("modal.deleteDebt")} onConfirm={() => void remove()} />
            ) : (
              <>
                <HoldToDeleteButton
                  itemName={t("modal.itemName", { name: editing.name })}
                  onConfirm={() => void remove()}
                />
                <button
                  type="button"
                  className="text-callout text-ember-text block font-medium underline-offset-4 hover:underline"
                  onClick={() => setTwoStep(true)}
                >
                  {t("modal.twoStepToggle")}
                </button>
              </>
            )}
          </section>
        )}
      </form>
    </Modal>
  );
}
