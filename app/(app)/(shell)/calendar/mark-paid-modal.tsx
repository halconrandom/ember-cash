"use client";

/**
 * "Marcar como pagado" de un vencimiento (calendario y suscripciones). Es lo
 * único que crea su transacción: la persona confirma la cuenta y la fecha
 * real de pago (por defecto hoy; no puede ser futura).
 */
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { MoneyAmount } from "@/components/money/money-amount";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/chip";
import { DateField } from "@/components/ui/date-field";
import { Modal } from "@/components/ui/modal";
import { SelectField } from "@/components/ui/select-field";
import { useToast } from "@/components/ui/toast";
import type { AccountSummary } from "@/lib/accounts/queries";
import { ACCOUNT_TYPE_ICON } from "@/lib/categories";
import { useFormat } from "@/lib/i18n/use-format";
import type { AgendaItem } from "@/lib/recurring/queries";

import { markOccurrencePaid } from "./actions";

type Props = {
  /** Vencimiento a confirmar; null = cerrado. */
  event: AgendaItem | null;
  accounts: AccountSummary[];
  today: string;
  onClose: () => void;
};

export function MarkPaidModal({ event, accounts, today, onClose }: Props) {
  const t = useTranslations("occurrences");
  if (!event) return <Modal open={false} onClose={onClose} title="" closeLabel="" />;
  return (
    <MarkPaidForm
      key={event.occurrenceId}
      event={event}
      accounts={accounts}
      today={today}
      onClose={onClose}
      title={t("markPaidTitle")}
    />
  );
}

function MarkPaidForm({
  event,
  accounts,
  today,
  onClose,
  title,
}: Props & { event: AgendaItem; title: string }) {
  const t = useTranslations("occurrences");
  const f = useFormat();
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const initialAccount =
    accounts.find((a) => a.id === event.accountId)?.id ?? accounts[0]?.id ?? "";
  const [accountId, setAccountId] = useState(initialAccount);
  // Por defecto hoy; si vence más adelante y se paga antes, también hoy.
  const [paidOn, setPaidOn] = useState(today);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await markOccurrencePaid({
        occurrenceId: event.occurrenceId,
        accountId: accountId || null,
        paidOn,
      });
      if (!result.ok) {
        setError(t(`errors.${result.error}`));
        return;
      }
      onClose();
      toast.show({ message: t("markPaidDone", { name: event.name }) });
      router.refresh();
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      closeLabel={t("close")}
      className="w-[520px]"
      footer={
        <>
          <Button icon="check" onClick={submit} disabled={pending || accounts.length === 0}>
            {pending ? t("saving") : t("markPaid")}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <p className="text-headline text-ink">{event.name}</p>
            <p className="text-callout text-ink-2 flex flex-wrap items-center gap-2">
              {t("dueOn", { date: f.date(event.dueOn) })}
              <StateBadge state={event.state} />
            </p>
          </div>
          <MoneyAmount kind="total" value={event.amount} className="shrink-0 text-right" />
        </div>
        {accounts.length === 0 ? (
          <p className="text-callout text-ink-2">{t("noAccounts")}</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            <DateField
              label={t("paidOn")}
              value={paidOn}
              max={today}
              onChange={(value) => {
                setPaidOn(value);
                setError(null);
              }}
            />
            <SelectField
              label={t("account")}
              icon={ACCOUNT_TYPE_ICON[accounts.find((a) => a.id === accountId)?.type ?? "checking"]}
              value={accountId}
              onChange={setAccountId}
              options={accounts.map((a) => ({ value: a.id, label: `${a.name} · ${a.currency}` }))}
            />
          </div>
        )}
        {error && (
          <p role="alert" className="text-callout text-negative-text">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

/** "Por pagar" (hoy) o "Vencida"; nada para los próximos. */
export function StateBadge({ state }: { state: AgendaItem["state"] }) {
  const t = useTranslations("occurrences");
  if (state === "upcoming") return null;
  return (
    <Badge tone={state === "overdue" ? "negative" : "warning"} size="sm">
      {state === "overdue" ? t("overdue") : t("due")}
    </Badge>
  );
}
