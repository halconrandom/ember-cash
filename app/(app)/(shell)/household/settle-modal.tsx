"use client";

/**
 * Modal "Liquidar cuentas". Dos modos:
 * - Total: registra una liquidación por cada moneda con saldo (el servidor
 *   vuelve a calcular el balance), así el balance queda exactamente en 0.
 * - Parcial: un monto en la moneda elegida, hasta lo que se debe.
 * Al guardar aparece el toast con Deshacer, que borra lo registrado.
 */
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useToast } from "@/components/ui/toast";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config";
import { useFormat } from "@/lib/i18n/use-format";
import type { Money } from "@/lib/money/money";
import { parseMoney } from "@/lib/money/parse";

import { settleUp, undoSettlement } from "./actions";

type Transfer = { from: string; to: string; amount: Money };

type Props = {
  open: boolean;
  onClose: () => void;
  householdId: string;
  /** Deuda en la moneda elegida (null si no hay tasa para sumar monedas). */
  transfer: Transfer | null;
  /** Liquidación total, una por moneda. */
  plan: Transfer[];
  nameOf: (id: string) => string;
  currentUserId: string;
};

export function SettleModal({ open, onClose, householdId, transfer, plan, nameOf }: Props) {
  const t = useTranslations("household");
  const rate = useTranslations("rateLimit");
  const f = useFormat();
  const localeRaw = useLocale();
  const locale = isLocale(localeRaw) ? localeRaw : DEFAULT_LOCALE;
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = useState<"full" | "partial">("full");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    setMode("full");
    setText("");
    setError(null);
    onClose();
  }

  function submit() {
    setError(null);
    let input: unknown;
    if (mode === "full") {
      input = { mode: "full", householdId };
    } else {
      if (!transfer) return;
      const parsed = parseMoney(text, transfer.amount.currency, locale);
      if (!parsed.ok) {
        setError(t(`settleErrors.${parsed.error}`));
        return;
      }
      if (parsed.value.amountMinor > transfer.amount.amountMinor) {
        setError(t("settleErrors.tooMuch", { amount: f.money(transfer.amount) }));
        return;
      }
      input = {
        mode: "partial",
        householdId,
        fromUser: transfer.from,
        toUser: transfer.to,
        amountMinor: parsed.value.amountMinor.toString(),
        currency: parsed.value.currency,
      };
    }
    startTransition(async () => {
      const result = await settleUp(input);
      if (!result.ok) {
        setError(
          result.error === "rateLimited"
            ? rate("write")
            : t(result.error === "nothing" ? "settleErrors.nothing" : "settleErrors.failed"),
        );
        return;
      }
      close();
      toast.show({
        message: t("settleDone"),
        onUndo: async () => {
          await undoSettlement(result.ids);
          router.refresh();
        },
      });
      router.refresh();
    });
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={t("settleTitle")}
      closeLabel={t("close")}
      className="w-[520px]"
      footer={
        <>
          <Button onClick={submit} disabled={pending || plan.length === 0}>
            {pending ? t("settleSaving") : t("settleConfirm")}
          </Button>
          <Button variant="secondary" onClick={close}>
            {t("cancel")}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <SegmentedControl
          label={t("settleModeLabel")}
          value={mode}
          onChange={(m) => {
            setMode(m);
            setError(null);
          }}
          options={[
            { value: "full", label: t("settleFull") },
            ...(transfer ? [{ value: "partial" as const, label: t("settlePartial") }] : []),
          ]}
        />
        {mode === "full" ? (
          <div className="space-y-2">
            <p className="text-body text-ink-2">{t("settleFullDescription")}</p>
            <ul className="space-y-1">
              {plan.map((p) => (
                <li key={p.amount.currency} className="text-headline text-ink">
                  {t("paysAmount", {
                    from: nameOf(p.from),
                    to: nameOf(p.to),
                    amount: f.money(p.amount),
                  })}
                </li>
              ))}
            </ul>
            {error && (
              <p role="alert" className="text-callout text-negative-text">
                {error}
              </p>
            )}
          </div>
        ) : (
          transfer && (
            <Field
              label={t("settlePartialLabel", {
                from: nameOf(transfer.from),
                to: nameOf(transfer.to),
              })}
              inputMode="decimal"
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={f.amount(transfer.amount)}
              hint={t("settlePartialHint", { amount: f.money(transfer.amount) })}
              error={error}
            />
          )
        )}
      </div>
    </Modal>
  );
}
