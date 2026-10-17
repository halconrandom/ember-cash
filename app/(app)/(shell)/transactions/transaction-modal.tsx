"use client";

/**
 * Modal para agregar o editar una transacción (07-add-transaction.png).
 * - Pestañas Gasto / Ingreso / Transferencia.
 * - Monto grande con su moneda (COP/USD) y la conversión a la otra moneda con
 *   la tasa actual (spec §4.8: la moneda se muestra una sola vez).
 * - Descripción, categoría en chips, fecha, cuenta, "Pagó" (solo en un hogar)
 *   y notas.
 * - Transferencia: cuenta de origen y destino; no cuenta como ingreso ni gasto.
 * - Al guardar con éxito, el botón pasa a un check y el modal se cierra.
 * Valida con el mismo esquema que el servidor (validateTransaction).
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";

import { AccountCreateForm } from "@/components/accounts/account-create-form";
import { useRate } from "@/components/money/rate-provider";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SelectField } from "@/components/ui/select-field";
import { TextareaField } from "@/components/ui/textarea-field";
import type { AccountSummary } from "@/lib/accounts/queries";
import { ACCOUNT_TYPE_ICON, CATEGORY_META, categoriesFor } from "@/lib/categories";
import type { CategoryKey, CurrencyCode } from "@/lib/db/types";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config";
import { useFormat } from "@/lib/i18n/use-format";
import { convert, otherCurrency } from "@/lib/money/convert";
import { parseMoney } from "@/lib/money/parse";
import { withFilters } from "@/lib/transactions/filters";
import type { TransactionRow } from "@/lib/transactions/queries";
import {
  validateTransaction,
  type TransactionErrorKey,
  type TransactionField,
  type TransactionKind,
} from "@/lib/transactions/schema";
import { useDeleteTransaction } from "@/lib/transactions/use-delete-transaction";
import { cn } from "@/lib/utils";

import { saveTransaction } from "./actions";

type Member = { userId: string; displayName: string | null };

type Props = {
  open: boolean;
  editing: TransactionRow | null;
  accounts: AccountSummary[];
  /** Miembros del hogar; null en Personal (entonces no se muestra "Pagó"). */
  members: Member[] | null;
  currentUserId: string;
  today: string;
};

/** Clases de chip de categoría seleccionado: tinte y borde del color de la categoría. */
const SELECTED: Record<string, string> = {
  positive: "border-positive bg-positive-tint",
  warning: "border-amber bg-amber-tint",
  info: "border-info bg-info-tint",
  violet: "border-violet bg-violet-tint",
  pink: "border-pink bg-pink-tint",
  teal: "border-teal bg-teal-tint",
  olive: "border-olive bg-olive-tint",
  neutral: "border-slate bg-slate-tint",
};
const ICON_COLOR: Record<string, string> = {
  positive: "text-positive",
  warning: "text-amber",
  info: "text-info",
  violet: "text-violet",
  pink: "text-pink",
  teal: "text-teal",
  olive: "text-olive",
  neutral: "text-slate",
};

