/**
 * Metadatos visuales de categorías y tipos de cuenta (DESIGN_SPEC §1 e
 * IVERN_FIXES §3): ícono y tono de cada categoría. El texto vive en
 * messages/*.json (categories.* y accountTypes.*).
 */
import type { Tone } from "@/components/ui/chip";
import type { IconName } from "@/components/ui/icon-registry";
import type {
  AccountType,
  CategoryKey,
  ExpenseCategoryKey,
  IncomeCategoryKey,
} from "@/lib/db/types";
import { EXPENSE_CATEGORY_KEYS, INCOME_CATEGORY_KEYS } from "@/lib/db/types";

export type CategoryMeta = { icon: IconName; tone: Tone };

/** Vivienda teal, comida ámbar, transporte azul, suscripciones violeta, salud oliva, ocio rosa, otros pizarra. */
export const CATEGORY_META: Record<CategoryKey, CategoryMeta> = {
  housing: { icon: "home", tone: "teal" },
  food: { icon: "shopping-cart", tone: "warning" },
  transport: { icon: "car-side", tone: "info" },
  subscriptions: { icon: "refresh", tone: "violet" },
  health: { icon: "heart", tone: "olive" },
  leisure: { icon: "ticket", tone: "pink" },
  other: { icon: "menu-dots", tone: "neutral" },
  salary: { icon: "arrow-small-down", tone: "positive" },
  other_income: { icon: "arrow-small-down", tone: "positive" },
};

/** Las transferencias no tienen categoría: ícono de intercambio en pizarra. */
export const TRANSFER_META: CategoryMeta = { icon: "exchange", tone: "neutral" };

export const ACCOUNT_TYPE_ICON: Record<AccountType, IconName> = {
  checking: "bank",
  savings: "piggy-bank",
  credit_card: "credit-card",
  cash: "wallet",
  other: "wallet",
};

export const ACCOUNT_TYPES = [
  "checking",
  "savings",
  "credit_card",
  "cash",
  "other",
] as const satisfies readonly AccountType[];

export function categoriesFor(
  kind: "expense" | "income",
): readonly (ExpenseCategoryKey | IncomeCategoryKey)[] {
  return kind === "expense" ? EXPENSE_CATEGORY_KEYS : INCOME_CATEGORY_KEYS;
}

export function isCategoryOfKind(key: string, kind: "expense" | "income"): boolean {
  return (categoriesFor(kind) as readonly string[]).includes(key);
}
