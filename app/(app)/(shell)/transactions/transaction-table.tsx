"use client";

/**
 * Lista de transacciones (02-transactions.png): encabezados en mayúsculas,
 * grupos por día y filas clicables que abren el modal de edición. Abajo,
 * "Mostrando 9 de 42 transacciones" y la paginación.
 *
 * Animated List (spec §7): las filas entran solo en la primera carga de la
 * pantalla; después, solo se anima lo que llega nuevo (una transacción recién
 * guardada entra arriba y las demás se acomodan con `layout`). Cambiar un
 * filtro o la página no anima nada.
 */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { CurrencyBadge } from "@/components/money/currency-badge";
import { MoneyAmount } from "@/components/money/money-amount";
import { useRate } from "@/components/money/rate-provider";
import { Button } from "@/components/ui/button";
import { AnimatedList, AnimatedListItem } from "@/components/ui/animated-list";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { ACCOUNT_TYPE_ICON, CATEGORY_META, TRANSFER_META } from "@/lib/categories";
import { useFirstView } from "@/lib/motion/first-view";
import { withFilters } from "@/lib/transactions/filters";
import type { DayGroup } from "@/lib/transactions/group";
import type { TransactionRow } from "@/lib/transactions/queries";
import { cn } from "@/lib/utils";

type Props = {
  rows: TransactionRow[];
  /** Grupos por día con los ids de sus filas (calculados en el servidor). */
  groups: DayGroup<string>[];
  total: number;
  page: number;
  pageCount: number;
  /** Hay filtros aplicados (para elegir el estado vacío). */
  filtered: boolean;
};

/** Ícono en mosaico con el tinte de la categoría. */
const TILE: Record<string, string> = {
  positive: "bg-positive-tint text-positive",
  negative: "bg-negative-tint text-negative",
  warning: "bg-amber-tint text-amber",
  info: "bg-info-tint text-info",
  violet: "bg-violet-tint text-violet",
  pink: "bg-pink-tint text-pink",
  teal: "bg-teal-tint text-teal",
  olive: "bg-olive-tint text-olive",
  neutral: "bg-slate-tint text-slate",
  ember: "bg-ember-50 text-ember",
};

const COLUMNS = "lg:grid-cols-[minmax(0,1fr)_210px_210px_minmax(150px,auto)]";

