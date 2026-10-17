"use client";

/**
 * Contenido de /dev/design-system. Reproduce:
 * - 10-design-system.png: tokens, íconos, escala tipográfica, radios,
 *   sombras, espaciado y componentes base.
 * - 19-states.png / 20-states-dark.png: estados de los componentes.
 * Los estados "hover", "presionado" y "foco" se muestran fijos con clases; los
 * componentes reales también se pueden probar en vivo (fila "En vivo").
 * Textos en messages/*.json (namespace designSystem); cifras de ejemplo
 * formateadas según el idioma.
 */
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge, ChoiceChip } from "@/components/ui/chip";
import { CurrencyBadge } from "@/components/money/currency-badge";
import { CurrencyFilter, type CurrencyFilterValue } from "@/components/money/currency-filter";
import { MoneyAmount } from "@/components/money/money-amount";
import { RateProvider, type RateStatus } from "@/components/money/rate-provider";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { HoldToDeleteButton, TwoStepDeleteButton } from "@/components/ui/hold-to-delete";
import { Icon } from "@/components/ui/icon";
import { ICONS, type IconName } from "@/components/ui/icon-registry";
import { Keycap } from "@/components/ui/keycap";
import { ListRow } from "@/components/ui/list-row";
import { RateChip } from "@/components/ui/rate-chip";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SkeletonList } from "@/components/ui/skeleton";
import { ToastSurface, useToast } from "@/components/ui/toast";
import { Tooltip, TooltipSurface } from "@/components/ui/tooltip";
import { useFormat } from "@/lib/i18n/use-format";
import { money } from "@/lib/money/money";
import { cn } from "@/lib/utils";

/** Anillo de foco fijo, para mostrar el estado "foco" sin enfocar. */
const FOCUS = "outline-2 outline-offset-2 outline-focus-ring outline-solid";

/** Fechas de ejemplo de los frames (16 y 9 de octubre de 2026, 22 de octubre). */
const SAMPLE_DATE = "2026-10-16";
const SAMPLE_STALE_DATE = "2026-10-09";
const SAMPLE_DUE_DATE = "2026-10-22";

type T = ReturnType<typeof useTranslations<"designSystem">>;

