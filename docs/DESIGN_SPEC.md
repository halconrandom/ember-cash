# Ember Cash: design spec v3 (web app first, iOS later)

Applies the UX review in `IVERN_FIXES.md` (contrast, charts, semantic colour, currency rules, motion). Round 2 (second review) is applied on top. Backups: `v1/` (original) and `v2/` (first review round).
All names and amounts are **sample data**. Example rate: **1 USD = 4,000 COP** (sample, not live), labelled SAMPLE in the top bar and sidebar.
Design language follows the apple-design skill (emilkowalski/skills): instant press feedback, critically damped springs by default, interruptible motion, translucent materials only on floating layers, size-specific tracking, reduced motion / transparency / contrast honoured.

## 0. Files

| File                                  | Content                                                                                                                                                                                        |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `01`-`08` `*.png`                     | Light screens: dashboard (COP), transactions (COP), savings (COP), debts (COP), subscriptions (COP), calendar (USD), add-transaction modal (COP), household (COP)                              |
| `09-dashboard-dark.png`               | Dark dashboard (USD)                                                                                                                                                                           |
| `12`-`18` `*-dark.png`                | Dark versions of 02-08 (shown in the other currency: USD, except calendar in COP). No separate 11: 09 is the dark dashboard                                                                    |
| `10-design-system.png`                | Tokens (light / dark swatches), type scale, radius, shadow, spacing, components, icons and attribution                                                                                         |
| `19-states.png`, `20-states-dark.png` | Focus, hover, pressed, disabled, error, empty, loading, toast with Undo, tooltip, exchange-rate chip states (fresh, stale, updating, error), irreversible delete (pointer, keyboard, two-step) |
| `ember-cash.figcraft`                 | Editable file, all 19 frames, variable collection "Ember tokens" (modes Light / Dark)                                                                                                          |
| `build_all.py` + modules              | Rebuild: `python3 build_all.py --final`                                                                                                                                                        |

Screens are 1440x900 frames exported at 2x (2880x1800). The states sheets (19, 20) are 1440x1360 (2880x2720).

## 1. Colour tokens

Two kinds of orange: **ember-fill** for anything that carries white text; **ember (graphic)** only for non-text graphics (chart bars, rings, progress, icons larger than text). Every text token reaches 4.5:1 on its own background; graphics reach 3:1 (WCAG 1.4.11).

### Light

| Token                       | Hex                         | Contrast / use                                                                                                          |
| --------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| canvas                      | #F5F5F7                     | page background                                                                                                         |
| surface                     | #FFFFFF                     | cards                                                                                                                   |
| surface2 / border / divider | #F5F5F7 / #E8E8ED / #F0F0F4 | nested rows, outlines, separators                                                                                       |
| text                        | #1D1D1F                     | primary text                                                                                                            |
| text2                       | #56565C                     | 7.29 on surface. Secondary text                                                                                         |
| text3                       | #6D6D71                     | 5.15 on surface, 4.73 on canvas. Captions, helper text (never lighter)                                                  |
| ember-fill                  | #C6500B                     | white on it 4.61. Primary button, active controls, selected chip                                                        |
| ember-press                 | #AF470A                     | pressed button                                                                                                          |
| hero gradient               | #C84F00 to #B24509          | hero card, white text 4.59 to 5.60. **All hero text is solid white (100%)**: no 90% or alpha white, which measured 4.01 |
| ember-text                  | #BD490A                     | 5.10 on surface, 4.68 on canvas. Links, focus ring, active nav label, selected icon                                     |
| ember (graphic)             | #F26B1D                     | 3.05 on surface. Expense bars, rings, progress only. Never text, never behind white text                                |
| ember50 / 100 / 200         | #FFF3EB / #FFE4D2 / #FFCBA8 | tints for brand surfaces                                                                                                |

Status and category pairs (text token on its tint, graphic token for dots, bars and icons):

| Role                        | Text    | Graphic | Tint    | Text ratio |
| --------------------------- | ------- | ------- | ------- | ---------- |
| Positive / Income           | #177B52 | #1EA26C | #E6F6EE | 4.71       |
| Negative / Due              | #C03C41 | #E5484D | #FDECEC | 4.64       |
| Info / Transport            | #3069C7 | #3B82F6 | #E8F0FE | 4.62       |
| Subscriptions / Recurring   | #784FD4 | #8B5CF6 | #F0EAFE | 4.63       |
| Warning / Food & groceries  | #936316 | #C2821C | #FEF3DC | 4.72       |
| Leisure                     | #B23F68 | #EC5A8F | #FFF4F8 | 5.14       |
| Housing                     | #0B7468 | #0F9E8E | #E3F5F2 | 5.01       |
| Health                      | #566F14 | #6F8F1E | #EEF3DD | 5.03       |
| Other / USD badge / neutral | #475569 | #64748B | #EEF1F6 | 6.69       |

