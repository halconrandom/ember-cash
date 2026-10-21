/**
 * Qué hace el bot con un update de Telegram: vincular, explicar, proponer
 * un borrador (transacción, suscripción o pago de un vencimiento) o
 * confirmarlo. No muestra saldos ni datos de otras personas. El dinero se
 * guarda solo al pulsar Guardar, con la misma RPC de la app en cada caso.
 */
import { formatMoney } from "@/lib/money/format";
import { money } from "@/lib/money/money";

import {
  parseSubscriptionCommand,
  parseTelegramMessage,
  type SubscriptionParseError,
  type TelegramParseError,
} from "./parse";
import { categoryLabel, fill, formatDay, telegramCopy } from "./text";
import type {
  ActionResult,
  ContextResult,
  DraftResult,
  OccurrenceDraftResult,
  SubscriptionDraftResult,
  TelegramGateway,
  TelegramSender,
} from "./types";

type MessageUpdate = {
  type: "message";
  telegramUserId: number;
  chatId: number;
  text: string;
};

type CallbackUpdate = {
  type: "callback";
  telegramUserId: number;
  chatId: number;
  messageId: number;
  callbackId: string;
  data: string;
};

type LinkedContext = Extract<ContextResult, { ok: true; linked: true }>;

const CODE = /^[a-f0-9]{64}$/;
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const CALLBACK = new RegExp(`^(save|cancel|pay):(${UUID})$`, "i");

function safeId(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) return null;
  return value;
}

function isPrivate(chat: unknown, userId: number): boolean {
  if (!chat || typeof chat !== "object") return false;
  const row = chat as { id?: unknown; type?: unknown };
  const chatId = safeId(row.id);
  if (chatId === null) return false;
  if (row.type === "private") return chatId === userId;
  // Sin type solo aceptamos el chat privado, donde el id es el del usuario.
  return row.type === undefined && chatId === userId;
}

/** Saca el mensaje o el botón. Ignora grupos, canales y updates sin autor. */
export function readUpdate(update: unknown): MessageUpdate | CallbackUpdate | null {
  if (!update || typeof update !== "object") return null;
  const row = update as { message?: unknown; callback_query?: unknown };

  if (row.callback_query && typeof row.callback_query === "object") {
    const query = row.callback_query as {
      id?: unknown;
      data?: unknown;
      from?: { id?: unknown };
      message?: { message_id?: unknown; chat?: unknown };
    };
    const telegramUserId = safeId(query.from?.id);
    const callbackId = typeof query.id === "string" ? query.id : "";
    const data = typeof query.data === "string" ? query.data : "";
    const messageId = safeId(query.message?.message_id);
    if (!telegramUserId || !callbackId || !data || !messageId) return null;
    if (!isPrivate(query.message?.chat, telegramUserId)) return null;
    return {
      type: "callback",
      telegramUserId,
      chatId: telegramUserId,
      messageId,
      callbackId,
      data,
    };
  }

  if (row.message && typeof row.message === "object") {
    const message = row.message as {
      text?: unknown;
      from?: { id?: unknown };
      chat?: unknown;
    };
    const telegramUserId = safeId(message.from?.id);
    const text = typeof message.text === "string" ? message.text : "";
    if (!telegramUserId || text.trim() === "") return null;
    if (!isPrivate(message.chat, telegramUserId)) return null;
    return { type: "message", telegramUserId, chatId: telegramUserId, text };
  }

  return null;
}

/** `rest` es todo lo que sigue al comando, sin recortar a una sola palabra. */
function commandOf(text: string): { name: string; rest: string } | null {
  const match = /^\/([a-z_]+)(?:@[A-Za-z0-9_]+)?(?:\s+(.*))?$/is.exec(text.trim());
  if (!match?.[1]) return null;
  return { name: match[1].toLowerCase(), rest: (match[2] ?? "").trim() };
}

/**
 * Atiende un update. Responde en el idioma del perfil (español si no hay
 * vínculo). Cualquier fallo de la base se dice con una frase genérica.
 */
