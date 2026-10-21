/**
 * Adaptador de las RPC del bot. El cliente de servicio solo ejecuta
 * funciones: las tablas no le están concedidas. Si la llamada falla, se
 * cierra (no se guarda ni se deja pasar el límite).
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { CurrencyCode, Database } from "@/lib/db/types";
import { convert, rateAt, type Rate } from "@/lib/money/convert";
import { money } from "@/lib/money/money";
import { pickLatest } from "@/lib/money/rates";

import {
  readAction,
  readAnswerDebtPayment,
  readAnswerGoalContribution,
  readBeginDebtPayment,
  readBeginGoalContribution,
  readContext,
  readDebtDraft,
  readDraft,
  readDueOccurrences,
  readLimit,
  readLink,
  readListDebts,
  readListGoals,
  readOccurrenceDraft,
  readPendingStep,
  readSubscriptionDraft,
} from "./read";
import type { DebtDraftInput, DraftInput, SubscriptionDraftInput, TelegramGateway } from "./types";

type Admin = SupabaseClient<Database>;

/** Gateway contra el Postgres real. */
export function telegramGateway(supabase: Admin): TelegramGateway {
  return {
    async consumeLimit(telegramUserId) {
      const { data, error } = await supabase.rpc("consume_rate_limit", {
        p_action: "telegram",
        p_telegram_user_id: telegramUserId,
      });
      if (error) return { ok: false };
      return readLimit(data) ?? { ok: false };
    },
    async link(telegramUserId, chatId, code) {
      const { data, error } = await supabase.rpc("telegram_link_with_code", {
        p_telegram_user_id: telegramUserId,
        p_chat_id: chatId,
        p_code: code,
      });
      if (error) return { ok: false, error: "failed" };
      return readLink(data);
    },
    async context(telegramUserId) {
      const { data, error } = await supabase.rpc("telegram_context", {
        p_telegram_user_id: telegramUserId,
      });
      if (error) return { ok: false };
      return readContext(data);
    },
    async putDraft(input: DraftInput) {
      const { data, error } = await supabase.rpc("telegram_put_draft", {
        p_telegram_user_id: input.telegramUserId,
        p_chat_id: input.chatId,
        p_kind: input.kind,
        p_amount_minor: Number(input.amountMinor),
        p_currency: input.currency,
        p_category_key: input.categoryKey,
        p_description: input.description,
        // supabase gen types no marca args SQL nulables; la función acepta null.
        p_account_id: null as unknown as string,
      });
      if (error) return { ok: false, error: "failed" };
      return readDraft(data);
    },
    async putSubscriptionDraft(input: SubscriptionDraftInput) {
      const { data, error } = await supabase.rpc("telegram_put_subscription_draft", {
        p_telegram_user_id: input.telegramUserId,
        p_chat_id: input.chatId,
        p_name: input.name,
        p_amount_minor: Number(input.amountMinor),
        p_currency: input.currency,
        p_frequency: input.frequency,
        // Nulable en SQL (solo aplica a frecuencia mensual).
        p_day_of_month: input.dayOfMonth as number,
      });
      if (error) return { ok: false, error: "failed" };
      return readSubscriptionDraft(data);
    },
    async putOccurrenceDraft(telegramUserId, chatId, occurrenceId) {
      const { data, error } = await supabase.rpc("telegram_put_occurrence_draft", {
        p_telegram_user_id: telegramUserId,
        p_chat_id: chatId,
        p_occurrence_id: occurrenceId,
      });
      if (error) return { ok: false, error: "failed" };
      return readOccurrenceDraft(data);
    },
    async dueOccurrences(telegramUserId) {
      const { data, error } = await supabase.rpc("telegram_due_occurrences", {
        p_telegram_user_id: telegramUserId,
      });
      if (error) return { ok: false };
      return readDueOccurrences(data);
    },
    async commit(telegramUserId, draftId) {
      const { data, error } = await supabase.rpc("telegram_commit_draft", {
        p_telegram_user_id: telegramUserId,
        p_draft_id: draftId,
      });
      if (error) return { ok: false, error: "failed" };
      return readAction(data);
    },
    async putDebtDraft(input: DebtDraftInput) {
      const { data, error } = await supabase.rpc("telegram_put_debt_draft", {
        p_telegram_user_id: input.telegramUserId,
        p_chat_id: input.chatId,
        p_name: input.name,
        p_amount_minor: Number(input.amountMinor),
        p_currency: input.currency,
      });
      if (error) return { ok: false, error: "failed" };
      return readDebtDraft(data);
    },
    async listDebts(telegramUserId) {
      const { data, error } = await supabase.rpc("telegram_list_debts", {
        p_telegram_user_id: telegramUserId,
      });
      if (error) return { ok: false };
      return readListDebts(data);
    },
    async beginDebtPayment(telegramUserId, chatId, debtId) {
      const { data, error } = await supabase.rpc("telegram_begin_debt_payment", {
        p_telegram_user_id: telegramUserId,
        p_chat_id: chatId,
        p_debt_id: debtId,
      });
      if (error) return { ok: false, error: "failed" };
      return readBeginDebtPayment(data);
    },
    async answerDebtPayment(telegramUserId, draftId, amountMinor) {
      const { data, error } = await supabase.rpc("telegram_answer_debt_payment", {
        p_telegram_user_id: telegramUserId,
        p_draft_id: draftId,
        p_amount_minor: Number(amountMinor),
      });
      if (error) return { ok: false, error: "failed" };
      return readAnswerDebtPayment(data);
    },
    async listGoals(telegramUserId) {
      const { data, error } = await supabase.rpc("telegram_list_goals", {
        p_telegram_user_id: telegramUserId,
      });
      if (error) return { ok: false };
      return readListGoals(data);
    },
    async beginGoalContribution(telegramUserId, chatId, goalId) {
      const { data, error } = await supabase.rpc("telegram_begin_goal_contribution", {
        p_telegram_user_id: telegramUserId,
        p_chat_id: chatId,
        p_goal_id: goalId,
      });
      if (error) return { ok: false, error: "failed" };
      return readBeginGoalContribution(data);
    },
    async answerGoalContribution(telegramUserId, draftId, enteredAmountMinor, enteredCurrency, goalCurrency) {
      let finalAmountMinor = enteredAmountMinor;
      let entered: { amountMinor: bigint; currency: CurrencyCode } | null = null;

      if (enteredCurrency !== goalCurrency) {
        // Misma selección de tasa que listRates()/getLatestRate (lib/money/rates.ts):
        // se agrupa por par y fecha, y pickLatest elige la primaria sobre el
        // respaldo. La fecha es la de hoy, como el resto del aporte.
        const { data: rows, error: ratesError } = await supabase
          .from("exchange_rates")
          .select("base, quote, rate, as_of, fetched_at, source")
          .order("as_of", { ascending: false });
        if (ratesError || !rows) return { ok: false, error: "failed" };
        const groups = new Map<string, typeof rows>();
        for (const row of rows) {
          const key = `${row.base}/${row.quote}/${row.as_of}`;
          const group = groups.get(key);
          if (group) group.push(row);
          else groups.set(key, [row]);
        }
        const rates = [...groups.values()]
          .map((group) => pickLatest(group))
          .filter((rate): rate is Rate => rate !== null);
        const today = new Date().toISOString().slice(0, 10);
        const rate = rateAt(rates, enteredCurrency, goalCurrency, today);
        if (!rate) return { ok: false, error: "rate_unavailable" };
        finalAmountMinor = convert(money(enteredAmountMinor, enteredCurrency), goalCurrency, rate).amountMinor;
        entered = { amountMinor: enteredAmountMinor, currency: enteredCurrency };
      }

      const { data, error } = await supabase.rpc("telegram_answer_goal_contribution", {
        p_telegram_user_id: telegramUserId,
        p_draft_id: draftId,
        p_amount_minor: Number(finalAmountMinor),
        // Nulables en SQL: sin conversión, no hay "entrado" que mostrar.
        p_entered_amount_minor: (entered ? Number(entered.amountMinor) : null) as number,
        p_entered_currency: (entered ? entered.currency : null) as string,
      });
      if (error) return { ok: false, error: "failed" };
      return readAnswerGoalContribution(data);
    },
    async pendingStep(telegramUserId) {
      const { data, error } = await supabase.rpc("telegram_pending_step", {
        p_telegram_user_id: telegramUserId,
      });
      if (error) return { ok: false };
      return readPendingStep(data);
    },
    async cancel(telegramUserId, draftId) {
      const { data, error } = await supabase.rpc("telegram_cancel_draft", {
        p_telegram_user_id: telegramUserId,
        p_draft_id: draftId,
      });
      if (error) return { ok: false, error: "failed" };
      return readAction(data);
    },
    async undo(telegramUserId) {
      const { data, error } = await supabase.rpc("telegram_undo", {
        p_telegram_user_id: telegramUserId,
      });
      if (error) return { ok: false, error: "failed" };
      return readAction(data);
    },
  };
}