Charts: income bars **#177B52** (5.26 on surface), expense bars **#F26B1D** (3.05, graphic), track **#EBEBF0**. Both bar series carry direct labels (value on the latest month) and a legend, so colour is never the only cue.
Members: Isaac **ink #1D1D1F**, Sofia **slate #5F6B85** (avatar, progress bar, payer dot). Orange is not a member colour.

### Dark (on surface #171719, canvas #0B0B0D)

| Token                               | Hex                                                                                                                                                | Ratio on surface                                                                       |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| surface2 / border / divider         | #212125 / #2A2A30 / #242429                                                                                                                        |                                                                                        |
| text / text2 / text3                | #F5F5F7 / #A1A1A8 / #8A8A90                                                                                                                        | 6.97 / 5.22                                                                            |
| ember-fill, hero gradient           | unchanged (#C6500B, #C84F00 to #B24509)                                                                                                            | white text stays 4.61+. The dark hero is deep orange, not light orange with white text |
| ember-text (links, focus, selected) | #FF9552                                                                                                                                            | 8.25                                                                                   |
| ember (graphic)                     | #FF7A2E                                                                                                                                            | 6.88                                                                                   |
| positive / negative / info / violet | #3DD68C / #FF6369 / #5B9BFF / #A78BFA                                                                                                              | 9.54 / 6.17 / 6.46 / 6.58                                                              |
| amber / pink / teal / olive / slate | #FFB224 / #FF7AA8 / #2DD4BF / #A3C94A / #A8B3C7                                                                                                    | 9.93 / 7.33 / 9.62 / 9.39 / 8.47                                                       |
| income bar / expense bar            | #A6EBCB / #FF7A2E                                                                                                                                  | 13.1 / 6.88                                                                            |
| progress / ring track               | **#3B3B40**                                                                                                                                        | 1.61 (track is a quiet guide, the filled part carries the data)                        |
| members Isaac / Sofia               | #E8E8ED / #A7B1CC                                                                                                                                  |                                                                                        |
| tints                               | green #12271E, red #2D1618, blue #15223C, violet #231C3D, amber #2E230E, pink #2E1620, teal #0F2B28, olive #1F2610, slate #23262D, ember50 #2B1A10 |                                                                                        |

Hero decoration rule: a decorative circle over the hero lightens the gradient (white text drops to 4.08 under one 8% layer, 3.74 under two). It is therefore a single circle placed in the bottom-right corner, away from every text and chip; never put decoration behind text.

### Orange as data color (explicit rule)

Orange is brand and action first. The graphic orange `#F26B1D` (dark `#FF7A2E`) may encode data only in these two cases:

1. **Progress toward the user's own target**: goal rings and bars (Savings, dashboard goals, shared goal) and debt payoff progress. One meaning: "how far along". Payoff bars use ember-fill `#C6500B`.
   - **Exception (v0.8.2), debt "paid off" bar in dark mode:** it uses the graphic orange `#FF7A2E` (same as the dark goal rings) instead of ember-fill. Reason: `#C6500B` on the dark progress track `#3B3B40` measured 2.41:1, below the 3:1 of WCAG 1.4.11; `#FF7A2E` measures 4.28:1 on the track and 6.17:1 on surface2. Light mode keeps ember-fill (3.88:1 on track `#EBEBF0`). In code: token `--debt-bar`.
2. **Expenses in the income/expense pair** (6-month trend), always paired with green income, with a legend and a direct value label.
   Never use orange for: categories (spending bars use the category colors), members, statuses, budget states, or any series that must be told apart from another orange series. One chart never carries two orange meanings, and an orange data mark never sits inside the same component as the primary button. Data orange must have a visible value or label next to it (colour is not the only cue) and reach 3:1 on its surface (3.05 light, 6.88 dark). Text is never `#F26B1D`: use ember-text. If a future theme needs orange for something else, switch progress to ink first.

### Semantic rules

- Ember means brand and action only: primary button, active nav, selected state, focus, hero. It never encodes a category, member or status.
- **One orange (ember-fill) button per screen.** Household has "Add shared expense" as the single primary; "Invite member" and "Settle up" are secondary.
- Budget bars have states: neutral (under 80%, grey #6D6D71), amber from 80%, red from 100% ("103% used, over budget"). The state is also written in text.
- The USD badge is neutral slate; blue is reserved for Transport.
- Dashboard cards use arrow direction for change and colour for good or bad: income up is green, expenses down is green (down arrow, green), so arrow and colour no longer contradict. The balance chip reads "+18.4% vs Sep".

## 2. Typography (Inter, fallback `-apple-system, "SF Pro Text", Inter, system-ui`)

Minimum text size is **12 px** everywhere (10 and 11 px labels were raised). Amounts use tabular figures (`tnum`). Tracking is size-specific.

| Style     | Size / weight           | Tracking | Use                           |
| --------- | ----------------------- | -------- | ----------------------------- |
| Display   | 40 / Bold               | -2.2%    | sample and large numbers      |
| Amount XL | 32 / Bold               | -1.8%    | dashboard stat amounts        |
| Title 1   | 26 / Bold               | -1.8%    | page title                    |
| Title 2   | 22 / Bold               | -1.1%    | modal title, calendar month   |
| Amount L  | 20-24 / Bold            | -1.1%    | card amounts                  |
| Headline  | 16 / Semibold           | -0.4%    | card titles                   |
| Body      | 14 / Regular, Medium    | -0.1%    | rows, names                   |
| Callout   | 13 / Medium, Semibold   | -0.1%    | controls, secondary rows      |
| Footnote  | 12 / Regular, Medium    | 0        | helper text, original amounts |
| Caption   | 12 / Semibold UPPERCASE | +6%      | table headers, metric labels  |

The design-system sheet (10) shows exactly this scale. Because text2 and text3 are now close in light mode, hierarchy also comes from size and weight, not grey alone. Line height: 110% large numbers, 140% wrapped text. Use `rem` in code.

## 3. Spacing, radius, shadow

- Spacing: 4, 8, 12, 16, 20, 24, 32, 48. Card padding 20-24, grid gap 24 (16 dense), page padding 32.
- Layout 1440x900: sidebar 248, top bar 72, content 1128 wide from x=280, y=88.
- Radius: 12 controls, 16 inner rows, 20 cards, 28 modal, pill for chips and buttons.
- Shadows (light only; dark uses a 1px border): card `0 1px 2px rgba(29,29,31,.04), 0 8px 24px rgba(29,29,31,.04)`; glow (primary button) `0 10px 24px rgba(198,80,11,.25)`; pop (modal) `0 24px 64px rgba(0,0,0,.15), 0 2px 6px rgba(0,0,0,.10)`.
- Materials: modal scrim `rgba(0,0,0,.32)` light / `.50` dark; blur only on floating layers, solid fallback under `prefers-reduced-transparency`.

## 4. Currency rules (phase E2, 3 currencies — supersedes the old 2-currency rule; Ivern's rule, IVERN_FIXES §4)

1. **displayCurrency** is the user's own preference — COP, USD or **EUR** — set with the currency toggle and persisted to `profiles.display_currency`. Default: whichever currency used to act as primary (COP).
2. **Secondary line**: only when the amount's original currency differs from displayCurrency, and at most one per amount. If they match, nothing — no line, no `≈`.
3. The equivalent is computed **at display time** with the `exchange_rates` rate of the movement's date (never stored on the row). Missing rate for that pair: `Rate unavailable` in text3 — never 0, never an invented number.
4. A **neutral (slate) badge** with the original currency's code sits next to the secondary line when it differs from displayCurrency. No flags, no emoji.
5. Formats: COP with no decimals and a small `COP` suffix; USD with a `US$` prefix and 2 decimals; EUR with a `€` prefix and 2 decimals (force `€` if a formatter would otherwise print the code `EUR`). Amounts are always `tabular-nums`.
6. **List rows** (`<MoneyAmount variant="row">`): the primary figure is in displayCurrency; below, small, `original € 12.50` only if it differs — never `≈` on a row.
7. **Totals** (`<MoneyAmount variant="total">`, hero, dashboard sums, stat cards): the total is already in displayCurrency, with no secondary conversion line. A small `Converted with today's rates` text, when the sum mixed currencies, opens a sheet with the breakdown by origin currency on tap.
8. **Savings goals**: always shown in the goal's own currency (`€ 640 of € 1,200`); the ring and the percent are computed in that same currency. If it differs from displayCurrency, one line `≈ … saved` (the saved amount only, never the target).
9. **Add-transaction modal**: a 3-way segmented control (COP/USD/EUR). Default: the last currency used for that transaction type, or displayCurrency if none yet. The `≈ X` line recalculates on every keystroke — no debounce, no animation. If the amount's currency equals displayCurrency, a neutral line reads `Shown in COP, your currency.` With an empty field, show the bare rate (`1 EUR = … COP · as of Oct 16`) in text3 — never `≈ 0`. The row keeps a fixed `min-height` so the sheet never jumps as the iPhone keyboard opens or closes. Changing the currency with an amount already typed **never converts the number** — it only changes the unit, announced via `aria-live="polite"`.
10. **Exchange-rate chip**: shows the rate(s) *toward* displayCurrency (up to two, one per other currency), each as `1 {base} = {value} {quote}`, with their date, in one line if it fits; on narrow screens, compressed to `N rates · as of Oct 16`. Tapping it opens the detail. States (sheet 19/20) are unchanged:
    - Fresh: neutral chip with date.
    - Stale (older than 24 h, the oldest of the relevant rates): amber chip, clock icon, old date in amber text and a "Stale" badge; converted amounts stay with a tooltip "rate from Oct 9"; click refreshes.
    - Updating: "Updating rate..." with refresh icon, same width, converted lines dim to 60%, numbers do not move.
    - Error: red chip "Rate unavailable" with a Retry action; originals stay primary. The last known rate stays in the tooltip.
11. **Accessibility & mobile**: the secondary line is 12–13 px in text2/text3 (≥ 4.5∶1); the `≈` glyph carries `aria-label="approximately"` (`"aproximadamente"` in Spanish) for screen readers; the amount input uses `inputmode="decimal"` for USD/EUR and `"numeric"` for COP, at 16 px (no iOS zoom); switching displayCurrency never ticks the numbers — a 150 ms cross-fade, or nothing under `prefers-reduced-motion`.
12. Never truncate amounts or dates. Test 0, 1, 1,000+ rows, negatives and 12-digit amounts. **Both figures of a pair carry their symbol**: `original US$ 640 of US$ 1,200`. COP figures in a COP-only line may share the unit at the end (`1,700,000 of 4,900,000`).
13. Debts timeline axis shows the **year on every label** (`Oct 2026`, `Oct 2027`, `Oct 2028`, with unlabeled grid lines every 6 months), so "Oct 26" can never read as day 26. End-of-bar labels also carry month and year (`Jun 2027`).
14. Month selector appears where data is monthly (Dashboard, Transactions, Calendar, Household). It is hidden in Savings, Debts and Subscriptions.

All currency pickers — accounts, goals, debts, recurring items, budgets and partial settlements — now offer the same 3-way COP/USD/EUR segmented control (phase E2.1). The Transactions screen's original-currency filter chip is 3-way too (phase E3). The dashboard's totals (balance, income, expenses, trend, by category) are converted to displayCurrency in the database with the exchange rate of each movement's own date (phase E3) — not the latest rate, unlike the rest of the app's totals.

## 5. Components

Shell: sidebar (brand, 7 nav items, sample-data note, profile), top bar (title and subtitle, rate chip with SAMPLE badge, month selector, COP/USD toggle, one primary action).
Primitives: button (primary / secondary / soft), segmented control, pill and badge, search, select chip, avatar, icon tile, progress bar, progress ring, **ordered horizontal bars** (replace the donut: sorted largest first, category icon, bar, value, percent), grouped bar chart with direct labels, Gantt-style timeline, dashed add card.
Composite: stat card (hero variant), money amount (`amt2`), transaction row with date groups, goal card, debt row, payoff timeline, subscription card, week strip and upcoming list, month calendar (event chips, **"+N more"**, today and selected cell together), selected-day panel, member card, settle-up, shared expense row, **budget bar with states**, modal.
Modal: Repeat defaults to **Never**; currency shown once (rule 8).
Component states sheet (19, 20): buttons (default, hover, pressed, focus, disabled), inputs (default, focus, error with message, disabled), nav and row states, chips, empty state with action, loading skeleton, toast with **Undo**, tooltip, exchange-rate chip states, irreversible-delete patterns.

**Irreversible delete (debts)** has three equivalent paths so it is not pointer-only:

- Pointer: press and hold 2 s; the fill sweeps left to right; release cancels.
- Keyboard: focus the button (2 px focus ring stays visible), hold **Enter** or **Space** for 2 s; same fill; releasing the key or Esc cancels. Announce with `aria-live`: "Hold Enter for 2 seconds to delete debt".
- Two-step (also the fallback for switch and voice control): first press changes the button to "Press again to confirm" (solid #B3363B, white label 5.99:1); a second press within 4 s deletes and shows a toast with Undo (6 s) before the delete is final.
  Contrast of the hold button: the label and trash icon use the text colour. Red text on the progress fill measured 3.29 (light) and 3.64 (dark) and was rejected. Ink on the unfilled red tint is 14.73 / 15.56 and on the filled part (red graphic at 28% over the tint, the worst case, which is also the overlay boundary) 10.45 / 9.69. Red is kept as the 1.5 px border (3:1 graphic) only.
  Focus ring: 2 px `ember-text` (#BD490A light, #FF9552 dark), offset 2.

## 6. Icons

**Source:** Flaticon **Uicons** (regular-rounded for UI, solid-rounded for active nav/logo), npm package `@flaticon/flaticon-uicons` v3.3.1. In the mockups the glyph outlines were extracted from the package's webfont files into vector paths (the CDN SVG URLs return 403). For production use the npm package (icon font / SVG) as is; do not redraw.
**Licence (verified on flaticon.com license certificate and the package LICENSE):** free use, including commercial, with attribution; premium removes the requirement. For web, place a visible link "designed by Flaticon from Flaticon" (use the author name Flaticon shows for the icon) near the icons or in a credits / About footer (e.g. Settings > About). Icons may not be resold or redistributed as downloadable assets, so keep the .figcraft file private, not in a public repo. Premium Flaticon plan avoids the attribution.
**Fallback:** Lucide (`lucide-react`, ISC licence, no attribution needed): home->`house`, receipt->`receipt`, piggy-bank->`piggy-bank`, credit-card->`credit-card`, refresh->`refresh-cw`, calendar->`calendar`, users->`users`, wallet->`wallet`, bank->`landmark`, exchange->`arrow-left-right`, sparkles->`sparkles`.

Used in mockups (Uicons names): angle-small-down/left/right, apps, arrow-small-down/right/up, arrows-repeat, bank, bell, calendar, calendar-clock, car-side, chart-line-up, check, clock, cloud, credit-card, cross-small, dumbbell-horizontal, exchange, file-invoice-dollar, flag, graduation-cap, heart, home, info, laptop, layers, menu-dots, mobile, motorcycle, music, newspaper, palette, piggy-bank, plane, play, plus, receipt, refresh, sack-dollar, search, settings, shopping-cart, sparkles, target, ticket, umbrella-beach, user, user-add, users, wallet, wifi; solid: apps, calendar, car-side, credit-card, flame (logo), heart, home, menu-dots, piggy-bank, receipt, refresh, shopping-cart, ticket, users.

## 7. Animation spec (React / Next.js + Tailwind + motion)

Stack: Next.js App Router, Tailwind, `motion` (motion/react), shadcn registry. Components checked on magicui.design and animate-ui.com on 2026-10-16. Install Magic UI with `pnpm dlx shadcn@latest add @magicui/<name>`; Animate UI through its shadcn registry.

Principle: motion follows frequency of use. Things people do dozens of times a day get none or almost none.

### Removed (per review)

- Number Ticker on every currency or month change. Ticker runs **only on the first dashboard load**; later changes swap the number instantly (cross-fade at most 120 ms).
- Staggered entrance on every visit. Entrances run on first load only; revisiting a screen renders immediately.
- Page transition on sidebar navigation. Content swaps instantly; sidebar and top bar persist.
- Permanent Border Beam on the hero. Removed (no decorative loop).
- Hover lift on non-clickable cards. Only clickable cards get hover feedback (background step, no translate).
- Drag-to-dismiss on the desktop modal. Close with Esc, scrim click and the Close/Cancel buttons. Drag-to-dismiss stays for the future iOS bottom sheet.

### Kept

- Press feedback on pointer-down: `whileTap={{ scale: 0.97 }}`, 100 ms ease-out, on buttons, chips, nav items and clickable cards.
- Curves: ease-out `cubic-bezier(0.23, 1, 0.32, 1)`; default spring `{ type: "spring", bounce: 0, duration: 0.4 }` (critically damped).
- **Modal: 200-250 ms** (frequent action). Scrim fades; surface scales 0.96 to 1 with opacity (blur 6 to 0 px optional); same path on exit. Animate UI **Dialog** with the duration overridden to 0.22 s.
- Tooltips: delay on first show, instant afterwards.
- Save success: label morphs to a check, then the modal closes.
- **Toast with Undo** replaces confirmation dialogs for reversible deletes (stays 6 s; Undo restores the row).
- **Hold-to-confirm, 2 s**, for irreversible deletes (debts): fill sweeps left to right, release cancels. Keyboard (hold Enter/Space) and two-step confirmation with Undo are equivalent alternatives (see Components).
- Never lock input during a transition; animate `transform` and `opacity` only.

### Component mapping

| Element                                     | Component                                                   | Behaviour                                                                               |
| ------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Sidebar active item                         | Animate UI **Highlight**                                    | shared-layout pill follows hover and route (library spring)                             |
| COP/USD toggle, Personal/Shared, filters    | Animate UI **Tabs** with `TabsHighlight`                    | sliding thumb; values swap instantly, no ticker                                         |
| Month selector                              | `motion` `AnimatePresence mode="popLayout"`                 | label slides 8 px in click direction, 150 ms; content does not animate                  |
| Dashboard stat cards                        | Magic UI **Number Ticker** (`decimalPlaces` 0 COP, 2 USD)   | first load only (`inView`, once)                                                        |
| Hero card                                   | none                                                        | static gradient, no Border Beam                                                         |
| Spending by category (ordered bars)         | `motion` width                                              | bars fill 0.5 s ease-out on first view only                                             |
| 6-month trend                               | `motion` `scaleY` from bottom                               | grows once on first view; hover tooltip 100 ms                                          |
| Upcoming, transactions, subscriptions lists | Magic UI **Animated List**                                  | first load only; a newly added transaction inserts at the top with a `layout` animation |
| Goal rings, progress bars                   | Magic UI **Animated Circular Progress Bar**, `motion` width | first view only; later edits re-target from the current value                           |
| Payoff timeline                             | `motion` `scaleX` per bar                                   | Avalanche/Snowball switch morphs widths with a layout spring                            |
| Subscriptions week strip                    | Animate UI **Highlight**                                    | highlight slides, list cross-fades 150 ms                                               |
| Calendar                                    | `motion` layout, `layoutId` selected outline                | month change cross-fade 150 ms; "+N more" opens a popover                               |
| Modal amount and currency                   | Animate UI **Tabs** + **Sliding Number**                    | converted line updates as the user types                                                |
| Category chips                              | Animate UI **Highlight** (controlled)                       | selected outline moves between chips                                                    |
| Settle up                                   | **Number Ticker**                                           | ticks to 0 after settling (one-off action)                                              |
| Theme toggle                                | Magic UI **Theme Toggler**                                  | 250 ms colour transition                                                                |
| Loading                                     | `motion` opacity shimmer                                    | skeleton matches final row geometry                                                     |

Reduced motion: `<MotionConfig reducedMotion="user">`; slides and springs become 150 ms opacity cross-fades; ticker shows the final value; no chart draw-in; shimmer is static. Also honour `prefers-reduced-transparency` (solid surfaces) and `prefers-contrast: more` (visible borders, ember-text for all brand text).

## 8. Implementation notes

- Store amounts as integer COP minor units plus `original_currency` and `original_amount`; convert with a dated rate table (4,000 is sample data) and show the rate date near the toggle.
- Keyboard: all top bar and modal controls focusable with the 2 px ember-text ring.
- iOS later: reuse tokens; sidebar becomes a tab bar; modal becomes a bottom sheet with drag; rings and amounts port as-is.
- **Variables in the .figcraft:** collection "Ember tokens" with Light and Dark modes. Solid fills and strokes of frames, text and shapes are bound to the colour variables (`color/<token>`), and the dark frames use the Dark mode. Not bound (FigCraft cannot bind them): gradients (hero, buttons use hex), drop shadows and glow, alpha fills (scrim, tinted overlays) and pure `#FFFFFF` text on ember-fill. Dark-mode frames therefore carry the dark hex values as well as the mode, so editing a token in Dark mode updates bound items but not gradients and effects.
