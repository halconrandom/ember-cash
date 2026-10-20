/**
 * Lee un mensaje de Telegram y saca tipo, monto, moneda y categoría.
 * Es determinista: no llama a ningún modelo. Los ejemplos de la fase T1
 * ("gasté 25000 mercado", "25 usd uber", "ingreso 1.200.000 salario",
 * "20,50 eur netflix") pasan por aquí.
 */
import {
  CURRENCY_CODES,
  CURRENCY_EXPONENT,
  type CategoryKey,
  type CurrencyCode,
} from "@/lib/db/types";
import { isCategoryOfKind } from "@/lib/categories";

/** Tope de entrada: un movimiento cabe en una línea, no en un texto largo. */
const MAX_INPUT = 500;

/** 15 cifras enteras, y el resultado tiene que caber en un entero seguro de JS. */
const MAX_INTEGER_DIGITS = 15;
const MAX_MINOR = BigInt(Number.MAX_SAFE_INTEGER);

const EXPENSE_WORDS = new Set([
  "gaste",
  "gasto",
  "pague",
  "compre",
  "compra",
  "spent",
  "expense",
  "paid",
  "pago",
]);

const INCOME_WORDS = new Set(["ingreso", "ingrese", "recibi", "cobre", "income", "received"]);

/**
 * Palabra → categoría sembrada. Las cortas solo coinciden enteras para no
 * agarrar "bus" dentro de otra palabra. "Otros" es la reserva, no una pista.
 */
const KEYWORDS: { key: CategoryKey; words: readonly string[]; exact?: boolean }[] = [
  {
    key: "subscriptions",
    words: [
      "netflix",
      "spotify",
      "disney",
      "internet",
      "celular",
      "suscripcion",
      "suscripciones",
      "subscription",
      "subscriptions",
    ],
  },
  {
    key: "transport",
    words: ["uber", "didi", "taxi", "bus", "gasolina", "transporte", "transport", "gas"],
  },
  {
    key: "food",
    words: [
      "mercado",
      "comida",
      "super",
      "supermercado",
      "restaurante",
      "restaurant",
      "food",
      "almuerzo",
      "cena",
      "desayuno",
      "grocery",
    ],
  },
  {
    key: "housing",
    words: ["arriendo", "alquiler", "renta", "rent", "vivienda", "housing", "hipoteca"],
  },
  {
    key: "health",
    words: ["farmacia", "medico", "salud", "health", "doctor", "drogueria"],
  },
  { key: "leisure", words: ["cine", "ocio", "leisure"] },
  { key: "salary", words: ["salario", "sueldo", "nomina", "salary", "quincena"] },
];

export type TelegramParseError =
  | "empty"
  | "no_amount"
  | "invalid"
  | "too_many_decimals"
  | "too_large"
  | "not_positive"
  | "currency_disabled";

export type TelegramParsed = {
  kind: "expense" | "income";
  amountMinor: bigint;
  currency: CurrencyCode;
  categoryKey: CategoryKey;
  description: string;
};

export type TelegramParseResult =
  { ok: true; value: TelegramParsed } | { ok: false; error: TelegramParseError };

type AmountResult =
  | { ok: true; minor: bigint }
  | { ok: false; error: "invalid" | "too_many_decimals" | "too_large" | "not_positive" };

