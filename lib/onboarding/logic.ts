/**
 * Reglas puras del wizard: moneda por idioma, paso a retomar, cuenta, foco,
 * tasa a mostrar y el movimiento de cada paso. El servidor y los tests usan
 * lo mismo; no toca la base.
 */
import { parseAprBps, validateDebt, type DebtInput } from "@/lib/debts/schema";
import type { AccountType, CurrencyCode } from "@/lib/db/types";
import { CURRENCY_CODES } from "@/lib/db/types";
import type { GoalInput } from "@/lib/goals/schema";
import { validateGoal } from "@/lib/goals/schema";
import type { Locale } from "@/lib/i18n/config";
import { latestRateFor, type Rate } from "@/lib/money/convert";
import { parseMoney } from "@/lib/money/parse";
import type { RecurringInput } from "@/lib/recurring/schema";
import { shiftMonth } from "@/lib/transactions/dates";

/** Pasos con número: 1 moneda, 2 cuenta, 3 foco, 4 panel. La bienvenida es 0. */
export const WIZARD_TOTAL = 4;

export type WizardStep = 0 | 1 | 2 | 3;

/** Claves de los tipos que ve el wizard. wallet se guarda como `other`. */
export const WIZARD_ACCOUNT_TYPES = [
  { key: "savings", db: "savings" },
  { key: "checking", db: "checking" },
  { key: "cash", db: "cash" },
  { key: "credit", db: "credit_card" },
  { key: "wallet", db: "other" },
] as const;
export type WizardAccountType = (typeof WIZARD_ACCOUNT_TYPES)[number]["key"];

/**
 * Chips de suscripción, en el orden de la cadena `focus.sub.chips`
 * ("Arriendo, Internet, …"). El arriendo usa categoría vivienda, pero el
 * kind sigue siendo subscription: la lista y la tarjeta del panel solo
 * muestran ese kind.
 */
export const SUBSCRIPTION_CHIPS = [
  { key: "rent", categoryKey: "housing", iconKey: "home" },
  { key: "internet", categoryKey: "subscriptions", iconKey: "wifi" },
  { key: "phone", categoryKey: "subscriptions", iconKey: "mobile" },
  { key: "gym", categoryKey: "subscriptions", iconKey: "dumbbell-horizontal" },
  { key: "streaming", categoryKey: "subscriptions", iconKey: "play" },
] as const;
export type SubscriptionChipKey = (typeof SUBSCRIPTION_CHIPS)[number]["key"];