export async function handleTelegramUpdate(
  update: unknown,
  gateway: TelegramGateway,
  sender: TelegramSender,
): Promise<void> {
  const incoming = readUpdate(update);
  if (!incoming) return;

  if (incoming.type === "callback") {
    // El botón deja de girar aunque después el cupo o la base fallen.
    await sender.answer(incoming.callbackId);
  }

  const limit = await gateway.consumeLimit(incoming.telegramUserId);
  const es = telegramCopy("es");
  if (!limit.ok) {
    await sender.send(incoming.chatId, es.failed);
    return;
  }
  if (!limit.allowed) {
    await sender.send(incoming.chatId, es.rateLimited);
    return;
  }

  if (incoming.type === "message") {
    const command = commandOf(incoming.text);
    if (command?.name === "start") {
      await handleStart(incoming, command.rest, gateway, sender);
      return;
    }
    if (command?.name === "ayuda" || command?.name === "help") {
      await handleHelp(incoming, gateway, sender);
      return;
    }
  }

  const context = await gateway.context(incoming.telegramUserId);
  if (!context.ok) {
    await sender.send(incoming.chatId, es.failed);
    return;
  }
  if (!context.linked) {
    await sender.send(incoming.chatId, es.linkHelp);
    return;
  }

  const copy = telegramCopy(context.locale);

  if (incoming.type === "message") {
    const command = commandOf(incoming.text);
    if (command?.name === "deshacer" || command?.name === "undo") {
      const result = await gateway.undo(incoming.telegramUserId);
      await sender.send(incoming.chatId, undoText(result, copy, es));
      return;
    }
    if (command?.name === "gasto") {
      await handleAmountCommand(incoming, context, "expense", command.rest, gateway, sender);
      return;
    }
    if (command?.name === "ingreso") {
      await handleAmountCommand(incoming, context, "income", command.rest, gateway, sender);
      return;
    }
    if (command?.name === "sub") {
      await handleSub(incoming, context, command.rest, gateway, sender);
      return;
    }
    if (command?.name === "pagar") {
      await handlePagar(incoming, context, gateway, sender);
      return;
    }
    await propose(incoming, context, gateway, sender);
    return;
  }

  const match = CALLBACK.exec(incoming.data);
  if (!match) {
    await sender.send(incoming.chatId, copy.failed);
    return;
  }
  const action = match[1]?.toLowerCase();
  const id = match[2] ?? "";
  if (action === "pay") {
    const draft = await gateway.putOccurrenceDraft(incoming.telegramUserId, incoming.chatId, id);
    if (!draft.ok) {
      await sender.edit(incoming.chatId, incoming.messageId, occurrenceDraftText(draft, copy));
      return;
    }
    const amount = formatMoney(money(draft.amountMinor, draft.currency), context.locale);
    await sender.edit(
      incoming.chatId,
      incoming.messageId,
      fill(copy.paySummary, {
        name: draft.name,
        amount,
        date: formatDay(draft.dueOn, context.locale),
        confirm: copy.confirm,
      }),
      [
        { label: copy.save, data: `save:${draft.draftId}` },
        { label: copy.cancel, data: `cancel:${draft.draftId}` },
      ],
    );
    return;
  }
  if (action === "save") {
    const result = await gateway.commit(incoming.telegramUserId, id);
    await sender.edit(incoming.chatId, incoming.messageId, commitText(result, copy));
    return;
  }
  const result = await gateway.cancel(incoming.telegramUserId, id);
  await sender.edit(incoming.chatId, incoming.messageId, cancelText(result, copy));
}

async function handleStart(
  incoming: MessageUpdate,
  code: string,
  gateway: TelegramGateway,
  sender: TelegramSender,
): Promise<void> {
  const es = telegramCopy("es");
  if (code === "") {
    const context = await gateway.context(incoming.telegramUserId);
    const copy = context.ok && context.linked ? telegramCopy(context.locale) : es;
    await sender.send(
      incoming.chatId,
      context.ok && context.linked ? copy.alreadyLinked : es.linkHelp,
    );
    return;
  }
  const lower = code.toLowerCase();
  if (!CODE.test(lower)) {
    await sender.send(incoming.chatId, es.codeInvalid);
    return;
  }
  const result = await gateway.link(incoming.telegramUserId, incoming.chatId, lower);
  const context = result.ok ? await gateway.context(incoming.telegramUserId) : null;
  const copy = context && context.ok && context.linked ? telegramCopy(context.locale) : es;
  await sender.send(incoming.chatId, linkText(result, copy, es));
}

async function handleHelp(
  incoming: MessageUpdate,
  gateway: TelegramGateway,
  sender: TelegramSender,
): Promise<void> {
  const context = await gateway.context(incoming.telegramUserId);
  const copy = context.ok && context.linked ? telegramCopy(context.locale) : telegramCopy("es");
  await sender.send(incoming.chatId, copy.help);
}

