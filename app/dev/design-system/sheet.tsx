"use client";

/**
 * Contenido de /dev/design-system. Reproduce:
 * - 10-design-system.png: tokens, íconos, escala tipográfica, radios,
 *   sombras, espaciado y componentes base.
 * - 19-states.png / 20-states-dark.png: estados de los componentes.
 * Los estados "hover", "pressed" y "focus" se muestran fijos con clases; los
 * componentes reales también se pueden probar en vivo (fila "Live").
 * Todos los textos y cifras son datos de ejemplo.
 */
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge, ChoiceChip } from "@/components/ui/chip";
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
import { cn } from "@/lib/utils";

/** Anillo de foco fijo, para mostrar el estado "focus" sin enfocar. */
const FOCUS = "outline-2 outline-offset-2 outline-focus-ring outline-solid";

export function DesignSystemSheet({ theme }: { theme: "light" | "dark" }) {
  return (
    <>
      {/* Como 10-design-system.png: hoja sobre superficie (blanca en claro). */}
      <div className="bg-surface">
        <div className="mx-auto max-w-[1440px] space-y-16 px-6 py-12 lg:px-12">
          <header>
            <h1 className="text-display text-ink">Ember Cash design system</h1>
            <p className="text-body text-ink-2 mt-2">
              Tokens (Light / Dark), type, components and icons. Showing the {theme} theme. All
              figures are sample data.
            </p>
          </header>

          <div className="grid gap-12 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.75fr)]">
            <ColorTokens />
            <Icons />
          </div>

          <div className="grid gap-12 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
            <TypeScale />
            <RadiusShadowSpacing />
          </div>

          <BaseComponents />
        </div>
      </div>

      {/* Como 19-states.png / 20-states-dark.png: tarjetas sobre canvas. */}
      <div className="mx-auto max-w-[1440px] px-6 py-12 lg:px-12">
        <ComponentStates />
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* 10-design-system: tokens                                                   */
/* -------------------------------------------------------------------------- */

const SWATCHES: { label: string; token: string }[] = [
  { label: "canvas", token: "canvas" },
  { label: "surface", token: "surface" },
  { label: "surface2", token: "surface2" },
  { label: "border", token: "border" },
  { label: "text", token: "text" },
  { label: "text2", token: "text2" },
  { label: "text3", token: "text3" },
  { label: "ember-fill", token: "ember-fill" },
  { label: "ember (graphic)", token: "ember" },
  { label: "ember-text", token: "ember-text" },
  { label: "hero start", token: "hero-start" },
  { label: "hero end", token: "hero-end" },
  { label: "ember50", token: "ember-50" },
  { label: "positive-text", token: "positive-text" },
  { label: "positive-graphic", token: "positive" },
  { label: "negative-text", token: "negative-text" },
  { label: "negative-graphic", token: "negative" },
  { label: "info-text", token: "info-text" },
  { label: "violet-text", token: "violet-text" },
  { label: "amber-text", token: "amber-text" },
  { label: "pink-text", token: "pink-text" },
  { label: "teal (Housing)", token: "teal" },
  { label: "olive (Health)", token: "olive" },
  { label: "slate (Other)", token: "slate" },
  { label: "income-bar", token: "income-bar" },
  { label: "expense-bar", token: "expense-bar" },
  { label: "member Isaac", token: "member-a" },
  { label: "member Sofia", token: "member-b" },
  { label: "track", token: "track" },
  { label: "focus ring", token: "focus-ring" },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="text-caption text-ink-2 mb-5 uppercase">{children}</h2>;
}

function ColorTokens() {
  return (
    <section>
      <SectionLabel>Color tokens (light swatch front, dark behind)</SectionLabel>
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4 lg:grid-cols-6">
        {SWATCHES.map((s) => (
          <Swatch key={s.token} {...s} />
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

function IconTile({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <span
      title={title}
      className="rounded-control bg-surface2 text-ink grid size-[42px] place-items-center"
    >
      {children}
    </span>
  );
}

function Icons() {
  return (
    <section>
      <SectionLabel>Icons (Uicons by Flaticon: regular rounded, solid rounded)</SectionLabel>
      <div className="flex flex-wrap gap-3">
        {SHEET_ORDER.map((name) => (
          <IconTile key={name} title={name}>
            <Icon name={name} />
          </IconTile>
        ))}
        <IconTile title="flame (solid)">
          <Icon name="flame" variant="solid" className="text-ember" />
        </IconTile>
        {EXTRA_ICONS.map((name) => (
          <IconTile key={name} title={name}>
            <Icon name={name} />
          </IconTile>
        ))}
      </div>
      <p className="text-callout text-ink-2 mt-6">
        Icons designed by Flaticon (Uicons) from flaticon.com. Free licence requires visible
        attribution.
      </p>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* 10-design-system: tipografía, radios, sombras, espaciado                   */
/* -------------------------------------------------------------------------- */

function TypeScale() {
  return (
    <section>
      <SectionLabel>Type scale (Inter, min 12 px)</SectionLabel>
      <div className="grid gap-8 sm:grid-cols-2">
        <div className="text-ink space-y-3">
          <p className="text-display">Display 40 / Bold</p>
          <p className="text-amount-xl">Amount XL 32 / Bold</p>
          <p className="text-title1">Title 1 26 / Bold</p>
          <p className="text-title2">Title 2 22 / Bold</p>
          <p className="text-headline">Headline 16 / Semibold</p>
        </div>
        <div className="text-ink space-y-4">
          <p className="text-body">Body 14 / Regular, Medium</p>
          <p className="text-callout font-medium">Callout 13 / Medium, Semibold</p>
          <p className="text-footnote">Footnote 12 / Regular, Medium</p>
          <p className="text-caption uppercase">Caption 12 / Semibold</p>
          <p className="text-callout text-ink-2 pt-2">
            Tracking by size: 40: -2.2%, 32/26: -1.8%, 22: -1.1%, 16: -0.4%, 13-14: -0.1%, 12: 0
            (caption +6%).
          </p>
        </div>
      </div>
    </section>
  );
}

function RadiusShadowSpacing() {
  const radii = [
    { label: "12", className: "rounded-control" },
    { label: "16", className: "rounded-row" },
    { label: "20 card", className: "rounded-card" },
    { label: "28 modal", className: "rounded-modal" },
    { label: "pill", className: "rounded-full" },
  ];
  const spacing = [4, 8, 12, 16, 20, 24, 32, 48];
  return (
    <section>
      <SectionLabel>Radius / shadow / spacing</SectionLabel>
      <div className="flex flex-wrap gap-6">
        {radii.map((r) => (
          <div key={r.label}>
            <div
              className={cn("border-border bg-surface2 h-[42px] w-[62px] border", r.className)}
            />
            <p className="text-callout text-ink-2 mt-2">{r.label}</p>
          </div>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap gap-8">
        {[
          { label: "shadow card", className: "shadow-card" },
          { label: "shadow pop", className: "shadow-pop" },
        ].map((s) => (
          <div key={s.label}>
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
      <p className="text-callout text-ink-2 mt-3">{spacing.join(" ")}</p>
    </section>
  );
}

function BaseComponents() {
  const [currency, setCurrency] = useState<"COP" | "USD">("COP");
  return (
    <section>
      <SectionLabel>Components</SectionLabel>
      <div className="flex flex-wrap items-center gap-4">
        <Button icon="plus">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="soft">Soft</Button>
        <SegmentedControl
          label="Display currency"
          options={[
            { value: "COP", label: "COP" },
            { value: "USD", label: "USD" },
          ]}
          value={currency}
          onChange={setCurrency}
        />
        <Badge tone="positive" dot>
          On track
        </Badge>
        <Badge tone="negative">Due Oct 22</Badge>
        <Badge tone="warning" dot>
          Behind
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

function ComponentStates() {
  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-title1 text-ink">Component states</h2>
        <p className="text-body text-ink-2 mt-1">
          Focus ring: 2 px #BD490A (dark #FF9552), offset 2 px. Pressed: scale 0.97. Sample data
          only.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <ButtonsCard />
        <InputsCard />
        <NavRowsChipsCard />
        <EmptyCard />
        <LoadingCard />
        <ToastTooltipCard />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <RateChipCard />
        <DeleteCard />
      </div>
    </section>
  );
}

function ButtonsCard() {
  return (
    <Card className="space-y-4">
      <CardTitle>Buttons</CardTitle>
      <StateRow label="Default">
        <Button icon="check">Save transaction</Button>
      </StateRow>
      <StateRow label="Hover">
        <Button icon="check" className="bg-ember-press">
          Save transaction
        </Button>
      </StateRow>
      <StateRow label="Pressed" note="scale 0.97, 100 ms">
        <Button icon="check" className="bg-ember-press scale-[0.97]">
          Save transaction
        </Button>
      </StateRow>
      <StateRow label="Focus">
        <Button icon="check" className={FOCUS}>
          Save transaction
        </Button>
      </StateRow>
      <StateRow label="Disabled">
        <Button icon="check" disabled>
          Save transaction
        </Button>
      </StateRow>
      <StateRow label="Secondary">
        <Button variant="secondary">Cancel</Button>
      </StateRow>
    </Card>
  );
}

function InputsCard() {
  return (
    <Card className="space-y-4">
      <CardTitle>Inputs</CardTitle>
      <Field label="Amount" defaultValue="125,000" inputMode="decimal" />
      <div className="space-y-2">
        <span className="text-callout text-ink-2 block font-semibold">Amount (focus)</span>
        <Input aria-label="Amount (focus)" defaultValue="125,000" className={FOCUS} />
      </div>
      <Field label="Amount (error)" defaultValue="0" error="Enter an amount greater than 0" />
      <Field label="Amount (disabled)" placeholder="Locked while syncing" disabled />
    </Card>
  );
}

function NavRowsChipsCard() {
  const [selected, setSelected] = useState(true);
  return (
    <Card className="space-y-4">
      <CardTitle>Navigation, rows, chips</CardTitle>
      <StateRow label="Hover">
        <span className="rounded-control bg-surface2 text-body text-ink-2 flex h-[42px] w-[210px] items-center gap-3 px-3 font-medium">
          <Icon name="piggy-bank" />
          Savings
        </span>
      </StateRow>
      <StateRow label="Active">
        <span className="rounded-control border-card-edge bg-surface text-body text-ink shadow-card flex h-[42px] w-[210px] items-center gap-3 border px-3 font-semibold">
          <Icon name="piggy-bank" variant="solid" className="text-ember" />
          Savings
        </span>
      </StateRow>
      <StateRow label="Focus">
        <span
          className={cn(
            "rounded-control bg-surface text-body text-ink-2 flex h-[42px] w-[210px] items-center gap-3 px-3 font-medium",
            FOCUS,
          )}
        >
          <Icon name="piggy-bank" />
          Savings
        </span>
      </StateRow>
      <div className="border-divider border-t pt-4" />
      <StateRow label="Hover row">
        <ListRow className="bg-surface2" trailing="-18,500 COP">
          Coffee Corner
        </ListRow>
      </StateRow>
      <StateRow label="Selected">
        <ListRow selected={selected} onClick={() => setSelected((s) => !s)} trailing="-18,500 COP">
          Coffee Corner
        </ListRow>
      </StateRow>
      <StateRow label="Chips">
        <ChoiceChip tone="warning" selected={false}>
          Food &amp; groceries
        </ChoiceChip>
        <ChoiceChip selected>Selected</ChoiceChip>
      </StateRow>
    </Card>
  );
}

function EmptyCard() {
  return (
    <Card className="space-y-4">
      <CardTitle>Empty state</CardTitle>
      <EmptyState
        icon="receipt"
        title="No transactions yet"
        description="Add your first transaction or import a bank file to see your month take shape."
        actions={
          <>
            <Button icon="plus">Add transaction</Button>
            <Button variant="secondary">Import</Button>
          </>
        }
      />
    </Card>
  );
}

function LoadingCard() {
  return (
    <Card className="space-y-6">
      <CardTitle>Loading (skeleton)</CardTitle>
      <SkeletonList rows={4} />
      <p className="text-callout text-ink-2">
        Skeleton matches final row geometry; shimmer is static under reduced motion.
      </p>
    </Card>
  );
}

function ToastTooltipCard() {
  const toast = useToast();
  return (
    <Card className="space-y-4">
      <CardTitle>Toast and tooltip</CardTitle>
      <ToastSurface message="Transaction deleted" onUndo={() => undefined} />
      <p className="text-callout text-ink-2">
        Toast replaces a confirmation dialog; stays 6 s, Undo restores the item.
      </p>
      <TooltipSurface>≈ US$ 21.60 · rate 4,000, as of Oct 16 (sample)</TooltipSurface>
      <div className="border-divider flex flex-wrap items-center gap-3 border-t pt-4">
        <span className="text-caption text-ink-2 uppercase">Live</span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            toast.show({
              message: "Transaction deleted",
              onUndo: () => toast.show({ message: "Transaction restored" }),
            })
          }
        >
          Show toast
        </Button>
        <Tooltip content="≈ US$ 21.60 · rate 4,000, as of Oct 16 (sample)">
          <button type="button" className="text-body text-ink font-semibold tabular-nums">
            86,400 COP
          </button>
        </Tooltip>
      </div>
    </Card>
  );
}

function RateChipCard() {
  return (
    <Card className="space-y-4">
      <CardTitle>Exchange-rate chip states</CardTitle>
      <StateRow label="Fresh">
        <div className="space-y-2">
          <RateChip state="fresh" rate="1 USD = 4,000 COP" asOf="Oct 16" sample />
          <p className="text-callout text-ink-2">
            Fetched today. Converted amounts show with the chip&apos;s date.
          </p>
        </div>
      </StateRow>
      <StateRow label="Stale">
        <div className="space-y-2">
          <RateChip state="stale" rate="1 USD = 4,000 COP" asOf="Oct 9" />
          <p className="text-callout text-ink-2">
            Older than 24 h: amber chip with the old date. Converted amounts stay, tooltip says
            &apos;rate from Oct 9&apos;. Click refreshes.
          </p>
        </div>
      </StateRow>
      <StateRow label="Updating">
        <div className="space-y-2">
          <RateChip state="updating" rate="1 USD = 4,000 COP" asOf="Oct 16" />
          <p className="text-callout text-ink-2">
            Chip keeps its width. Numbers do not move; converted lines dim to 60% until done.
          </p>
        </div>
      </StateRow>
      <StateRow label="Error">
        <div className="space-y-2">
          <RateChip state="error" rate="1 USD = 4,000 COP" asOf="Oct 16" />
          <p className="text-callout text-ink-2">
            Rate not available: originals stay primary, each converted line reads &apos;rate
            unavailable&apos; instead of a stale number.
          </p>
        </div>
      </StateRow>
    </Card>
  );
}

function DeleteCard() {
  const toast = useToast();
  const deleted = () =>
    toast.show({ message: "Debt deleted", onUndo: () => toast.show({ message: "Debt restored" }) });
  return (
    <Card className="space-y-4">
      <CardTitle>Irreversible delete: pointer, keyboard, two-step</CardTitle>
      <StateRow label="Pointer">
        <div className="space-y-2">
          <HoldToDeleteButton itemName="debt" onConfirm={deleted} demoProgress={0.55} />
          <p className="text-callout text-ink-2">
            Press and hold 2 s, fill sweeps left to right. Release cancels.
          </p>
        </div>
      </StateRow>
      <StateRow label="Keyboard">
        <div className="space-y-2">
          <HoldToDeleteButton
            itemName="debt"
            onConfirm={deleted}
            demoProgress={0.4}
            className={FOCUS}
          />
          <p className="text-callout text-ink-2 flex items-center gap-2">
            <Keycap>Enter</Keycap> or <Keycap>Space</Keycap> held 2 s
          </p>
          <p className="text-callout text-ink-2">
            Same fill and focus ring. Releasing the key or Esc cancels. Screen reader: &apos;Hold
            Enter for 2 seconds to delete debt&apos;.
          </p>
        </div>
      </StateRow>
      <StateRow label="Two-step">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="danger-outline" size="lg" icon="trash">
              Delete debt
            </Button>
            <Icon name="arrow-small-right" className="text-ink-2" />
            <Button variant="danger" size="lg">
              Press again to confirm
            </Button>
          </div>
          <ToastSurface message="Debt deleted" onUndo={() => undefined} />
          <p className="text-callout text-ink-2">
            Second press within 4 s, then a toast with Undo (6 s) before the delete is final.
          </p>
        </div>
      </StateRow>
      <StateRow label="Live">
        <HoldToDeleteButton itemName="debt" onConfirm={deleted} />
        <TwoStepDeleteButton label="Delete debt" onConfirm={deleted} />
      </StateRow>
      <p className="text-callout text-ink-2">
        Label contrast: ink on the red fill is 10.45 (light) / 9.69 (dark); red text on the fill was
        3.29 / 3.64 and was replaced.
      </p>
    </Card>
  );
}
