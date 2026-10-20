/**
 * Contratos del webhook de Telegram. El handler habla con estos tipos; la
 * base y la API de Telegram los implementan aparte, para poder probar el
 * flujo sin red ni Postgres.
 */
import type { CurrencyCode } from "@/lib/db/types";

export type LimitResult = { ok: true; allowed: boolean } | { ok: false };

export type LinkResult =
  { ok: true } | { ok: false; error: "expired" | "used" | "invalid" | "taken" | "failed" };

export type ContextResult =
  | { ok: false }
  | { ok: true; linked: false }
  | {
      ok: true;
      linked: true;
      locale: "es" | "en";
      enabled: CurrencyCode[];
      defaultCurrency: CurrencyCode;
      hasAccount: boolean;
    };

export type DraftInput = {
  telegramUserId: number;
  chatId: number;
  kind: "expense" | "income";
  amountMinor: bigint;
  currency: CurrencyCode;
  categoryKey: string;
  description: string;
};

export type DraftResult =
  | {
      ok: true;
      draftId: string;
      kind: "expense" | "income";
      amountMinor: bigint;
      currency: CurrencyCode;
      categoryKey: string;
      description: string;
      accountName: string;
      occurredOn: string;
    }
  | {
      ok: false;
      error:
        | "no_account"
        | "currency_disabled"
        | "account_forbidden"
        | "invalid"
        | "not_linked"
        | "failed";
    };

export type ActionResult =
  | { ok: true; already?: boolean }
  | {
      ok: false;
      error:
        | "expired"
        | "not_found"
        | "already_saved"
        | "nothing"
        | "not_linked"
        | "account_forbidden"
        | "rate_limited"
        | "failed";
    };

/** Lo que el webhook puede pedirle a Postgres. Ningún método recibe user_id. */
export type TelegramGateway = {
  consumeLimit(telegramUserId: number): Promise<LimitResult>;
  link(telegramUserId: number, chatId: number, code: string): Promise<LinkResult>;
  context(telegramUserId: number): Promise<ContextResult>;
  putDraft(input: DraftInput): Promise<DraftResult>;
  commit(telegramUserId: number, draftId: string): Promise<ActionResult>;
  cancel(telegramUserId: number, draftId: string): Promise<ActionResult>;
  undo(telegramUserId: number): Promise<ActionResult>;
};

export type OutboundButton = { label: string; data: string };

export type TelegramSender = {
  send(chatId: number, text: string, buttons?: OutboundButton[]): Promise<void>;
  answer(callbackId: string): Promise<void>;
  edit(chatId: number, messageId: number, text: string): Promise<void>;
};