/** Texto libre, igual que en T1. */
async function propose(
  incoming: MessageUpdate,
  context: LinkedContext,
  gateway: TelegramGateway,
  sender: TelegramSender,
): Promise<void> {
  const copy = telegramCopy(context.locale);
  if (!context.hasAccount) {
    await sender.send(incoming.chatId, copy.noAccount);
    return;
  }
  const parsed = parseTelegramMessage(incoming.text, {
    enabled: context.enabled,
    defaultCurrency: context.defaultCurrency,
  });
  if (!parsed.ok) {
    await sender.send(incoming.chatId, parseText(parsed.error, copy));
    return;
  }
  const draft = await gateway.putDraft({
    telegramUserId: incoming.telegramUserId,
    chatId: incoming.chatId,
    kind: parsed.value.kind,
    amountMinor: parsed.value.amountMinor,
    currency: parsed.value.currency,
    categoryKey: parsed.value.categoryKey,
    description: parsed.value.description,
  });
  await sendTransactionDraft(incoming, draft, context, copy, sender);
}

/** /gasto e /ingreso: mismo parser, sin adivinar el tipo. */
async function handleAmountCommand(
  incoming: MessageUpdate,
  context: LinkedContext,
  forcedKind: "expense" | "income",
  rest: string,
  gateway: TelegramGateway,
  sender: TelegramSender,
): Promise<void> {
  const copy = telegramCopy(context.locale);
  if (!context.hasAccount) {
    await sender.send(incoming.chatId, copy.noAccount);
    return;
  }
  const parsed = parseTelegramMessage(
    rest,
    { enabled: context.enabled, defaultCurrency: context.defaultCurrency },
    forcedKind,
  );
  if (!parsed.ok) {
    await sender.send(incoming.chatId, parseText(parsed.error, copy));
    return;
  }
  const draft = await gateway.putDraft({
    telegramUserId: incoming.telegramUserId,
    chatId: incoming.chatId,
    kind: forcedKind,
    amountMinor: parsed.value.amountMinor,
    currency: parsed.value.currency,
    categoryKey: parsed.value.categoryKey,
    description: parsed.value.description,
  });
  await sendTransactionDraft(incoming, draft, context, copy, sender);
}

async function sendTransactionDraft(
  incoming: MessageUpdate,
  draft: DraftResult,
  context: LinkedContext,
  copy: ReturnType<typeof telegramCopy>,
  sender: TelegramSender,
): Promise<void> {
  if (!draft.ok) {
    await sender.send(incoming.chatId, draftText(draft, copy));
    return;
  }
  const amount = formatMoney(money(draft.amountMinor, draft.currency), context.locale);
  await sender.send(
    incoming.chatId,
    fill(copy.summary, {
      kind: draft.kind === "income" ? copy.income : copy.expense,
      amount,
      category: categoryLabel(context.locale, draft.categoryKey),
      description: draft.description,
      account: draft.accountName,
      date: formatDay(draft.occurredOn, context.locale),
      confirm: copy.confirm,
    }),
    [
      { label: copy.save, data: `save:${draft.draftId}` },
      { label: copy.cancel, data: `cancel:${draft.draftId}` },
    ],
  );
}

/** /sub <monto> [moneda] <nombre> [mensual|anual|semanal] [día]. */
async function handleSub(
  incoming: MessageUpdate,
  context: LinkedContext,
  rest: string,
  gateway: TelegramGateway,
  sender: TelegramSender,
): Promise<void> {
  const copy = telegramCopy(context.locale);
  const parsed = parseSubscriptionCommand(rest, {
    enabled: context.enabled,
    defaultCurrency: context.defaultCurrency,
  });
  if (!parsed.ok) {
    await sender.send(incoming.chatId, subParseText(parsed.error, copy));
    return;
  }
  const draft = await gateway.putSubscriptionDraft({
    telegramUserId: incoming.telegramUserId,
    chatId: incoming.chatId,
    name: parsed.value.name,
    amountMinor: parsed.value.amountMinor,
    currency: parsed.value.currency,
    frequency: parsed.value.frequency,
    dayOfMonth: parsed.value.dayOfMonth,
  });
  if (!draft.ok) {
    await sender.send(incoming.chatId, subDraftText(draft, copy));
    return;
  }
  const amount = formatMoney(money(draft.amountMinor, draft.currency), context.locale);
  await sender.send(
    incoming.chatId,
    fill(copy.subSummary, {
      name: draft.name,
      amount,
      frequency: freqLabel(draft.frequency, copy),
      nextCharge: formatDay(draft.nextCharge, context.locale),
      confirm: copy.confirm,
    }),
    [
      { label: copy.save, data: `save:${draft.draftId}` },
      { label: copy.cancel, data: `cancel:${draft.draftId}` },
    ],
  );
}

