/**
 * Adaptador de las RPC del bot. El cliente de servicio solo ejecuta
 * funciones: las tablas no le están concedidas. Si la llamada falla, se
 * cierra (no se guarda ni se deja pasar el límite).
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/types";

import {
  readAction,
  readContext,
  readDraft,
  readDueOccurrences,
  readLimit,
  readLink,
  readOccurrenceDraft,
  readSubscriptionDraft,
} from "./read";
import type { DraftInput, SubscriptionDraftInput, TelegramGateway } from "./types";

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
