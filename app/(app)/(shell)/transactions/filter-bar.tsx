"use client";

/**
 * Fila de filtros (02-transactions.png): búsqueda, categoría, cuenta, moneda
 * original, rango de fechas y pestañas Todas / Ingresos / Gastos. Cada cambio
 * se guarda en la URL (vuelve a la página 1); la búsqueda espera 300 ms.
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";

import { OPEN_SEARCH_EVENT } from "@/components/shell/search-event";
import { SearchInput } from "@/components/ui/search-input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SelectChip, type SelectOption } from "@/components/ui/select-chip";
import type { AccountSummary } from "@/lib/accounts/queries";
import { EXPENSE_CATEGORY_KEYS, INCOME_CATEGORY_KEYS } from "@/lib/db/types";
import { useFormat } from "@/lib/i18n/use-format";
import { withFilters, type TransactionFilters } from "@/lib/transactions/filters";
import { cn } from "@/lib/utils";

type Props = { filters: TransactionFilters; accounts: AccountSummary[]; today: string };

export function FilterBar({ filters, accounts, today }: Props) {
  const t = useTranslations();
  const f = useFormat();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(filters.q);
  const [from, setFrom] = useState(filters.from ?? "");
  const [to, setTo] = useState(filters.to ?? "");
  const [customOpen, setCustomOpen] = useState(filters.range === "custom");
  // En el teléfono la búsqueda empieza cerrada: la abre el ícono de la topbar.
  const [searchOpen, setSearchOpen] = useState(filters.q.length > 0);
  const searchRef = useRef<HTMLInputElement>(null);

  const apply = (changes: Parameters<typeof withFilters>[1]) =>
    startTransition(() =>
      router.replace(`${pathname}${withFilters(params, changes)}`, { scroll: false }),
    );

  // El ícono de la topbar (solo <1024 px) abre este campo y le da el foco.
  useEffect(() => {
    function open() {
      setSearchOpen(true);
    }
    window.addEventListener(OPEN_SEARCH_EVENT, open);
    return () => window.removeEventListener(OPEN_SEARCH_EVENT, open);
  }, []);
  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  // Búsqueda con espera de 300 ms.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const id = setTimeout(() => apply({ q: search.trim() }), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const tc = (key: string) => t(`categories.${key}`);
  const categoryOptions: SelectOption[] = [
    { value: "all", label: t("transactions.allCategories") },
    ...EXPENSE_CATEGORY_KEYS.map((k) => ({
      value: k,
      label: tc(k),
      group: t("transactions.modal.expense"),
    })),
    ...INCOME_CATEGORY_KEYS.map((k) => ({
      value: k,
      label: tc(k),
      group: t("transactions.modal.income"),
    })),
    { value: "transfer", label: tc("transfer"), group: t("transactions.modal.transfer") },
  ];
  const accountOptions: SelectOption[] = [
    { value: "all", label: t("transactions.allAccounts") },
    ...accounts.map((a) => ({
      value: a.id,
      label: a.archived_at ? `${a.name} (${t("accounts.archived")})` : a.name,
    })),
  ];
  const currencyOptions: SelectOption[] = [
    { value: "all", label: t("currency.filterOption", { value: t("currency.all") }) },
    { value: "COP", label: t("currency.filterOption", { value: "COP" }) },
    { value: "USD", label: t("currency.filterOption", { value: "USD" }) },
  ];
  const monthLabel = f.date(`${filters.month}-01`, "monthYear");
  const rangeOptions: SelectOption[] = [
    {
      value: "month",
      label:
        filters.month === today.slice(0, 7)
          ? t("transactions.rangeThisMonth")
          : monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1),
    },
    { value: "last30", label: t("transactions.rangeLast30") },
    { value: "last90", label: t("transactions.rangeLast90") },
    { value: "year", label: t("transactions.rangeYear") },
    { value: "all", label: t("transactions.rangeAll") },
    { value: "custom", label: t("transactions.rangeCustom") },
  ];

  function onRange(value: string) {
    if (value === "custom") {
      setCustomOpen(true);
      if (from && to) apply({ range: "custom", from, to });
      return;
    }
    setCustomOpen(false);
    apply({ range: value });
  }

  function onCustomDate(nextFrom: string, nextTo: string) {
    setFrom(nextFrom);
    setTo(nextTo);
    if (nextFrom && nextTo) apply({ range: "custom", from: nextFrom, to: nextTo });
  }

  const dateInput =
    "min-h-11 rounded-full border border-border bg-surface px-4 text-ink [color-scheme:inherit]";

  return (
    <div
      className={cn(
        "flex flex-col gap-3 transition-opacity duration-150 lg:flex-row lg:flex-wrap lg:items-center",
        pending && "opacity-70",
      )}
    >
      <SearchInput
        ref={searchRef}
        label={t("transactions.searchLabel")}
        placeholder={t("transactions.searchPlaceholder")}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className={cn("w-full lg:w-52", !searchOpen && "max-lg:hidden")}
      />
      {/* Chips en una fila con scroll (m03). En escritorio vuelven al flujo. */}
      <div className="flex items-center gap-3 overflow-x-auto pb-1 lg:contents">
        <SelectChip
          label={t("transactions.categoryFilter")}
          icon="apps"
          value={filters.category}
          options={categoryOptions}
          onChange={(v) => apply({ category: v })}
          active={filters.category !== "all"}
        />
        <SelectChip
          label={t("transactions.accountFilter")}
          icon="wallet"
          value={filters.account}
          options={accountOptions}
          onChange={(v) => apply({ account: v })}
          active={filters.account !== "all"}
        />
        <SelectChip
          label={t("currency.filterLabel")}
          icon="exchange"
          value={filters.currency}
          options={currencyOptions}
          onChange={(v) => apply({ currency: v })}
          active={filters.currency !== "all"}
        />
        {/* El rango de fechas siempre filtra: va con el tinte activo. */}
        <SelectChip
          label={t("transactions.rangeFilter")}
          icon="calendar"
          value={customOpen ? "custom" : filters.range}
          options={rangeOptions}
          onChange={onRange}
          active
        />
        {customOpen && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              aria-label={t("transactions.from")}
              value={from}
              max={to || undefined}
              onChange={(e) => onCustomDate(e.target.value, to)}
              className={dateInput}
            />
            <input
              type="date"
              aria-label={t("transactions.to")}
              value={to}
              min={from || undefined}
              onChange={(e) => onCustomDate(from, e.target.value)}
              className={dateInput}
            />
          </div>
        )}
        <SegmentedControl
          className="lg:ml-auto"
          label={t("transactions.tabsLabel")}
          options={[
            { value: "all", label: t("transactions.tabAll") },
            { value: "income", label: t("transactions.tabIncome") },
            { value: "expense", label: t("transactions.tabExpenses") },
          ]}
          value={filters.type}
          onChange={(v) => apply({ type: v })}
        />
      </div>
    </div>
  );
}
