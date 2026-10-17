"use client";

/**
 * Modal de presupuesto compartido: crear o editar el límite de una categoría
 * en el mes elegido, quitarlo (con Deshacer) o copiar los límites de un mes
 * anterior. Solo compartidos en la UI; la tabla también admite personales.
 */
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { useRate } from "@/components/money/rate-provider";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SelectField } from "@/components/ui/select-field";
import { useToast } from "@/components/ui/toast";
import {
  CURRENCY_CODES,
  EXPENSE_CATEGORY_KEYS,
  type CategoryKey,
  type CurrencyCode,
} from "@/lib/db/types";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config";
import { useFormat } from "@/lib/i18n/use-format";
import type { Money } from "@/lib/money/money";
import { parseMoney } from "@/lib/money/parse";

import { copyBudgets, deleteBudget, saveBudget } from "./actions";

/** Lo que abre el modal: un límite nuevo, uno existente o copiar un mes. */
export type BudgetDraft = {
  month: string;
  id?: string;
  categoryKey?: CategoryKey;
  limit?: Money;
  copyFrom?: string;
};

type Props = {
  householdId: string;
  draft: BudgetDraft | null;
  /** Categorías que ya tienen límite este mes. */
  taken: CategoryKey[];
  onClose: () => void;
};

export function BudgetModal({ householdId, draft, taken, onClose }: Props) {
  const t = useTranslations("household");
  if (!draft) return <Modal open={false} onClose={onClose} title="" closeLabel="" />;
  if (draft.copyFrom) {
    return <CopyBudgets householdId={householdId} draft={draft} onClose={onClose} />;
  }
  return (
    <BudgetForm
      key={draft.id ?? "new"}
      householdId={householdId}
      draft={draft}
      taken={taken}
      onClose={onClose}
      title={draft.id ? t("budgetEditTitle") : t("budgetNewTitle")}
    />
  );
}

function BudgetForm({
  householdId,
  draft,
  taken,
  onClose,
  title,
}: Props & { draft: BudgetDraft; title: string }) {
  const t = useTranslations("household");
  const tc = useTranslations("categories");
  const f = useFormat();
  const localeRaw = useLocale();
  const locale = isLocale(localeRaw) ? localeRaw : DEFAULT_LOCALE;
  const router = useRouter();
  const toast = useToast();
  const { displayCurrency } = useRate();
  const free = EXPENSE_CATEGORY_KEYS.filter((k) => k === draft.categoryKey || !taken.includes(k));
  const [category, setCategory] = useState<string>(draft.categoryKey ?? free[0] ?? "");
  const [currency, setCurrency] = useState<CurrencyCode>(draft.limit?.currency ?? displayCurrency);
  const [text, setText] = useState(draft.limit ? f.amount(draft.limit) : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    const parsed = parseMoney(text, currency, locale);
    if (!parsed.ok) {
      setError(t(`settleErrors.${parsed.error}`));
      return;
    }
    startTransition(async () => {
      const result = await saveBudget({
        householdId,
        categoryKey: category,
        month: draft.month,
        limitMinor: parsed.value.amountMinor.toString(),
        currency,
      });
      if (!result.ok) {
        setError(t("budgetFailed"));
        return;
      }
      onClose();
      router.refresh();
    });
  }

  function remove() {
    if (!draft.id || !draft.limit || !draft.categoryKey) return;
    const { id, limit, categoryKey } = draft;
    startTransition(async () => {
      const result = await deleteBudget(id);
      if (!result.ok) {
        setError(t("budgetFailed"));
        return;
      }
      onClose();
      toast.show({
        message: t("budgetDeleted"),
        // Deshacer: vuelve a crear el mismo límite.
        onUndo: async () => {
          await saveBudget({
            householdId,
            categoryKey,
            month: draft.month,
            limitMinor: limit.amountMinor.toString(),
            currency: limit.currency,
          });
          router.refresh();
        },
      });
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
          <Button onClick={save} disabled={pending || !category}>
            {t("budgetSave")}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          {draft.id && (
            <Button
              variant="danger-outline"
              className="ml-auto"
              onClick={remove}
              disabled={pending}
            >
              {t("budgetDelete")}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        {draft.categoryKey ? (
          <p className="text-headline text-ink">{tc(draft.categoryKey)}</p>
        ) : (
          <SelectField
            label={t("budgetCategory")}
            value={category}
            onChange={setCategory}
            options={free.map((k) => ({ value: k, label: tc(k) }))}
          />
        )}
        <div className="flex items-end gap-3">
          <Field
            label={t("budgetLimit")}
            inputMode="decimal"
            autoFocus
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
            error={error}
            className="flex-1"
          />
          <SegmentedControl
            label={t("budgetCurrency")}
            value={currency}
            onChange={setCurrency}
            options={CURRENCY_CODES.map((c) => ({ value: c, label: c }))}
            className="mb-1"
          />
        </div>
      </div>
    </Modal>
  );
}

function CopyBudgets({
  householdId,
  draft,
  onClose,
}: {
  householdId: string;
  draft: BudgetDraft;
  onClose: () => void;
}) {
  const t = useTranslations("household");
  const f = useFormat();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const from = f.date(`${draft.copyFrom}-01`, "monthYear");
  const to = f.date(`${draft.month}-01`, "monthYear");

  function copy() {
    startTransition(async () => {
      const result = await copyBudgets({
        householdId,
        fromMonth: draft.copyFrom,
        toMonth: draft.month,
      });
      if (!result.ok) {
        setError(t("budgetFailed"));
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t("budgetCopyTitle")}
      closeLabel={t("close")}
      className="w-[520px]"
      footer={
        <>
          <Button onClick={copy} disabled={pending}>
            {t("budgetCopyConfirm")}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
        </>
      }
    >
      <p className="text-body text-ink-2">{t("budgetCopyDescription", { from, to })}</p>
      {error && (
        <p role="alert" className="text-callout text-negative-text mt-3">
          {error}
        </p>
      )}
    </Modal>
  );
}
