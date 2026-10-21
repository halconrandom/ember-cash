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
        | "cannot_undo"
        | "failed";
    };

export type SubscriptionDraftInput = {
  telegramUserId: number;
  chatId: number;
  name: string;
  amountMinor: bigint;
  currency: CurrencyCode;
  frequency: "weekly" | "monthly" | "yearly";
  dayOfMonth: number | null;
};

export type SubscriptionDraftResult =
  | {
      ok: true;
      draftId: string;
      name: string;
      amountMinor: bigint;
      currency: CurrencyCode;
      frequency: "weekly" | "monthly" | "yearly";
      nextCharge: string;
    }
  | {
      ok: false;
      error:
        | "invalid"
        | "currency_disabled"
        | "day_only_monthly"
        | "not_linked"
        | "failed";
    };

export type OccurrenceDraftResult =
  | {
      ok: true;
      draftId: string;
      name: string;
      amountMinor: bigint;
      currency: CurrencyCode;
      dueOn: string;
    }
  | {
      ok: false;
      error: "not_found" | "no_account" | "not_linked" | "failed";
    };

export type DueOccurrence = {
  occurrenceId: string;
  name: string;
  amountMinor: bigint;
  currency: CurrencyCode;
  dueOn: string;
};

export type DueOccurrencesResult =
  { ok: true; items: DueOccurrence[] } | { ok: false };

export type DebtDraftInput = {
  telegramUserId: number;
  chatId: number;
  name: string;
  amountMinor: bigint;
  currency: CurrencyCode;
};

export type DebtDraftResult =
  | { ok: true; draftId: string; name: string; amountMinor: bigint; currency: CurrencyCode }
  | { ok: false; error: "invalid" | "currency_disabled" | "not_linked" | "failed" };

export type OpenDebt = {
  debtId: string;
  name: string;
  balanceMinor: bigint;
  currency: CurrencyCode;
};

export type ListDebtsResult = { ok: true; items: OpenDebt[] } | { ok: false };

export type BeginDebtPaymentResult =
  | { ok: true; draftId: string; name: string; currency: CurrencyCode; balanceMinor: bigint }
  | { ok: false; error: "not_found" | "settled" | "not_linked" | "failed" };

export type AnswerDebtPaymentResult =
  | {
      ok: true;
      draftId: string;
      name: string;
      currency: CurrencyCode;
      amountMinor: bigint;
      balanceAfter: bigint;
    }
  | {
      ok: false;
      error:
        | "not_found"
        | "already_saved"
        | "expired"
        | "invalid"
        | "exceeds_balance"
        | "not_linked"
        | "failed";
    };

export type GoalItem = {
  goalId: string;
  name: string;
  currency: CurrencyCode;
  targetMinor: bigint;
  savedMinor: bigint;
};

export type ListGoalsResult = { ok: true; items: GoalItem[] } | { ok: false };

export type BeginGoalContributionResult =
  | { ok: true; draftId: string; name: string; currency: CurrencyCode }
  | { ok: false; error: "not_found" | "not_linked" | "failed" };

export type AnswerGoalContributionResult =
  | {
      ok: true;
      draftId: string;
      name: string;
      currency: CurrencyCode;
      amountMinor: bigint;
      enteredAmountMinor: bigint | null;
      enteredCurrency: CurrencyCode | null;
    }
  | {
      ok: false;
      error:
        | "not_found"
        | "already_saved"
        | "expired"
        | "invalid"
        | "rate_unavailable"
        | "not_linked"
        | "failed";
    };

export type PendingStepResult =
  | { ok: true; pending: false }
  | {
      ok: true;
      pending: true;
      draftKind: "debt_payment" | "goal_contribution";
      draftId: string;
      name: string;
      currency: CurrencyCode;
    }
  | { ok: false };

/** Lo que el webhook puede pedirle a Postgres. Ningún método recibe user_id. */
export type TelegramGateway = {
  consumeLimit(telegramUserId: number): Promise<LimitResult>;
  link(telegramUserId: number, chatId: number, code: string): Promise<LinkResult>;
  context(telegramUserId: number): Promise<ContextResult>;
  putDraft(input: DraftInput): Promise<DraftResult>;
  putSubscriptionDraft(input: SubscriptionDraftInput): Promise<SubscriptionDraftResult>;
  putOccurrenceDraft(
    telegramUserId: number,
    chatId: number,
    occurrenceId: string,
  ): Promise<OccurrenceDraftResult>;
  dueOccurrences(telegramUserId: number): Promise<DueOccurrencesResult>;
  putDebtDraft(input: DebtDraftInput): Promise<DebtDraftResult>;
  listDebts(telegramUserId: number): Promise<ListDebtsResult>;
  beginDebtPayment(
    telegramUserId: number,
    chatId: number,
    debtId: string,
  ): Promise<BeginDebtPaymentResult>;
  answerDebtPayment(
    telegramUserId: number,
    draftId: string,
    amountMinor: bigint,
  ): Promise<AnswerDebtPaymentResult>;
  listGoals(telegramUserId: number): Promise<ListGoalsResult>;
  beginGoalContribution(
    telegramUserId: number,
    chatId: number,
    goalId: string,
  ): Promise<BeginGoalContributionResult>;
  /**
   * `enteredCurrency` es lo que escribió la persona; `goalCurrency` es la
   * de la meta (de pendingStep). Si no coinciden, el gateway convierte con
   * la tasa de hoy (lib/money/convert.ts) antes de escribir el borrador.
   */
  answerGoalContribution(
    telegramUserId: number,
    draftId: string,
    enteredAmountMinor: bigint,
    enteredCurrency: CurrencyCode,
    goalCurrency: CurrencyCode,
  ): Promise<AnswerGoalContributionResult>;
  pendingStep(telegramUserId: number): Promise<PendingStepResult>;
  commit(telegramUserId: number, draftId: string): Promise<ActionResult>;
  cancel(telegramUserId: number, draftId: string): Promise<ActionResult>;
  undo(telegramUserId: number): Promise<ActionResult>;
};

export type OutboundButton = { label: string; data: string };

export type TelegramSender = {
  /** `forceReply` solo aplica sin `buttons` (Telegram no admite los dos). */
  send(
    chatId: number,
    text: string,
    buttons?: OutboundButton[],
    options?: { forceReply?: boolean },
  ): Promise<void>;
  answer(callbackId: string): Promise<void>;
  edit(chatId: number, messageId: number, text: string, buttons?: OutboundButton[]): Promise<void>;
};