export function TransactionTable({ rows, groups, total, page, pageCount, filtered }: Props) {
  const t = useTranslations("transactions");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const byId = new Map(rows.map((r) => [r.id, r]));
  const first = useFirstView();
  // Lista base: filtros y página actuales (sin el modal) y los días que ya
  // estaban. Si cambian los filtros, la base se renueva sin animar.
  const listParams = new URLSearchParams(params);
  listParams.delete("tx");
  const listKey = listParams.toString();
  const [base, setBase] = useState(() => ({
    key: listKey,
    dates: new Set(groups.map((g) => g.date)),
    animate: first,
  }));
  if (base.key !== listKey) {
    setBase({ key: listKey, dates: new Set(groups.map((g) => g.date)), animate: false });
  }

  if (rows.length === 0) {
    return filtered ? (
      <EmptyState
        icon="search"
        title={t("emptyFilteredTitle")}
        description={t("emptyFilteredDescription")}
        actions={
          <Button variant="secondary" onClick={() => router.replace(pathname, { scroll: false })}>
            {t("clearFilters")}
          </Button>
        }
      />
    ) : (
      <EmptyState
        icon="receipt"
        title={t("emptyTitle")}
        description={t("emptyDescription")}
        actions={
          <Button
            icon="plus"
            onClick={() =>
              router.push(`${pathname}${withFilters(params, { tx: "new" })}`, { scroll: false })
            }
          >
            {t("add")}
          </Button>
        }
      />
    );
  }

  return (
    <Card className="p-0">
      <div className="px-4 pt-4 sm:px-6">
        <div className={cn("border-divider hidden border-b px-4 pb-3 lg:grid", COLUMNS)}>
          {(["colDescription", "colCategory", "colAccount"] as const).map((k) => (
            <span key={k} className="text-caption text-ink-2 uppercase">
              {t(k)}
            </span>
          ))}
          <span className="text-caption text-ink-2 text-right uppercase">{t("colAmount")}</span>
        </div>

        {groups.map((group) => (
          <section key={group.date} aria-labelledby={`day-${group.date}`} className="pb-1">
            <h3 id={`day-${group.date}`} className="flex items-baseline gap-2 px-4 pt-4 pb-2">
              <span className="text-body text-ink font-semibold capitalize">
                {group.relative ? t(group.relative) : group.weekday}
              </span>
              <span className="text-callout text-ink-2">
                {group.relative
                  ? `${capitalize(group.weekday)}, ${group.shortDate}`
                  : group.shortDate}
              </span>
            </h3>
            <ul key={`${base.key}|${group.date}`}>
              {/* Un día nuevo (p. ej. la primera transacción de hoy) también anima su fila. */}
              <AnimatedList animateOnMount={base.animate || !base.dates.has(group.date)}>
                {group.items.map((id) => {
                  const row = byId.get(id);
                  return row ? (
                    <AnimatedListItem key={id}>
                      <TransactionRowView
                        row={row}
                        onOpen={() =>
                          router.push(`${pathname}${withFilters(params, { tx: row.id })}`, {
                            scroll: false,
                          })
                        }
                      />
                    </AnimatedListItem>
                  ) : null;
                })}
              </AnimatedList>
            </ul>
          </section>
        ))}
      </div>

      <div className="border-divider mt-3 flex flex-wrap items-center justify-between gap-4 border-t px-8 py-5">
        <p className="text-body text-ink-2">{t("showing", { shown: rows.length, total })}</p>
        <Pagination page={page} pageCount={pageCount} />
      </div>
    </Card>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function TransactionRowView({ row, onOpen }: { row: TransactionRow; onOpen: () => void }) {
  const t = useTranslations();
  const { displayCurrency } = useRate();
  const meta =
    row.kind === "transfer"
      ? TRANSFER_META
      : row.categoryKey
        ? CATEGORY_META[row.categoryKey]
        : TRANSFER_META;
  const categoryLabel =
    row.kind === "transfer"
      ? t("categories.transfer")
      : row.categoryKey
        ? t(`categories.${row.categoryKey}`)
        : "";
  const accountLabel =
    row.kind === "transfer" && row.transferTo
      ? t("transactions.transferTo", { from: row.account?.name ?? "", to: row.transferTo.name })
      : (row.account?.name ?? "");

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t("transactions.edit", { description: row.description })}
      className={cn(
        "rounded-row hover:bg-surface2 grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-2.5 text-left transition-colors duration-100",
        COLUMNS,
      )}
    >
      <span className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            "rounded-control grid size-10 shrink-0 place-items-center",
            TILE[meta.tone],
          )}
        >
          <Icon name={meta.icon} />
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="text-body text-ink truncate font-semibold">{row.description}</span>
            <CurrencyBadge currency={row.amount.currency} displayCurrency={displayCurrency} />
          </span>
          {row.note && <span className="text-callout text-ink-2 block truncate">{row.note}</span>}
        </span>
      </span>
      <span className="hidden lg:block">
        <Badge tone={meta.tone} dot>
          {categoryLabel}
        </Badge>
      </span>
      <span className="text-body text-ink-2 hidden min-w-0 items-center gap-2 lg:flex">
        {row.account && (
          <Icon name={ACCOUNT_TYPE_ICON[row.account.type]} size={18} className="shrink-0" />
        )}
        <span className="truncate">{accountLabel}</span>
      </span>
      <MoneyAmount
        value={row.amount}
        sign={row.kind === "expense" ? "-" : row.kind === "income" ? "+" : undefined}
        positive={row.kind === "income"}
        insideInteractive
        className="justify-self-end text-right"
        primaryClassName="text-headline"
      />
    </button>
  );
}

/** Paginación con la página actual en ember-50 y elipsis si hay muchas. */
function Pagination({ page, pageCount }: { page: number; pageCount: number }) {
  const t = useTranslations("transactions");
  const pathname = usePathname();
  const params = useSearchParams();
  if (pageCount <= 1) return null;

  const pages = new Set(
    [1, pageCount, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pageCount),
  );
  if (pageCount <= 7) for (let p = 1; p <= pageCount; p++) pages.add(p);
  const sorted = [...pages].sort((a, b) => a - b);
  const href = (p: number) => `${pathname}${withFilters(params, { page: String(p) })}`;
  const cell =
    "grid size-10 place-items-center rounded-control text-body font-medium tabular-nums transition-colors duration-100";

  return (
    <nav aria-label={t("pagination")} className="flex items-center gap-1">
      {sorted.map((p, i) => (
        <span key={p} className="flex items-center gap-1">
          {i > 0 && p - sorted[i - 1] > 1 && <span className="text-ink-3 px-1">…</span>}
          {p === page ? (
            <span aria-current="page" className={cn(cell, "bg-ember-50 text-ember-text")}>
              {p}
            </span>
          ) : (
            <Link
              href={href(p)}
              scroll={false}
              aria-label={t("page", { page: p })}
              className={cn(cell, "text-ink-2 hover:bg-surface2 hover:text-ink")}
            >
              {p}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