export function TransactionModal({
  open,
  editing,
  accounts,
  members,
  currentUserId,
  today,
}: Props) {
  const t = useTranslations();
  const tm = useTranslations("transactions.modal");
  const localeRaw = useLocale();
  const locale = isLocale(localeRaw) ? localeRaw : DEFAULT_LOCALE;
  const f = useFormat();
  const { rate, status, displayCurrency } = useRate();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const deleteFlow = useDeleteTransaction();
  const [pending, startTransition] = useTransition();
  const amountRef = useRef<HTMLInputElement>(null);

  const [kind, setKind] = useState<TransactionKind>(editing?.kind ?? "expense");
  const [currency, setCurrency] = useState<CurrencyCode>(
    editing?.amount.currency ?? displayCurrency,
  );
  const [amount, setAmount] = useState(editing ? f.amount(editing.amount) : "");
  const [categoryKey, setCategoryKey] = useState<string | null>(editing?.categoryKey ?? null);
  const [description, setDescription] = useState(editing?.description ?? "");
  const [note, setNote] = useState(editing?.note ?? "");
  const [occurredOn, setOccurredOn] = useState(editing?.occurredOn ?? today);
  const [accountId, setAccountId] = useState(editing?.account?.id ?? accounts[0]?.id ?? "");
  const [transferTo, setTransferTo] = useState(editing?.transferTo?.id ?? "");
  const [paidBy, setPaidBy] = useState(editing?.paidBy ?? currentUserId);
  const [errors, setErrors] = useState<Partial<Record<TransactionField, TransactionErrorKey>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  /** Al editar un campo, su error desaparece. */
  const clear = (field: TransactionField) =>
    setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));

  const close = () =>
    router.replace(`${pathname}${withFilters(params, { tx: null })}`, { scroll: false });
  const err = (field: TransactionField) =>
    errors[field] ? t(`transactions.errors.${errors[field]}`) : null;

  function changeKind(next: TransactionKind) {
    setKind(next);
    if (
      next !== "transfer" &&
      categoryKey &&
      !(categoriesFor(next) as readonly string[]).includes(categoryKey)
    )
      setCategoryKey(null);
    setErrors({});
  }

  /** Línea de conversión bajo el monto (spec §4.8). */
  const parsed = parseMoney(amount, currency, locale, { allowZero: true });
  const conversion =
    status === "error" || !rate
      ? tm("conversionUnavailable")
      : tm("conversion", {
          amount: f.money(
            convert(
              parsed.ok ? parsed.value : { amountMinor: 0n, currency },
              otherCurrency(currency),
              rate,
            ),
            { approx: true },
          ),
          rate: f.number(Number(rate.rate), 2),
          date: f.date(rate.asOf),
        });

  function submit() {
    const input = {
      id: editing?.id ?? null,
      kind,
      amount,
      currency,
      categoryKey,
      description,
      note,
      occurredOn,
      accountId,
      transferToAccountId: kind === "transfer" ? transferTo || null : null,
      paidBy: members && kind !== "transfer" ? paidBy : null,
    };
    const check = validateTransaction(input, locale);
    if (!check.ok) {
      setErrors(check.errors);
      if (check.errors.amount) amountRef.current?.focus();
      return;
    }
    setErrors({});
    setFormError(null);
    startTransition(async () => {
      const result = await saveTransaction(input);
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        if (result.error) {
          setFormError(
            tm(
              result.error === "forbidden"
                ? "errorForbidden"
                : result.error === "notFound"
                  ? "errorNotFound"
                  : "errorFailed",
            ),
          );
        }
        return;
      }
      // El botón pasa a un check y después se cierra el modal.
      setSaved(true);
      setTimeout(close, 450);
    });
  }

  async function remove() {
    if (!editing) return;
    if (await deleteFlow(editing.id)) close();
  }

  const accountOptions = accounts.map((a) => ({ value: a.id, label: `${a.name} · ${a.currency}` }));
  const accountIcon =
    ACCOUNT_TYPE_ICON[accounts.find((a) => a.id === accountId)?.type ?? "checking"];

  const footer =
    accounts.length === 0 ? (
      <Button variant="secondary" size="lg" className="ml-auto" onClick={close}>
        {tm("cancel")}
      </Button>
    ) : (
      <>
        {editing && (
          <Button
            variant="danger-outline"
            size="lg"
            icon="trash"
            onClick={remove}
            disabled={pending || saved}
          >
            {tm("delete")}
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
      {accounts.length === 0 ? (
        <div className="space-y-6 pb-4">
          <EmptyState
            icon="bank"
            title={tm("noAccountsTitle")}
            description={tm("noAccountsDescription")}
            className="py-8"
          />
          <AccountCreateForm
            defaultCurrency={displayCurrency}
            onCreated={(id) => setAccountId(id)}
          />
        </div>
      ) : (
        <form
          className="space-y-6 pb-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <SegmentedControl
            className="flex w-full [&>button]:flex-1"
            label={tm("kindLabel")}
            options={[
              { value: "expense", label: tm("expense") },
              { value: "income", label: tm("income") },
              { value: "transfer", label: tm("transfer") },
            ]}
            value={kind}
            onChange={changeKind}
          />

          {/* Monto: número grande con la unidad una sola vez y su conversión. */}
          <div
            className={cn(
              "rounded-card bg-surface2 border-[1.5px] p-5",
              errors.amount ? "border-negative" : "border-transparent",
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="tx-amount" className="text-callout text-ink-2 font-semibold">
                {tm("amount")}
              </label>
              <SegmentedControl
                label={tm("amountCurrency")}
                options={[
                  { value: "COP", label: "COP" },
                  { value: "USD", label: "USD" },
                ]}
                value={currency}
                onChange={setCurrency}
              />
            </div>
            <div className="mt-3 flex items-baseline justify-center gap-2">
              <input
                ref={amountRef}
                id="tx-amount"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  clear("amount");
                }}
                onBlur={() => parsed.ok && setAmount(f.amount(parsed.value))}
                aria-invalid={errors.amount ? true : undefined}
                aria-describedby={errors.amount ? "tx-amount-error" : "tx-amount-conversion"}
                style={{ width: `${Math.max(amount.length, 1) + 0.5}ch` }}
                className="text-display text-ink placeholder:text-ink-3 min-w-[2ch] bg-transparent text-center tabular-nums outline-none"
              />
              <span className="text-title2 text-ink-2 font-semibold">{currency}</span>
            </div>
            <div className="mt-3 flex justify-center">
              <span
                id="tx-amount-conversion"
                className="bg-surface text-callout text-ink-2 inline-flex min-h-9 items-center gap-2 rounded-full px-4 tabular-nums"
              >
                <Icon name="exchange" size={16} className="text-ember-text" />
                {conversion}
              </span>
            </div>
            {errors.amount && (
              <p
                id="tx-amount-error"
                role="alert"
                className="text-callout text-negative-text mt-3 text-center"
              >
                {err("amount")}
              </p>
            )}
          </div>

          <Field
            label={tm("description")}
            placeholder={tm("descriptionPlaceholder")}
            value={description}
            maxLength={200}
            onChange={(e) => {
              setDescription(e.target.value);
              clear("description");
            }}
            error={err("description")}
          />

          {kind === "transfer" ? (
            <p className="rounded-control bg-surface2 text-callout text-ink-2 px-4 py-3">
              {tm("transferHint")}
            </p>
          ) : (
            <fieldset className="space-y-2">
              <legend className="text-callout text-ink-2 mb-2 font-semibold">
                {tm("category")}
              </legend>
              <div className="flex flex-wrap gap-2.5">
                {categoriesFor(kind).map((key) => {
                  const meta = CATEGORY_META[key as CategoryKey];
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
                        "text-body text-ink inline-flex h-11 items-center gap-2 rounded-full border-[1.5px] px-4 font-medium transition-colors duration-100",
                        selected
                          ? cn(SELECTED[meta.tone], "font-semibold")
                          : "bg-surface2 hover:bg-border border-transparent",
                      )}
                    >
                      <Icon name={meta.icon} size={18} className={ICON_COLOR[meta.tone]} />
                      {t(`categories.${key}`)}
                    </button>
                  );
                })}
              </div>
              {errors.categoryKey && (
                <p role="alert" className="text-callout text-negative-text">
                  {err("categoryKey")}
                </p>
              )}
            </fieldset>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <DateField
              label={tm("date")}
              value={occurredOn}
              onChange={(v) => {
                setOccurredOn(v);
                clear("occurredOn");
              }}
              error={err("occurredOn")}
            />
            <SelectField
              label={kind === "transfer" ? tm("fromAccount") : tm("account")}
              icon={accountIcon}
              value={accountId}
              onChange={(v) => {
                setAccountId(v);
                clear("accountId");
              }}
              options={accountOptions}
              placeholder={tm("chooseAccount")}
              error={err("accountId")}
            />
            {kind === "transfer" && (
              <SelectField
                label={tm("toAccount")}
                icon="bank"
                value={transferTo}
                onChange={(v) => {
                  setTransferTo(v);
                  clear("transferToAccountId");
                }}
                options={accountOptions.filter((o) => o.value !== accountId)}
                placeholder={tm("chooseAccount")}
                error={err("transferToAccountId")}
              />
            )}
            {members && kind !== "transfer" && (
              <SelectField
                label={tm("paidBy")}
                icon="user"
                value={paidBy}
                onChange={setPaidBy}
                options={members.map((m) => ({ value: m.userId, label: m.displayName ?? "—" }))}
              />
            )}
          </div>

          <TextareaField
            label={tm("notes")}
            placeholder={tm("notesPlaceholder")}
            value={note}
            maxLength={2000}
            onChange={(e) => {
              setNote(e.target.value);
              clear("note");
            }}
            error={err("note")}
          />

          {formError && (
            <p role="alert" className="text-callout text-negative-text">
              {formError}
            </p>
          )}
        </form>
      )}
    </Modal>
  );
}

/**
 * Fecha con el formato del frame ("vie, 16 de oct de 2026"): el texto se ve
 * formateado y un <input type="date"> transparente encima abre el selector
 * nativo (accesible con teclado).
 */
function DateField({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error: string | null;
}) {
  const f = useFormat();
  const display = value ? f.date(value, "weekdayDateYear") : "";
  return (
    <div className="space-y-2">
      <label htmlFor="tx-date" className="text-callout text-ink-2 block font-semibold">
        {label}
      </label>
      <div
        className={cn(
          "rounded-control bg-surface2 relative flex h-11 items-center gap-3 border px-4",
          error ? "border-negative border-[1.5px]" : "border-transparent",
        )}
      >
        <Icon name="calendar" className="text-ink-2" />
        <span className="text-body text-ink flex-1">{display}</span>
        <Icon name="angle-small-down" size={18} className="text-ink-2" />
        <input
          id="tx-date"
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </div>
      {error && (
        <p role="alert" className="text-callout text-negative-text">
          {error}
        </p>
      )}
    </div>
  );
}
