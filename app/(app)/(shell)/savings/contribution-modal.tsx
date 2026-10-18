"use client";

/**
 * Modal para registrar un aporte a una meta: monto (en la moneda de la
 * meta), fecha y, opcionalmente, la transacción a la que corresponde.
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { SelectField } from "@/components/ui/select-field";
import { useToast } from "@/components/ui/toast";
import type { GoalSummary, LinkableTransaction } from "@/lib/goals/queries";
import {
  validateContribution,
  type ContributionErrorKey,
  type ContributionField,
} from "@/lib/goals/schema";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config";
import { useFormat } from "@/lib/i18n/use-format";
import { withFilters } from "@/lib/transactions/filters";

import { addContribution } from "./actions";

type Props = { goal: GoalSummary | null; transactions: LinkableTransaction[]; today: string };

export function ContributionModal({ goal, transactions, today }: Props) {
  const t = useTranslations("savings");
  const rate = useTranslations("rateLimit");
  const localeRaw = useLocale();
  const locale = isLocale(localeRaw) ? localeRaw : DEFAULT_LOCALE;
  const f = useFormat();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [amount, setAmount] = useState("");
  const [contributedOn, setContributedOn] = useState(today);
  const [transactionId, setTransactionId] = useState("");
  const [errors, setErrors] = useState<Partial<Record<ContributionField, ContributionErrorKey>>>(
    {},
  );
  const [formError, setFormError] = useState<string | null>(null);

  const close = () =>
    router.replace(`${pathname}${withFilters(params, { contribute: null })}`, { scroll: false });
  if (!goal) return <Modal open={false} onClose={close} title="" closeLabel="" />;
  const currency = goal.target.currency;

  function submit() {
    if (!goal) return;
    const input = {
      goalId: goal.id,
      amount,
      currency,
      contributedOn,
      transactionId: transactionId || null,
    };
    const check = validateContribution(input, locale, today);
    if (!check.ok) {
      setErrors(check.errors);
      return;
    }
    setErrors({});
    startTransition(async () => {
      const result = await addContribution(input);
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        if (result.error)
          setFormError(
            result.error === "rateLimited"
              ? rate("write")
              : result.error === "currencyMismatch"
                ? t("contribution.errorCurrency")
                : t("errors.failed"),
          );
        return;
      }
      close();
      toast.show({ message: t("contributionSaved") });
    });
  }

  return (
    <Modal
      open
      onClose={close}
      title={`${t("contribution.title")} · ${goal.name}`}
      closeLabel={t("contribution.close")}
      footer={
        <div className="ml-auto flex gap-3">
          <Button variant="secondary" size="lg" onClick={close}>
            {t("modal.cancel")}
          </Button>
          <Button size="lg" icon="check" onClick={submit} disabled={pending}>
            {pending ? t("contribution.saving") : t("contribution.save")}
          </Button>
        </div>
      }
    >
      <form
        className="space-y-5 pb-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label={`${t("contribution.amount")} (${currency})`}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setErrors((x) => ({ ...x, amount: undefined }));
            }}
            error={errors.amount ? t(`errors.${errors.amount}`) : null}
          />
          <DateField
            label={t("contribution.date")}
            value={contributedOn}
            max={today}
            onChange={(v) => {
              setContributedOn(v);
              setErrors((x) => ({ ...x, contributedOn: undefined }));
            }}
            error={errors.contributedOn ? t(`errors.${errors.contributedOn}`) : null}
          />
        </div>
        <SelectField
          label={t("contribution.transaction")}
          icon="receipt"
          value={transactionId}
          onChange={setTransactionId}
          options={[
            { value: "", label: t("contribution.transactionNone") },
            ...transactions.map((tx) => ({
              value: tx.id,
              label: t("contribution.transactionOption", {
                description: tx.description,
                amount: f.money(tx.amount),
                date: f.date(tx.occurredOn),
              }),
            })),
          ]}
        />
        {formError && (
          <p role="alert" className="text-callout text-negative-text">
            {formError}
          </p>
        )}
      </form>
    </Modal>
  );
}