/** Parte la cadena del copy. El separador es ", " en los dos idiomas. */
export function subscriptionChipLabels(chipsText: string): string[] {
  return chipsText
    .split(", ")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export type FieldErrors = Partial<Record<string, string>>;

export type FormFailure = { ok: false; formError: string | null; fields: FieldErrors };

/** es → COP, en → USD. EUR se elige a mano: ningún idioma la preselecciona. */
export function defaultCurrencyForLocale(locale: Locale): CurrencyCode {
  return locale === "en" ? "USD" : "COP";
}

/**
 * Pantalla a mostrar mientras onboarded_at es null. 1, 2 y 3 son esos pasos.
 * Null, 0 y un 4 sin haber terminado vuelven a la bienvenida o, si ya iba
 * en el foco, no: 4 sin onboarded_at no debería pasar; se trata como 0 para
 * no saltar al panel a medias.
 */
export function wizardStep(step: number | null): WizardStep {
  if (step === 1 || step === 2 || step === 3) return step;
  return 0;
}

/**
 * Tasa real a mostrar junto a la moneda elegida. Se enseña el par guardado,
 * sin invertir el número. COP prefiere USD→COP; USD prefiere EUR→USD y, si
 * no hay, USD→COP; EUR prefiere EUR→USD. Null si no hay ninguna.
 */
export function rateForDisplayCurrency(
  currency: CurrencyCode,
  rates: readonly Rate[],
): Rate | null {
  if (currency === "COP") return latestRateFor(rates, "USD", "COP");
  if (currency === "USD") {
    return latestRateFor(rates, "EUR", "USD") ?? latestRateFor(rates, "USD", "COP");
  }
  return latestRateFor(rates, "EUR", "USD");
}

/** Quita ceros de más del decimal guardado, sin pasar por un float. */
export function formatRateText(rate: string): string {
  if (!rate.includes(".")) return rate;
  return rate.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
}

const STEP_EASE = [0.23, 1, 0.32, 1] as const;

/**
 * Fade + 16 px en 200 ms, la curva de --ease-out-ember. Con movimiento
 * reducido solo cambia la opacidad: no hay desplazamiento.
 */
export function stepMotion(reduced: boolean) {
  return {
    initial: reduced ? { opacity: 0 } : { opacity: 0, y: 16 },
    animate: reduced ? { opacity: 1 } : { opacity: 1, y: 0 },
    transition: { duration: 0.2, ease: STEP_EASE },
  };
}

function dbAccountType(key: WizardAccountType): AccountType {
  return WIZARD_ACCOUNT_TYPES.find((item) => item.key === key)!.db;
}

function isCurrency(value: string): value is CurrencyCode {
  return (CURRENCY_CODES as readonly string[]).includes(value);
}

function parseDay(input: string): number | null {
  const text = input.trim();
  if (!/^\d{1,2}$/.test(text)) return null;
  const day = Number(text);
  return day >= 1 && day <= 31 ? day : null;
}

export type AccountDraft = {
  dbType: AccountType;
  name: string;
  currency: CurrencyCode;
  /** Texto del saldo, tal como lo escribió. Vacío si no puso saldo. */
  balance: string | null;
  creditLimitMinor: number | null;
  paymentDay: number | null;
};

/**
 * Valida el paso de la cuenta. El saldo es opcional. En una tarjeta el cupo
 * y el día de pago hacen falta; en los otros tipos se ignoran.
 */
export function validateAccountForm(
  input: {
    type: string;
    name: string;
    currency: string;
    balance: string;
    limit: string;
    payDay: string;
  },
  locale: Locale,
): { ok: true; value: AccountDraft } | FormFailure {
  const fields: FieldErrors = {};
  const type = WIZARD_ACCOUNT_TYPES.find((item) => item.key === input.type);
  if (!type || !isCurrency(input.currency)) {
    return { ok: false, formError: "onboarding.account.errors.save", fields };
  }

  const name = input.name.trim();
  if (!name) fields.name = "onboarding.account.errors.name";
  else if (name.length > 80) fields.name = "accounts.errors.nameTooLong";

  const balanceText = input.balance.trim();
  let balance: string | null = null;
  if (balanceText) {
    const parsed = parseMoney(balanceText, input.currency, locale);
    if (!parsed.ok) fields.balance = "onboarding.account.errors.balance";
    else balance = balanceText;
  }

  let creditLimitMinor: number | null = null;
  let paymentDay: number | null = null;
  if (type.key === "credit") {
    const limit = parseMoney(input.limit, input.currency, locale);
    if (!limit.ok) fields.limit = "onboarding.account.errors.limit";
    else creditLimitMinor = Number(limit.value.amountMinor);
    const day = parseDay(input.payDay);
    if (day === null) fields.payDay = "onboarding.account.errors.payDay";
    else paymentDay = day;
  }

  if (Object.keys(fields).length > 0) return { ok: false, formError: null, fields };
  return {
    ok: true,
    value: {
      dbType: dbAccountType(type.key),
      name,
      currency: input.currency,
      balance,
      creditLimitMinor,
      paymentDay,
    },
  };
}

/**
 * Cómo se anota el saldo inicial. La cuenta no tiene columna de saldo (0003):
 * se guarda una transacción. En una tarjeta es un gasto (lo que se debe); en
 * el resto, un ingreso. El panel suma ingresos y gastos del mes, así que ese
 * movimiento aparece en el mes en curso. No es un saldo de libro contable.
 */
export function openingBalanceKind(type: AccountType): {
  kind: "income" | "expense";
  categoryKey: "other_income" | "other";
} {
  if (type === "credit_card") return { kind: "expense", categoryKey: "other" };
  return { kind: "income", categoryKey: "other_income" };
}

/** Próximo día `day` en o después de `today`. Si el mes no llega, usa el último día. */
export function nextChargeDate(today: string, day: number): string {
  const [year, month, current] = today.split("-").map(Number);
  const lastThis = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const clamped = Math.min(day, lastThis);
  if (current <= clamped) {
    return `${today.slice(0, 7)}-${String(clamped).padStart(2, "0")}`;
  }
  const next = shiftMonth(today.slice(0, 7), 1);
  const [nextYear, nextMonth] = next.split("-").map(Number);
  const lastNext = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
  return `${next}-${String(Math.min(day, lastNext)).padStart(2, "0")}`;
}

export type FocusDraft =
  | { choice: "savings"; goal: GoalInput; current: string | null }
  | { choice: "debt"; debt: DebtInput }
  | { choice: "subscription"; recurring: RecurringInput };

function moneyErrorKey(error: string): string {
  if (error === "tooManyDecimals") return "savings.errors.amountTooManyDecimals";
  if (error === "tooLarge") return "savings.errors.amountTooLarge";
  if (error === "empty" || error === "notPositive") return "savings.errors.amountPositive";
  return "savings.errors.amountInvalid";
}

function chipOf(key: string) {
  return SUBSCRIPTION_CHIPS.find((chip) => chip.key === key) ?? null;
}

/**
 * Valida el único elemento del paso 3. La tasa de la deuda, si va vacía, se
 * guarda como 0 (la acción de deudas exige un número). El wizard no acepta
 * más de 100, aunque la acción permita hasta 200.
 */
export function validateFocusForm(
  input: {
    choice: string;
    name: string;
    target: string;
    current: string;
    date: string;
    balance: string;
    rate: string;
    payment: string;
    dueDay: string;
    amount: string;
    day: string;
    chip: string;
    currency: CurrencyCode;
    today: string;
  },
  locale: Locale,
): { ok: true; value: FocusDraft } | FormFailure {
  if (input.choice !== "savings" && input.choice !== "debt" && input.choice !== "subscription") {
    return { ok: false, formError: "onboarding.focus.error", fields: {} };
  }

  if (input.choice === "savings") {
    const fields: FieldErrors = {};
    const goalCheck = validateGoal(
      {
        id: null,
        name: input.name,
        iconKey: "piggy-bank",
        target: input.target,
        currency: input.currency,
        targetDate: input.date.trim(),
        monthly: "",
      },
      locale,
      input.today,
    );
    if (!goalCheck.ok) {
      if (goalCheck.errors.name === "nameTooLong") fields.name = "savings.errors.nameTooLong";
      else if (goalCheck.errors.name) fields.name = "savings.errors.nameRequired";
      if (goalCheck.errors.target) fields.target = "onboarding.focus.goal.errors.target";
      if (goalCheck.errors.targetDate === "datePast") fields.date = "savings.errors.datePast";
      else if (goalCheck.errors.targetDate) fields.date = "savings.errors.dateInvalid";
    }
    const currentText = input.current.trim();
    let current: string | null = null;
    if (currentText) {
      const parsed = parseMoney(currentText, input.currency, locale);
      if (!parsed.ok) fields.current = moneyErrorKey(parsed.error);
      else current = currentText;
    }
    if (!goalCheck.ok || Object.keys(fields).length > 0) {
      return { ok: false, formError: null, fields };
    }
    return {
      ok: true,
      value: {
        choice: "savings",
        goal: {
          id: null,
          name: input.name,
          iconKey: "piggy-bank",
          target: input.target,
          currency: input.currency,
          targetDate: input.date.trim(),
          monthly: "",
        },
        current,
      },
    };
  }

  if (input.choice === "debt") {
    const fields: FieldErrors = {};
    const rateText = input.rate.trim();
    let apr = "0";
    if (rateText) {
      const bps = parseAprBps(rateText);
      if (bps === null || bps > 10_000) fields.rate = "onboarding.focus.debt.errors.rate";
      else apr = rateText;
    }
    const paymentText = input.payment.trim();
    let minPayment = "0";
    if (paymentText) {
      const parsed = parseMoney(paymentText, input.currency, locale, { allowZero: true });
      if (!parsed.ok) fields.payment = "debts.errors.amountInvalid";
      else minPayment = paymentText;
    }
    const dueText = input.dueDay.trim();
    let dueDay = "";
    if (dueText) {
      if (parseDay(dueText) === null) fields.dueDay = "debts.errors.dueDayInvalid";
      else dueDay = dueText;
    }
    const debt: DebtInput = {
      id: null,
      name: input.name,
      subtitle: "",
      iconKey: "credit-card",
      currency: input.currency,
      principal: input.balance,
      apr,
      aprKind: "EA",
      minPayment,
      dueDay,
    };
    if (Object.keys(fields).length === 0) {
      const checked = validateDebt(debt, locale);
      if (!checked.ok) {
        if (checked.errors.name === "nameTooLong") fields.name = "debts.errors.nameTooLong";
        else if (checked.errors.name) fields.name = "debts.errors.nameRequired";
        if (checked.errors.principal) fields.balance = "onboarding.focus.debt.errors.balance";
        if (checked.errors.apr) fields.rate = "onboarding.focus.debt.errors.rate";
        if (checked.errors.minPayment) fields.payment = "debts.errors.amountInvalid";
        if (checked.errors.dueDay) fields.dueDay = "debts.errors.dueDayInvalid";
      }
    }
    if (Object.keys(fields).length > 0) return { ok: false, formError: null, fields };
    return { ok: true, value: { choice: "debt", debt } };
  }

  const fields: FieldErrors = {};
  const name = input.name.trim();
  if (!name) fields.name = "subscriptions.errors.nameRequired";
  else if (name.length > 80) fields.name = "subscriptions.errors.nameTooLong";
  const amount = parseMoney(input.amount, input.currency, locale);
  if (!amount.ok) fields.amount = "onboarding.focus.sub.errors.amount";
  const day = parseDay(input.day);
  if (day === null) fields.day = "onboarding.focus.sub.errors.day";
  if (Object.keys(fields).length > 0 || day === null) {
    return { ok: false, formError: null, fields };
  }
  const chip = chipOf(input.chip);
  const recurring: RecurringInput = {
    id: null,
    kind: "subscription",
    name,
    subtitle: "",
    iconKey: chip?.iconKey ?? "refresh",
    amount: input.amount,
    currency: input.currency,
    categoryKey: chip?.categoryKey ?? "subscriptions",
    frequency: "monthly",
    interval: "1",
    anchorDate: nextChargeDate(input.today, day),
    endsOn: "",
  };
  return { ok: true, value: { choice: "subscription", recurring } };
}
