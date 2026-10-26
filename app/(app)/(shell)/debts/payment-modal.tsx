"use client";

/**
 * Modal para registrar un pago: monto, interés (estimado con la tasa del mes
 * sobre el saldo actual, editable) y capital = monto − interés. Opcionalmente
 * crea la transacción vinculada en una cuenta de la misma moneda. Si la
 * deuda es una tarjeta enlazada (0031), el pago es una transferencia
 * obligatoria desde otra cuenta a la tarjeta, todo capital (sin interés).
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
import type { AccountSummary } from "@/lib/accounts/queries";
import { monthlyInterest, monthlyRateScaled } from "@/lib/debts/payoff";
import type { DebtSummary } from "@/lib/debts/queries";
import { validatePayment, type PaymentErrorKey, type PaymentField } from "@/lib/debts/schema";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config";
import { useFormat } from "@/lib/i18n/use-format";
import { money } from "@/lib/money/money";
import { parseMoney } from "@/lib/money/parse";
import { withFilters } from "@/lib/transactions/filters";

import { recordPayment } from "./actions";

type Props = { debt: DebtSummary | null; accounts: AccountSummary[]; today: string };

export function PaymentModal({ debt, accounts, today }: Props) {
  const t = useTranslations("debts");
  const rate = useTranslations("rateLimit");
  const localeRaw = useLocale();
  const locale = isLocale(localeRaw) ? localeRaw : DEFAULT_LOCALE;
  const f = useFormat();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const estimate = debt
    ? money(
        monthlyInterest(debt.balance.amountMinor, monthlyRateScaled(debt.aprBps, debt.aprKind)),
        debt.balance.currency,
      )
    : null;
  const [amount, setAmount] = useState(debt ? f.amount(debt.minPayment) : "");
  const [interest, setInterest] = useState(estimate ? f.amount(estimate) : "");
  const [paidOn, setPaidOn] = useState(today);
  const card = Boolean(debt?.accountId);
  const [createTx, setCreateTx] = useState(card);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [errors, setErrors] = useState<Partial<Record<PaymentField, PaymentErrorKey>>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const close = () =>
    router.replace(`${pathname}${withFilters(params, { pay: null })}`, { scroll: false });
  if (!debt || !estimate) return <Modal open={false} onClose={close} title="" closeLabel="" />;
  const currency = debt.balance.currency;
  const err = (k: PaymentField) => (errors[k] ? t(`errors.${errors[k]}`) : null);

  const a = parseMoney(amount, currency, locale);
  const i = parseMoney(card ? "0" : interest || "0", currency, locale, { allowZero: true });
  const principal =
    a.ok && i.ok && i.value.amountMinor <= a.value.amountMinor
      ? money(a.value.amountMinor - i.value.amountMinor, currency)
      : null;

  function submit() {
    if (!debt) return;
    const input = {
      debtId: debt.id,
      currency,
      amount,
      paidOn,
      interest: card ? "0" : interest,
      createTransaction: card || createTx,
      accountId,
    };
    const check = validatePayment(input, locale, today);
    if (!check.ok) {
      setErrors(check.errors);
      return;
    }
    setErrors({});
    startTransition(async () => {
      const result = await recordPayment(input);
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        if (result.error) {
          setFormError(result.error === "rateLimited" ? rate("write") : t("errors.failed"));
        }
        return;
      }
      close();
      toast.show({ message: t("paymentSaved") });
    });
  }

  return (
    <Modal
      open
      onClose={close}
      title={`${t("payment.title")} · ${debt.name}`}
      closeLabel={t("payment.close")}
      footer={
        <div className="ml-auto flex gap-3">
          <Button variant="secondary" size="lg" onClick={close}>
            {t("modal.cancel")}
          </Button>
          <Button size="lg" icon="check" onClick={submit} disabled={pending}>
            {pending ? t("payment.saving") : t("payment.save")}
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
            label={`${t("payment.amount")} (${currency})`}
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(e) => (
              setAmount(e.target.value),
              setErrors((x) => ({ ...x, amount: undefined }))
            )}
            error={err("amount")}
          />
          <DateField
            label={t("payment.date")}
            value={paidOn}
            max={today}
            onChange={(v) => (setPaidOn(v), setErrors((x) => ({ ...x, paidOn: undefined })))}
            error={err("paidOn")}
          />
        </div>
        {card ? (
          <p className="text-callout text-ink-2">{t("payment.cardHint")}</p>
        ) : (
          <div className="space-y-2">
            <Field
              label={`${t("payment.interest")} (${currency})`}
              inputMode="decimal"
              autoComplete="off"
              value={interest}
              onChange={(e) => (
                setInterest(e.target.value),
                setErrors((x) => ({ ...x, interest: undefined }))
              )}
              error={err("interest")}
              hint={t("payment.interestHint", { amount: f.money(estimate) })}
            />
            {principal && (
              <p className="text-callout text-ink font-semibold tabular-nums">
                {t("payment.principal", { amount: f.money(principal) })}
              </p>
            )}
          </div>
        )}

        {!card && (
          <label className="text-body text-ink flex items-center gap-3">
            <input
              type="checkbox"
              checked={createTx}
              onChange={(e) => setCreateTx(e.target.checked)}
              className="size-5 accent-[var(--ember-fill)]"
              disabled={accounts.length === 0}
            />
            {t("payment.createTransaction")}
          </label>
        )}
        {accounts.length === 0 ? (
          <p className="text-callout text-ink-3">
            {card ? t("payment.noSourceAccounts") : t("payment.noAccounts")}
          </p>
        ) : (
          (card || createTx) && (
            <SelectField
              label={card ? t("payment.fromAccount") : t("payment.account")}
              icon="bank"
              value={accountId}
              onChange={setAccountId}
              placeholder={t("payment.chooseAccount")}
              options={accounts.map((acc) => ({
                value: acc.id,
                label: `${acc.name} · ${acc.currency}`,
              }))}
              error={err("accountId")}
            />
          )
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