export function DesignSystemSheet({ theme }: { theme: "light" | "dark" }) {
  const t = useTranslations("designSystem");
  return (
    <>
      {/* Como 10-design-system.png: hoja sobre superficie (blanca en claro). */}
      <div className="bg-surface">
        <div className="mx-auto max-w-[1440px] space-y-16 px-6 py-12 lg:px-12">
          <header>
            <h1 className="text-display text-ink">{t("title")}</h1>
            <p className="text-body text-ink-2 mt-2">
              {t("intro", { theme: t(theme === "light" ? "themeLight" : "themeDark") })}
            </p>
          </header>

          <div className="grid gap-12 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.75fr)]">
            <ColorTokens t={t} />
            <Icons t={t} />
          </div>

          <div className="grid gap-12 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
            <TypeScale t={t} />
            <RadiusShadowSpacing t={t} />
          </div>

          <BaseComponents t={t} />
        </div>
      </div>

      {/* Como 19-states.png / 20-states-dark.png: tarjetas sobre canvas. */}
      <div className="mx-auto max-w-[1440px] px-6 py-12 lg:px-12">
        <ComponentStates t={t} />
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* 10-design-system: tokens                                                   */
/* -------------------------------------------------------------------------- */

/** Tokens mostrados, en el orden de la hoja. La etiqueta sale de designSystem.swatches. */
const SWATCHES = [
  "canvas",
  "surface",
  "surface2",
  "border",
  "text",
  "text2",
  "text3",
  "ember-fill",
  "ember",
  "ember-text",
  "hero-start",
  "hero-end",
  "ember-50",
  "positive-text",
  "positive",
  "negative-text",
  "negative",
  "info-text",
  "violet-text",
  "amber-text",
  "pink-text",
  "teal",
  "olive",
  "slate",
  "income-bar",
  "expense-bar",
  "member-a",
  "member-b",
  "track",
  "focus-ring",
] as const;

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="text-caption text-ink-2 mb-5 uppercase">{children}</h2>;
}

function ColorTokens({ t }: { t: T }) {
  return (
    <section>
      <SectionLabel>{t("colorTokens")}</SectionLabel>
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4 lg:grid-cols-6">
        {SWATCHES.map((token) => (
          <Swatch key={token} token={token} label={t(`swatches.${token}`)} />
        ))}
      </div>
    </section>
  );
}

/** Muestra claro delante y oscuro detrás, con el hex claro leído del CSS. */
function Swatch({ label, token }: { label: string; token: string }) {
  const lightRef = useRef<HTMLSpanElement>(null);
  const [hex, setHex] = useState("");

  useEffect(() => {
    if (lightRef.current) {
      const value = getComputedStyle(lightRef.current).getPropertyValue(`--${token}`).trim();
      // El CSS puede llegar minificado (#fff): se muestra siempre con 6 dígitos.
      const full = /^#[0-9a-f]{3}$/i.test(value)
        ? `#${[...value.slice(1)].map((c) => c + c).join("")}`
        : value;
      setHex(full.toUpperCase());
    }
  }, [token]);

  return (
    <div>
      <div className="relative h-12 w-[78px]">
        <span className="dark absolute top-2 left-7">
          <span
            className="block h-10 w-[50px] rounded-[10px] border border-black/10"
            style={{ background: `var(--${token})` }}
          />
        </span>
        <span ref={lightRef} className="light absolute top-0 left-0">
          <span
            className="shadow-card block h-10 w-[50px] rounded-[10px] border border-black/10"
            style={{ background: `var(--${token})` }}
          />
        </span>
      </div>
      <p className="text-callout text-ink mt-1.5 font-medium">{label}</p>
      <p className="text-footnote text-ink-2 tabular-nums">{hex}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 10-design-system: íconos                                                   */
/* -------------------------------------------------------------------------- */

/** Orden de la hoja de diseño; después, el resto de los íconos de la spec. */
const SHEET_ORDER: IconName[] = [
  "apps",
  "receipt",
  "piggy-bank",
  "credit-card",
  "refresh",
  "calendar",
  "users",
  "wallet",
  "bank",
  "home",
  "shopping-cart",
  "car-side",
  "heart",
  "ticket",
  "wifi",
  "play",
  "music",
  "cloud",
  "graduation-cap",
  "dumbbell-horizontal",
  "newspaper",
  "palette",
  "laptop",
  "plane",
  "umbrella-beach",
  "motorcycle",
  "mobile",
  "bell",
  "search",
  "plus",
  "check",
  "cross-small",
  "exchange",
  "target",
  "flag",
  "sparkles",
  "chart-line-up",
  "sack-dollar",
  "calendar-clock",
  "info",
  "settings",
  "user-add",
  "arrows-repeat",
  "arrow-small-up",
  "arrow-small-down",
  "angle-small-down",
  "file-invoice-dollar",
];
const EXTRA_ICONS = (Object.keys(ICONS) as IconName[]).filter((n) => !SHEET_ORDER.includes(n));

/** Mosaico de ícono. `name` es el identificador técnico (title nativo). */
function IconTile({ children, name }: { children: React.ReactNode; name: string }) {
  return (
    <span
      title={name}
      className="rounded-control bg-surface2 text-ink grid size-[42px] place-items-center"
    >
      {children}
    </span>
  );
}

function Icons({ t }: { t: T }) {
  return (
    <section>
      <SectionLabel>{t("icons")}</SectionLabel>
      <div className="flex flex-wrap gap-3">
        {SHEET_ORDER.map((name) => (
          <IconTile key={name} name={name}>
            <Icon name={name} />
          </IconTile>
        ))}
        <IconTile name="flame">
          <Icon name="flame" variant="solid" className="text-ember" />
        </IconTile>
        {EXTRA_ICONS.map((name) => (
          <IconTile key={name} name={name}>
            <Icon name={name} />
          </IconTile>
        ))}
      </div>
      <p className="text-callout text-ink-2 mt-6">{t("iconsAttribution")}</p>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* 10-design-system: tipografía, radios, sombras, espaciado                   */
/* -------------------------------------------------------------------------- */

function TypeScale({ t }: { t: T }) {
  return (
    <section>
      <SectionLabel>{t("typeScale")}</SectionLabel>
      <div className="grid gap-8 sm:grid-cols-2">
        <div className="text-ink space-y-3">
          <p className="text-display">{t("typeDisplay")}</p>
          <p className="text-amount-xl">{t("typeAmountXl")}</p>
          <p className="text-title1">{t("typeTitle1")}</p>
          <p className="text-title2">{t("typeTitle2")}</p>
          <p className="text-headline">{t("typeHeadline")}</p>
        </div>
        <div className="text-ink space-y-4">
          <p className="text-body">{t("typeBody")}</p>
          <p className="text-callout font-medium">{t("typeCallout")}</p>
          <p className="text-footnote">{t("typeFootnote")}</p>
          <p className="text-caption uppercase">{t("typeCaption")}</p>
          <p className="text-callout text-ink-2 pt-2">{t("tracking")}</p>
        </div>
      </div>
    </section>
  );
}

function RadiusShadowSpacing({ t }: { t: T }) {
  const radii = [
    { label: "12", className: "rounded-control" },
    { label: "16", className: "rounded-row" },
    { label: t("radiusCard"), className: "rounded-card" },
    { label: t("radiusModal"), className: "rounded-modal" },
    { label: t("radiusPill"), className: "rounded-full" },
  ];
  const spacing = [4, 8, 12, 16, 20, 24, 32, 48];
  return (
    <section>
      <SectionLabel>{t("radiusShadowSpacing")}</SectionLabel>
      <div className="flex flex-wrap gap-6">
        {radii.map((r) => (
          <div key={r.className}>
            <div
              className={cn("border-border bg-surface2 h-[42px] w-[62px] border", r.className)}
            />
            <p className="text-callout text-ink-2 mt-2">{r.label}</p>
          </div>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap gap-8">
        {[
          { label: t("shadowCard"), className: "shadow-card" },
          { label: t("shadowPop"), className: "shadow-pop" },
        ].map((s) => (
          <div key={s.className}>
            <div
              className={cn(
                "rounded-row border-card-edge bg-surface h-[50px] w-[100px] border",
                s.className,
              )}
            />
            <p className="text-callout text-ink-2 mt-3">{s.label}</p>
          </div>
        ))}
      </div>
      <div className="mt-8 flex items-end gap-3">
        {spacing.map((n) => (
          <span
            key={n}
            className="bg-ember-fill block rounded-[2px]"
            style={{ width: n, height: n }}
          />
        ))}
      </div>
      <p className="text-callout text-ink-2 mt-3 tabular-nums">{spacing.join(" ")}</p>
    </section>
  );
}

function BaseComponents({ t }: { t: T }) {
  const f = useFormat();
  const [currency, setCurrency] = useState<"COP" | "USD">("COP");
  return (
    <section>
      <SectionLabel>{t("components")}</SectionLabel>
      <div className="flex flex-wrap items-center gap-4">
        <Button icon="plus">{t("primary")}</Button>
        <Button variant="secondary">{t("secondary")}</Button>
        <Button variant="soft">{t("soft")}</Button>
        <SegmentedControl
          label={t("displayCurrency")}
          options={[
            { value: "COP", label: "COP" },
            { value: "USD", label: "USD" },
          ]}
          value={currency}
          onChange={setCurrency}
        />
        <Badge tone="positive" dot>
          {t("onTrack")}
        </Badge>
        <Badge tone="negative">{t("due", { date: f.date(SAMPLE_DUE_DATE) })}</Badge>
        <Badge tone="warning" dot>
          {t("behind")}
        </Badge>
        <Badge tone="neutral">USD</Badge>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* 19 / 20-states: estados de componentes                                     */
/* -------------------------------------------------------------------------- */

function StateRow({
  label,
  children,
  note,
}: {
  label: string;
  children: React.ReactNode;
  note?: string;
}) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-4">
      <span className="text-caption text-ink-2 uppercase">{label}</span>
      <div className="flex flex-wrap items-center gap-3">
        {children}
        {note && <span className="text-callout text-ink-2">{note}</span>}
      </div>
    </div>
  );
}

function ComponentStates({ t }: { t: T }) {
  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-title1 text-ink">{t("statesTitle")}</h2>
        <p className="text-body text-ink-2 mt-1">{t("statesIntro")}</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <ButtonsCard t={t} />
        <InputsCard t={t} />
        <NavRowsChipsCard t={t} />
        <EmptyCard t={t} />
        <LoadingCard t={t} />
        <ToastTooltipCard t={t} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <RateChipCard t={t} />
        <DeleteCard t={t} />
      </div>
      <MoneyCard t={t} />
    </section>
  );
}

function ButtonsCard({ t }: { t: T }) {
  return (
    <Card className="space-y-4">
      <CardTitle>{t("buttons")}</CardTitle>
      <StateRow label={t("state.default")}>
        <Button icon="check">{t("saveTransaction")}</Button>
      </StateRow>
      <StateRow label={t("state.hover")}>
        <Button icon="check" className="bg-ember-press">
          {t("saveTransaction")}
        </Button>
      </StateRow>
      <StateRow label={t("state.pressed")} note={t("pressedNote")}>
        <Button icon="check" className="bg-ember-press scale-[0.97]">
          {t("saveTransaction")}
        </Button>
      </StateRow>
      <StateRow label={t("state.focus")}>
        <Button icon="check" className={FOCUS}>
          {t("saveTransaction")}
        </Button>
      </StateRow>
      <StateRow label={t("state.disabled")}>
        <Button icon="check" disabled>
          {t("saveTransaction")}
        </Button>
      </StateRow>
      <StateRow label={t("state.secondary")}>
        <Button variant="secondary">{t("cancel")}</Button>
      </StateRow>
    </Card>
  );
}

function InputsCard({ t }: { t: T }) {
  const f = useFormat();
  const sample = f.amount(money(125000n, "COP"));
  return (
    <Card className="space-y-4">
      <CardTitle>{t("inputs")}</CardTitle>
      <Field label={t("amount")} defaultValue={sample} inputMode="decimal" />
      <div className="space-y-2">
        <span className="text-callout text-ink-2 block font-semibold">{t("amountFocus")}</span>
        <Input aria-label={t("amountFocus")} defaultValue={sample} className={FOCUS} />
      </div>
      <Field label={t("amountError")} defaultValue="0" error={t("amountErrorMessage")} />
      <Field label={t("amountDisabled")} placeholder={t("locked")} disabled />
    </Card>
  );
}

function NavRowsChipsCard({ t }: { t: T }) {
  const tNav = useTranslations("nav");
  const f = useFormat();
  const [selected, setSelected] = useState(true);
  const amount = f.money(money(-18500n, "COP"));
  return (
    <Card className="space-y-4">
      <CardTitle>{t("navRowsChips")}</CardTitle>
      <StateRow label={t("state.hover")}>
        <span className="rounded-control bg-surface2 text-body text-ink-2 flex h-[42px] w-[210px] items-center gap-3 px-3 font-medium">
          <Icon name="piggy-bank" />
          {tNav("savings")}
        </span>
      </StateRow>
      <StateRow label={t("state.active")}>
        <span className="rounded-control border-card-edge bg-surface text-body text-ember-text shadow-card flex h-[42px] w-[210px] items-center gap-3 border px-3 font-semibold">
          <Icon name="piggy-bank" variant="solid" className="text-ember" />
          {tNav("savings")}
        </span>
      </StateRow>
      <StateRow label={t("state.focus")}>
        <span
          className={cn(
            "rounded-control bg-surface text-body text-ink-2 flex h-[42px] w-[210px] items-center gap-3 px-3 font-medium",
            FOCUS,
          )}
        >
          <Icon name="piggy-bank" />
          {tNav("savings")}
        </span>
      </StateRow>
      <div className="border-divider border-t pt-4" />
      <StateRow label={t("state.hoverRow")}>
        <ListRow className="bg-surface2" trailing={amount}>
          {t("merchant")}
        </ListRow>
      </StateRow>
      <StateRow label={t("state.selected")}>
        <ListRow selected={selected} onClick={() => setSelected((s) => !s)} trailing={amount}>
          {t("merchant")}
        </ListRow>
      </StateRow>
      <StateRow label={t("state.chips")}>
        <ChoiceChip tone="warning" selected={false}>
          {t("foodGroceries")}
        </ChoiceChip>
        <ChoiceChip selected>{t("selectedChip")}</ChoiceChip>
      </StateRow>
    </Card>
  );
}

function EmptyCard({ t }: { t: T }) {
  return (
    <Card className="space-y-4">
      <CardTitle>{t("emptyState")}</CardTitle>
      <EmptyState
        icon="receipt"
        title={t("emptyTitle")}
        description={t("emptyDescription")}
        actions={
          <>
            <Button icon="plus">{t("addTransaction")}</Button>
            <Button variant="secondary">{t("import")}</Button>
          </>
        }
      />
    </Card>
  );
}

function LoadingCard({ t }: { t: T }) {
  return (
    <Card className="space-y-6">
      <CardTitle>{t("loading")}</CardTitle>
      <SkeletonList rows={4} />
      <p className="text-callout text-ink-2">{t("loadingNote")}</p>
    </Card>
  );
}

function ToastTooltipCard({ t }: { t: T }) {
  const toast = useToast();
  const f = useFormat();
  const tooltip = t("tooltipSample", {
    usd: f.money(money(2160n, "USD")),
    rate: f.number(4000),
    date: f.date(SAMPLE_DATE),
  });
  return (
    <Card className="space-y-4">
      <CardTitle>{t("toastTooltip")}</CardTitle>
      <ToastSurface message={t("transactionDeleted")} onUndo={() => undefined} />
      <p className="text-callout text-ink-2">{t("toastNote")}</p>
      <TooltipSurface>{tooltip}</TooltipSurface>
      <div className="border-divider flex flex-wrap items-center gap-3 border-t pt-4">
        <span className="text-caption text-ink-2 uppercase">{t("state.live")}</span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            toast.show({
              message: t("transactionDeleted"),
              onUndo: () => toast.show({ message: t("transactionRestored") }),
            })
          }
        >
          {t("showToast")}
        </Button>
        <Tooltip content={tooltip}>
          <button type="button" className="text-body text-ink font-semibold tabular-nums">
            {f.money(money(86400n, "COP"))}
          </button>
        </Tooltip>
      </div>
    </Card>
  );
}

function RateChipCard({ t }: { t: T }) {
  const f = useFormat();
  const rate = t("rateSample", { cop: f.number(4000) });
  const rows = [
    { state: "fresh", label: t("state.fresh"), asOf: f.date(SAMPLE_DATE), note: t("freshNote") },
    {
      state: "stale",
      label: t("state.stale"),
      asOf: f.date(SAMPLE_STALE_DATE),
      note: t("staleNote", { date: f.date(SAMPLE_STALE_DATE) }),
    },
    {
      state: "updating",
      label: t("state.updating"),
      asOf: f.date(SAMPLE_DATE),
      note: t("updatingNote"),
    },
    { state: "error", label: t("state.error"), asOf: f.date(SAMPLE_DATE), note: t("errorNote") },
  ] as const;
  return (
    <Card className="space-y-4">
      <CardTitle>{t("rateChips")}</CardTitle>
      {rows.map((row) => (
        <StateRow key={row.state} label={row.label}>
          <div className="space-y-2">
            <RateChip state={row.state} rate={rate} asOf={row.asOf} />
            <p className="text-callout text-ink-2">{row.note}</p>
          </div>
        </StateRow>
      ))}
    </Card>
  );
}

function DeleteCard({ t }: { t: T }) {
  const tHold = useTranslations("holdToDelete");
  const toast = useToast();
  const item = t("debtItem");
  const deleted = () =>
    toast.show({
      message: t("debtDeleted"),
      onUndo: () => toast.show({ message: t("debtRestored") }),
    });
  return (
    <Card className="space-y-4">
      <CardTitle>{t("delete")}</CardTitle>
      <StateRow label={t("state.pointer")}>
        <div className="space-y-2">
          <HoldToDeleteButton itemName={item} onConfirm={deleted} demoProgress={0.55} />
          <p className="text-callout text-ink-2">{t("pointerNote")}</p>
        </div>
      </StateRow>
      <StateRow label={t("state.keyboard")}>
        <div className="space-y-2">
          <HoldToDeleteButton
            itemName={item}
            onConfirm={deleted}
            demoProgress={0.4}
            className={FOCUS}
          />
          <p className="text-callout text-ink-2 flex flex-wrap items-center gap-2">
            {t.rich("keyboardKeys", {
              enter: (chunks) => <Keycap>{chunks}</Keycap>,
              space: (chunks) => <Keycap>{chunks}</Keycap>,
            })}
          </p>
          <p className="text-callout text-ink-2">
            {t("keyboardNote", { hint: tHold("hint", { seconds: 2, item }) })}
          </p>
        </div>
      </StateRow>
      <StateRow label={t("state.twoStep")}>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="danger-outline" size="lg" icon="trash">
              {t("deleteDebt")}
            </Button>
            <Icon name="arrow-small-right" className="text-ink-2" />
            <Button variant="danger" size="lg">
              {tHold("confirm")}
            </Button>
          </div>
          <ToastSurface message={t("debtDeleted")} onUndo={() => undefined} />
          <p className="text-callout text-ink-2">{t("twoStepNote")}</p>
        </div>
      </StateRow>
      <StateRow label={t("state.live")}>
        <HoldToDeleteButton itemName={item} onConfirm={deleted} />
        <TwoStepDeleteButton label={t("deleteDebt")} onConfirm={deleted} />
      </StateRow>
      <p className="text-callout text-ink-2">{t("contrastNote")}</p>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Dinero y moneda (fase 5): montos, filtro e insignia                        */
/* -------------------------------------------------------------------------- */

/** Tasa de ejemplo de los frames: 1 USD = 4.000 COP. */
const DEMO_RATE = {
  base: "USD" as const,
  quote: "COP" as const,
  rate: "4000",
  asOf: SAMPLE_DATE,
  fetchedAt: new Date().toISOString(),
  source: "sample",
};

function MoneyCard({ t }: { t: T }) {
  const [status, setStatus] = useState<RateStatus | "stale">("idle");
  const [display, setDisplay] = useState<"COP" | "USD">("COP");
  const [filter, setFilter] = useState<CurrencyFilterValue>("all");
  const rate =
    status === "stale"
      ? { ...DEMO_RATE, asOf: SAMPLE_STALE_DATE, fetchedAt: "2026-10-09T13:00:00Z" }
      : DEMO_RATE;

  return (
    <Card className="space-y-5">
      <CardTitle>{t("money")}</CardTitle>
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl
          label={t("moneyRateState")}
          options={[
            { value: "idle", label: t("state.fresh") },
            { value: "stale", label: t("state.stale") },
            { value: "updating", label: t("state.updating") },
            { value: "error", label: t("state.error") },
          ]}
          value={status}
          onChange={setStatus}
        />
        <SegmentedControl
          label={t("displayCurrency")}
          options={[
            { value: "COP", label: "COP" },
            { value: "USD", label: "USD" },
          ]}
          value={display}
          onChange={setDisplay}
        />
        <CurrencyFilter value={filter} onChange={setFilter} />
      </div>
      {/* key: reinicia el proveedor de demo al cambiar la moneda o la tasa. */}
      <RateProvider
        key={`${display}-${status}`}
        initialRate={rate}
        initialDisplayCurrency={display}
        persist={false}
        forcedStatus={status === "stale" ? "idle" : status}
      >
        <div className="grid gap-6 sm:grid-cols-3">
          <div className="space-y-3">
            <p className="text-caption text-ink-2 uppercase">{t("moneyRow")}</p>
            <div className="flex items-start justify-between gap-3">
              <span className="text-body text-ink font-medium">{t("moneyItemCop")}</span>
              <MoneyAmount
                value={money(89900n, "COP")}
                primaryClassName="text-body font-semibold"
              />
            </div>
            <div className="flex items-start justify-between gap-3">
              <span className="text-body text-ink flex items-center gap-2 font-medium">
                {t("moneyItemUsd")}
                <CurrencyBadge currency="USD" displayCurrency={display} />
              </span>
              <MoneyAmount value={money(1599n, "USD")} primaryClassName="text-body font-semibold" />
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-caption text-ink-2 uppercase">{t("moneyTotal")}</p>
            <MoneyAmount
              kind="total"
              value={display === "COP" ? money(3_360_000n, "COP") : money(84000n, "USD")}
              primaryClassName="text-amount-xl"
            />
          </div>
          <p className="text-callout text-ink-2">{t("moneyNote")}</p>
        </div>
      </RateProvider>
    </Card>
  );
}