/** Minúsculas y sin tildes, para comparar palabras. */
function fold(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Quita signos pegados al token. No toca los separadores del monto. */
function cleanToken(token: string): string {
  return token.replace(/^[¿¡"'“”]+/u, "").replace(/[.;:!?¿¡"'“”]+$/u, "");
}

function isCurrency(value: string): value is CurrencyCode {
  return (CURRENCY_CODES as readonly string[]).includes(value);
}

function isAmountText(value: string): boolean {
  return /^\d[\d.,]*$/.test(value);
}

/**
 * Separa "25usd" en monto y moneda. "euros" no cuenta como EUR: lo que sobra
 * tiene que ser un monto, no letras.
 */
function peel(token: string): { amount?: string; currency?: CurrencyCode; word?: string } {
  const folded = fold(token);
  for (const code of CURRENCY_CODES) {
    const lower = code.toLowerCase();
    if (folded === lower) return { currency: code };
    if (folded.endsWith(lower)) {
      const head = folded.slice(0, -lower.length);
      if (isAmountText(head)) return { currency: code, amount: head };
    }
    if (folded.startsWith(lower)) {
      const tail = folded.slice(lower.length);
      if (isAmountText(tail)) return { currency: code, amount: tail };
    }
  }
  if (isAmountText(folded)) return { amount: folded };
  return { word: folded };
}

function groupedInteger(parts: string[]): string | null {
  if (parts.length < 2) return null;
  if (parts[0] === "" || parts[0].length > 3) return null;
  if (parts.slice(1).some((part) => part.length !== 3)) return null;
  return parts.join("");
}

/**
 * Pasa el texto del monto a unidades menores.
 * Un separador y exactamente 3 cifras a la derecha son miles (1.200),
 * aunque la moneda tenga decimales. Si hay punto y coma, el último es el
 * decimal. Más decimales de los que admite la moneda se rechazan.
 */
function parseAmount(raw: string, exponent: number): AmountResult {
  if (!isAmountText(raw)) return { ok: false, error: "invalid" };
  const hasDot = raw.includes(".");
  const hasComma = raw.includes(",");
  let integer: string;
  let fraction = "";

  if (hasDot && hasComma) {
    const decimalSep = raw.lastIndexOf(".") > raw.lastIndexOf(",") ? "." : ",";
    const groupSep = decimalSep === "." ? "," : ".";
    const pieces = raw.split(decimalSep);
    if (pieces.length !== 2) return { ok: false, error: "invalid" };
    const grouped = groupedInteger(pieces[0].split(groupSep));
    if (grouped === null || !/^\d+$/.test(pieces[1])) return { ok: false, error: "invalid" };
    integer = grouped;
    fraction = pieces[1];
    if (fraction.length > exponent) return { ok: false, error: "too_many_decimals" };
  } else if (hasDot || hasComma) {
    const parts = raw.split(hasDot ? "." : ",");
    if (parts.some((part) => part === "" || !/^\d+$/.test(part))) {
      return { ok: false, error: "invalid" };
    }
    if (parts.length > 2) {
      const grouped = groupedInteger(parts);
      if (grouped === null) return { ok: false, error: "invalid" };
      integer = grouped;
    } else {
      const [left, right] = parts;
      if (right.length === 3) {
        if (left.length > 3) return { ok: false, error: "invalid" };
        integer = `${left}${right}`;
      } else if (right.length > exponent) {
        return { ok: false, error: "too_many_decimals" };
      } else {
        integer = left;
        fraction = right;
      }
    }
  } else {
    integer = raw;
  }

  if (!/^\d+$/.test(integer)) return { ok: false, error: "invalid" };
  if (integer.replace(/^0+/, "").length > MAX_INTEGER_DIGITS) {
    return { ok: false, error: "too_large" };
  }

  const scale = 10n ** BigInt(exponent);
  const minor = BigInt(integer) * scale + BigInt(fraction.padEnd(exponent, "0") || "0");
  if (minor <= 0n) return { ok: false, error: "not_positive" };
  if (minor > MAX_MINOR) return { ok: false, error: "too_large" };
  return { ok: true, minor };
}

function tokenMatches(token: string, keyword: string): boolean {
  if (token === keyword) return true;
  return keyword.length >= 5 && token.includes(keyword);
}

/** La pista más larga que sea del mismo tipo. Si ninguna, Otros. */
function matchCategory(words: readonly string[], kind: "expense" | "income"): CategoryKey {
  let best: { key: CategoryKey; length: number } | null = null;
  for (const token of words) {
    for (const entry of KEYWORDS) {
      if (!isCategoryOfKind(entry.key, kind)) continue;
      for (const keyword of entry.words) {
        const exact = entry.exact === true || keyword.length < 5;
        const hit = exact ? token === keyword : tokenMatches(token, keyword);
        if (!hit) continue;
        if (!best || keyword.length > best.length)
          best = { key: entry.key, length: keyword.length };
      }
    }
  }
  return best?.key ?? (kind === "income" ? "other_income" : "other");
}

/**
 * Interpreta el texto. `defaultCurrency` se usa si el mensaje no trae moneda
 * y tiene que estar en `enabled`; una moneda escrita que no esté activa se
 * rechaza, no se sustituye.
 */
export function parseTelegramMessage(
  text: string,
  options: { enabled: readonly CurrencyCode[]; defaultCurrency: CurrencyCode },
): TelegramParseResult {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: false, error: "empty" };
  if (trimmed.length > MAX_INPUT) return { ok: false, error: "invalid" };

  const tokens = trimmed
    .split(/\s+/)
    .map(cleanToken)
    .filter((token) => token !== "");
  let kind: "expense" | "income" | null = null;
  let kindIndex = -1;
  for (let index = 0; index < tokens.length; index += 1) {
    const folded = fold(tokens[index] ?? "");
    if (EXPENSE_WORDS.has(folded)) {
      kind = "expense";
      kindIndex = index;
      break;
    }
    if (INCOME_WORDS.has(folded)) {
      kind = "income";
      kindIndex = index;
      break;
    }
  }
  const resolvedKind = kind ?? "expense";

  let currency: CurrencyCode | null = null;
  let amountText: string | null = null;
  const description: string[] = [];
  const words: string[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    if (index === kindIndex) continue;
    const token = tokens[index] ?? "";
    const peeled = peel(token);
    if (peeled.currency) {
      if (currency && currency !== peeled.currency) return { ok: false, error: "invalid" };
      currency = peeled.currency;
    }
    if (peeled.amount) {
      if (amountText) return { ok: false, error: "invalid" };
      amountText = peeled.amount;
    }
    if (peeled.word) {
      description.push(token);
      words.push(peeled.word);
    }
  }

  if (!amountText) return { ok: false, error: "no_amount" };

  const chosen = currency ?? options.defaultCurrency;
  if (!isCurrency(chosen) || !options.enabled.includes(chosen)) {
    return { ok: false, error: "currency_disabled" };
  }

  const amount = parseAmount(amountText, CURRENCY_EXPONENT[chosen]);
  if (!amount.ok) return amount;

  const label = description.join(" ").trim().slice(0, 200);
  return {
    ok: true,
    value: {
      kind: resolvedKind,
      amountMinor: amount.minor,
      currency: chosen,
      categoryKey: matchCategory(words, resolvedKind),
      description: label === "" ? "Telegram" : label,
    },
  };
}