/** /pagar: hasta 5 vencimientos, un botón por fila. */
async function handlePagar(
  incoming: MessageUpdate,
  context: LinkedContext,
  gateway: TelegramGateway,
  sender: TelegramSender,
): Promise<void> {
  const copy = telegramCopy(context.locale);
  const result = await gateway.dueOccurrences(incoming.telegramUserId);
  if (!result.ok || result.items.length === 0) {
    await sender.send(incoming.chatId, copy.noDue);
    return;
  }
  const buttons = result.items.map((item) => ({
    label: `${item.name} · ${formatMoney(money(item.amountMinor, item.currency), context.locale)} · ${formatDay(item.dueOn, context.locale)}`,
    data: `pay:${item.occurrenceId}`,
  }));
  await sender.send(incoming.chatId, copy.payPrompt, buttons);
}

function freqLabel(
  frequency: "weekly" | "monthly" | "yearly",
  copy: ReturnType<typeof telegramCopy>,
): string {
  if (frequency === "weekly") return copy.freqWeekly;
  if (frequency === "yearly") return copy.freqYearly;
  return copy.freqMonthly;
}

function parseText(error: TelegramParseError, copy: ReturnType<typeof telegramCopy>): string {
  if (error === "too_many_decimals") return copy.tooManyDecimals;
  if (error === "currency_disabled") return copy.currencyDisabled;
  if (error === "too_large") return copy.tooLarge;
  if (error === "not_positive") return copy.notPositive;
  return copy.notUnderstood;
}

function subParseText(
  error: SubscriptionParseError,
  copy: ReturnType<typeof telegramCopy>,
): string {
  if (error === "too_many_decimals") return copy.tooManyDecimals;
  if (error === "currency_disabled") return copy.currencyDisabled;
  if (error === "too_large") return copy.tooLarge;
  if (error === "not_positive") return copy.notPositive;
  if (error === "name_required") return copy.subNameRequired;
  if (error === "invalid_day") return copy.subInvalidDay;
  if (error === "day_only_monthly") return copy.subDayOnlyMonthly;
  return copy.subInvalid;
}

function subDraftText(
  result: Extract<SubscriptionDraftResult, { ok: false }>,
  copy: ReturnType<typeof telegramCopy>,
): string {
  if (result.error === "currency_disabled") return copy.currencyDisabled;
  if (result.error === "day_only_monthly") return copy.subDayOnlyMonthly;
  if (result.error === "not_linked") return copy.linkHelp;
  if (result.error === "invalid") return copy.subInvalid;
  return copy.failed;
}

function occurrenceDraftText(
  result: Extract<OccurrenceDraftResult, { ok: false }>,
  copy: ReturnType<typeof telegramCopy>,
): string {
  if (result.error === "not_found") return copy.payNotFound;
  if (result.error === "no_account") return copy.noAccount;
  if (result.error === "not_linked") return copy.linkHelp;
  return copy.failed;
}

function draftText(
  result: Extract<DraftResult, { ok: false }>,
  copy: ReturnType<typeof telegramCopy>,
): string {
  if (result.error === "no_account") return copy.noAccount;
  if (result.error === "currency_disabled") return copy.currencyDisabled;
  if (result.error === "not_linked") return copy.linkHelp;
  return copy.failed;
}

function linkText(
  result: Awaited<ReturnType<TelegramGateway["link"]>>,
  copy: ReturnType<typeof telegramCopy>,
  es: ReturnType<typeof telegramCopy>,
): string {
  if (result.ok) return copy.linkedOk;
  if (result.error === "expired") return es.codeExpired;
  if (result.error === "used") return es.codeUsed;
  if (result.error === "invalid") return es.codeInvalid;
  if (result.error === "taken") return es.codeTaken;
  return es.failed;
}

function commitText(result: ActionResult, copy: ReturnType<typeof telegramCopy>): string {
  if (result.ok) return result.already ? copy.alreadySaved : copy.saved;
  if (result.error === "expired") return copy.draftExpired;
  if (result.error === "not_linked") return copy.linkHelp;
  return copy.failed;
}

function cancelText(result: ActionResult, copy: ReturnType<typeof telegramCopy>): string {
  if (result.ok) return copy.cancelled;
  if (result.error === "already_saved") return copy.alreadySaved;
  if (result.error === "not_linked") return copy.linkHelp;
  return copy.failed;
}

function undoText(
  result: ActionResult,
  copy: ReturnType<typeof telegramCopy>,
  es: ReturnType<typeof telegramCopy>,
): string {
  if (result.ok) return copy.undoOk;
  if (result.error === "nothing") return copy.undoNone;
  if (result.error === "cannot_undo") return copy.cannotUndo;
  if (result.error === "not_linked") return es.linkHelp;
  return copy.failed;
}
